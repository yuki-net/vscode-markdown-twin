import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import {
  ITranslationProvider,
  PROVIDER_DISPLAY_NAMES,
  normalizeProviderId,
  providerRequiresApiKey,
} from './providers/ITranslationProvider';
import { AzureRegionError } from './providers/microsoftProvider';
import { TooManyRequestsError } from './providers/httpError';
import { ApiKeyManager } from './apiKeyManager';
import { StatusBar } from './statusBar';
import { shouldTranslate, splitTranslatableParts, joinTranslatedParts, EXCLUDED_TOKEN_TYPES } from './languageDetector';
import { resolveSourceLanguageCode } from './languages';
import { t } from './i18n';
import { PreviewPanel } from './previewPanel';
import { buildTranslatedMarkdown, type TranslatedMarkdownResult, type TranslationViewMode } from './translatedMarkdownBuilder';
import { createTranslationProvider } from './providers/providerFactory';
import { TranslationCache } from './translationCache';

export class TranslationManager implements vscode.Disposable {
  private cache = new TranslationCache();
  private activeDocumentUris = new Set<string>();
  private currentMode: TranslationViewMode = 'translation-only';
  private statusBar: StatusBar | null = null;
  private md = new MarkdownIt();
  private translationSessionIds = new Map<string, number>();
  private currentSourceLang = 'auto';
  private outputChannel = vscode.window.createOutputChannel('Markdown Twin');

  private onTranslationUpdatedEmitter = new vscode.EventEmitter<vscode.Uri | undefined>();
  readonly onTranslationUpdated = this.onTranslationUpdatedEmitter.event;

  constructor(private apiKeyManager: ApiKeyManager) {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const rawMode = config.get<string>('defaultMode') ?? 'Translation Only';
    this.currentMode = rawMode === 'Bilingual' ? 'bilingual' : 'translation-only';
    this.logInfo('Markdown Twin active.');
  }

  logWarning(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] [WARN]  ${message}`);
  }

  logError(message: string, error?: any, showOutputHint = true): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${message}`);
    if (error) {
      this.outputChannel.appendLine(error.stack ?? String(error));
    }
    const suffix = showOutputHint ? t('showOutputHint') : '';
    vscode.window.showErrorMessage(`Markdown Twin: ${message}${suffix}`);
    this.outputChannel.show(true);
  }

  logInfo(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
  }

  dispose(): void {
    this.debounceTimers.forEach(clearTimeout);
    this.debounceTimers.clear();
    this.outputChannel.dispose();
    this.onTranslationUpdatedEmitter.dispose();
  }

  setStatusBar(statusBar: StatusBar) {
    this.statusBar = statusBar;
  }

  isActive(): boolean {
    return this.activeDocumentUris.size > 0;
  }

  isDocumentActive(uri: vscode.Uri): boolean {
    return this.activeDocumentUris.has(uri.toString());
  }

  getMode(): TranslationViewMode {
    return this.currentMode;
  }

  async toggleMode(): Promise<void> {
    this.currentMode = this.currentMode === 'translation-only' ? 'bilingual' : 'translation-only';
    const configValue = this.currentMode === 'bilingual' ? 'Bilingual' : 'Translation Only';
    await vscode.workspace
      .getConfiguration('markdownTwin')
      .update('defaultMode', configValue, vscode.ConfigurationTarget.Global);
    this.statusBar?.update(this.currentMode);
    this.onTranslationUpdatedEmitter.fire(undefined);
  }

  getTranslation(uri: vscode.Uri, originalContent: string, langCode: string): string | null {
    const parts = splitTranslatableParts(originalContent, this.currentSourceLang);
    const translationSlice = new Map<number, string>();
    let transOffset = 0;

    let allTranslated = true;
    for (const part of parts) {
      if (part.translate) {
        const cached = this.cache.get(uri, langCode, part.text);
        if (cached !== undefined) {
          translationSlice.set(transOffset, cached);
        } else {
          allTranslated = false;
        }
        transOffset++;
      }
    }

    if (!allTranslated) return null;
    return joinTranslatedParts(parts, translationSlice);
  }

  async startTranslation(document: vscode.TextDocument, overrideProvider?: string): Promise<boolean> {
    if (document.languageId !== 'markdown') {
      this.logWarning(`Skip translation for non-markdown document: ${document.uri.toString()}`);
      return false;
    }

    const docUriStr = document.uri.toString();
    const panelsForDoc = Array.from(PreviewPanel.allPanels.values()).filter(
      p => p.editorDocumentUri.toString() === docUriStr
    );
    if (panelsForDoc.length === 0) {
      this.logWarning(`Skip translation without an open Twin panel: ${docUriStr}`);
      this.stopDocumentTranslation(document.uri);
      return false;
    }

    const sessionId = this.beginDocumentSession(document.uri);

    const config = vscode.workspace.getConfiguration('markdownTwin');
    const providerId = normalizeProviderId(overrideProvider ?? config.get<string>('provider'));
    this.statusBar?.setActiveProvider(providerId);

    const sourceLang = resolveSourceLanguageCode(config.get<string>('sourceLanguage') ?? 'auto');
    this.currentSourceLang = sourceLang;
    const batchSize = normalizeBatchSize(config.get<number>('batchSize'));

    const targetLangs = panelsForDoc.map(p => p.langCode);
    this.logInfo(
      `Start translation: provider=${providerId}, source=${sourceLang}, targets=${targetLangs.join(',')}, uri=${document.uri.toString()}`
    );

    if (providerRequiresApiKey(providerId)) {
      const key = await this.apiKeyManager.getKey(providerId);
      if (!key) {
        const displayName = PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
        this.logError(t('apiKeyNotSetForProvider', displayName), undefined, false);
        this.statusBar?.showError();
        return this.failStartTranslation(document.uri, sessionId);
      }
    }

    const provider = await createTranslationProvider(providerId, this.apiKeyManager);
    if (!provider) {
      this.statusBar?.showError();
      return this.failStartTranslation(document.uri, sessionId);
    }
    if (!this.isCurrentDocumentSession(document.uri, sessionId)) {
      return false;
    }

    this.activeDocumentUris.add(docUriStr);
    const currentTexts = this.extractTranslatableTexts(document, sourceLang);
    const { langToTranslateMap, totalCount } = this.cache.preparePendingTranslations(
      document.uri, targetLangs, currentTexts
    );
    this.logInfo(
      `Translation queue: uniqueTexts=${currentTexts.size}, totalPending=${totalCount}, targets=${targetLangs.join(',')}`
    );

    if (totalCount === 0) {
      this.logWarning(`No pending translations for ${document.uri.toString()}`);
      this.statusBar?.showComplete(this.currentMode);
      this.onTranslationUpdatedEmitter.fire(document.uri);
      return true;
    }

    return this.executeTranslationLoop(
      sessionId,
      provider,
      PROVIDER_DISPLAY_NAMES[providerId] ?? providerId,
      document.uri,
      sourceLang,
      targetLangs,
      langToTranslateMap,
      totalCount,
      batchSize
    );
  }

  private failStartTranslation(documentUri: vscode.Uri, sessionId: number): false {
    if (this.isCurrentDocumentSession(documentUri, sessionId)) {
      this.activeDocumentUris.delete(documentUri.toString());
      if (!this.isActive()) {
        this.statusBar?.setActiveProvider(null);
      }
      this.onTranslationUpdatedEmitter.fire(documentUri);
    }
    return false;
  }

  private extractTranslatableTexts(document: vscode.TextDocument, sourceLang: string): Set<string> {
    const text = document.getText();
    const tokens = this.md.parse(text, {});
    const result = new Set<string>();

    for (const token of tokens) {
      if (EXCLUDED_TOKEN_TYPES.includes(token.type as any)) continue;
      if (token.type !== 'inline' || !shouldTranslate(token.content, sourceLang)) continue;

      const parts = splitTranslatableParts(token.content, sourceLang);
      for (const part of parts) {
        if (part.translate) result.add(part.text);
      }
    }

    return result;
  }

  private async executeTranslationLoop(
    sessionId: number,
    provider: ITranslationProvider,
    providerName: string,
    documentUri: vscode.Uri,
    sourceLang: string,
    targetLangs: string[],
    langToTranslateMap: Map<string, string[]>,
    totalCount: number,
    batchSize: number
  ): Promise<boolean> {
    let accumulatedDone = 0;
    let fatalError = false;
    this.statusBar?.showProgress(accumulatedDone, totalCount);
    this.onTranslationUpdatedEmitter.fire(documentUri);

    for (const targetLang of targetLangs) {
      if (fatalError || !this.isDocumentActive(documentUri) || !this.isCurrentDocumentSession(documentUri, sessionId)) break;
      const textsToTranslate = langToTranslateMap.get(targetLang) ?? [];
      if (textsToTranslate.length === 0) continue;

      const docCache = this.cache.ensureDocumentCache(documentUri, targetLang);

      for (let i = 0; i < textsToTranslate.length; i += batchSize) {
        if (fatalError || !this.isDocumentActive(documentUri) || !this.isCurrentDocumentSession(documentUri, sessionId)) break;
        const batch = textsToTranslate.slice(i, i + batchSize);
        this.logInfo(
          `Translating batch: provider=${providerName}, target=${targetLang}, size=${batch.length}, offset=${i}`
        );

        try {
          const translated = await provider.translate(batch, sourceLang, targetLang);
          for (let k = 0; k < batch.length; k++) {
            docCache.set(batch[k], translated[k] ?? batch[k]);
          }
        } catch (err: any) {
          if (err instanceof AzureRegionError) {
            const timestamp = new Date().toLocaleTimeString();
            this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${err.message}`);
            fatalError = true;
            this.statusBar?.showError();
            const action = await vscode.window.showErrorMessage(
              t('azureRegionError', err.region ?? 'unknown'),
              t('openSettings')
            );
            if (action === t('openSettings')) {
              void vscode.commands.executeCommand('workbench.action.openSettings', 'markdownTwin.azureRegion');
            }
          } else if (err instanceof TooManyRequestsError) {
            this.logWarning(t('rateLimitReached'));
            this.statusBar?.showError();
            for (const text of batch) {
              docCache.set(text, text);
            }
          } else {
            this.logError(t('translationFailed', providerName, targetLang), err);
            for (const text of batch) {
              docCache.set(text, text);
            }
          }
        }

        if (fatalError || !this.isCurrentDocumentSession(documentUri, sessionId)) break;

        accumulatedDone += batch.length;
        this.statusBar?.showProgress(accumulatedDone, totalCount);
        this.onTranslationUpdatedEmitter.fire(documentUri);
      }
    }
    if (!fatalError && this.isDocumentActive(documentUri) && this.isCurrentDocumentSession(documentUri, sessionId)) {
      this.statusBar?.showComplete(this.currentMode);
      return true;
    }

    if (fatalError && this.isCurrentDocumentSession(documentUri, sessionId)) {
      this.activeDocumentUris.delete(documentUri.toString());
    }

    return false;
  }

  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  invalidateCache(uri: vscode.Uri): void {
    if (this.isDocumentActive(uri) && this.hasOpenPanelForDocument(uri)) {
      const uriStr = uri.toString();
      const existing = this.debounceTimers.get(uriStr);
      if (existing) {
        clearTimeout(existing);
      }

      const delay = (vscode.workspace.getConfiguration('markdownTwin').get<number>('debounceDelay') ?? 2) * 1000;
      const timer = setTimeout(() => {
        this.debounceTimers.delete(uriStr);
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriStr);
        if (doc && this.isDocumentActive(uri) && this.hasOpenPanelForDocument(uri)) {
          void this.startTranslation(doc);
        }
      }, delay);
      this.debounceTimers.set(uriStr, timer);
    }
  }

  closeDocument(uri: vscode.Uri): void {
    this.stopDocumentTranslation(uri);
  }

  stopDocumentTranslation(uri: vscode.Uri): void {
    const uriStr = uri.toString();
    const timer = this.debounceTimers.get(uriStr);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(uriStr);
    }

    this.activeDocumentUris.delete(uriStr);
    this.translationSessionIds.set(uriStr, (this.translationSessionIds.get(uriStr) ?? 0) + 1);

    const count = this.cache.releaseDocument(uri);

    if (count > 0) {
      this.logInfo(`Cache released for closed document (all languages): ${uri.toString()}`);
    }

    if (!this.isActive()) {
      this.statusBar?.setActiveProvider(null);
      this.statusBar?.showOffline();
    }
    this.onTranslationUpdatedEmitter.fire(uri);
  }

  stopTranslation(): void {
    this.activeDocumentUris.clear();
    this.invalidateAllDocumentSessions();
    this.debounceTimers.forEach(clearTimeout);
    this.debounceTimers.clear();
    this.cache.clear();
    this.statusBar?.setActiveProvider(null);
    this.statusBar?.showOffline();
    this.onTranslationUpdatedEmitter.fire(undefined);
  }

  clearAllCache(): void {
    this.invalidateAllDocumentSessions();
    this.cache.clear();
    this.onTranslationUpdatedEmitter.fire(undefined);
  }

  clearDocumentCache(uri: vscode.Uri): void {
    this.cache.clearDocument(uri);
    this.onTranslationUpdatedEmitter.fire(uri);
  }

  private beginDocumentSession(uri: vscode.Uri): number {
    const uriStr = uri.toString();
    const sessionId = (this.translationSessionIds.get(uriStr) ?? 0) + 1;
    this.translationSessionIds.set(uriStr, sessionId);
    return sessionId;
  }

  private isCurrentDocumentSession(uri: vscode.Uri, sessionId: number): boolean {
    return this.translationSessionIds.get(uri.toString()) === sessionId;
  }

  private invalidateAllDocumentSessions(): void {
    for (const [uriStr, sessionId] of this.translationSessionIds) {
      this.translationSessionIds.set(uriStr, sessionId + 1);
    }
  }

  private hasOpenPanelForDocument(uri: vscode.Uri): boolean {
    const uriStr = uri.toString();
    return Array.from(PreviewPanel.allPanels.values()).some(
      panel => panel.editorDocumentUri.toString() === uriStr
    );
  }

  generateTranslatedMarkdown(
    document: vscode.TextDocument,
    langCode: string,
    mode: TranslationViewMode = this.getMode()
  ): TranslatedMarkdownResult {
    const docCache = this.cache.getDocumentCache(document.uri, langCode);
    if (!docCache || docCache.size === 0) {
      const text = document.getText();
      const lineCount = text.split(/\r?\n/).length;
      return {
        text,
        lineOrigins: Array.from({ length: lineCount }, (_, index) => index),
      };
    }

    return buildTranslatedMarkdown({
      document,
      langCode,
      mode,
      md: this.md,
      getTranslation: (content, code) => this.getTranslation(document.uri, content, code),
    });
  }

}

export function normalizeBatchSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 10;
  }

  return Math.max(1, Math.floor(value));
}
