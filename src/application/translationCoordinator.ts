import MarkdownIt from 'markdown-it';
import { normalizeProviderId } from '../domain/provider';
import { shouldTranslate, splitTranslatableParts, joinTranslatedParts, EXCLUDED_TOKEN_TYPES } from '../domain/markdown/extractTranslationUnits';
import { buildTranslatedMarkdown, type TranslationViewMode } from '../domain/markdown/translatedMarkdownBuilder';
import type { TranslatedMarkdownResult } from '../domain/translationResult';
import { InMemoryTranslationCache } from './inMemoryTranslationCache';
import { DocumentTranslationSession, type TranslationRun } from './documentTranslationSession';
import type { TranslationTargetRegistry } from '../ports/translationTargetRegistry';
import { createTranslationCacheKey, type TranslationSpec } from '../domain/translationSpec';
import type { TranslationSettingsRepository } from '../ports/settingsRepository';
import type { TranslationStatusSink } from '../ports/translationStatusSink';
import { normalizeBatchSize } from '../domain/translationSettings';
import type { TranslationProviderFactory } from '../ports/translationProviderFactory';
import { TranslationExecutor } from './translationExecutor';
import { TranslationStore, type DocumentTranslationState } from './translationStore';
import type { TranslationFailure } from '../domain/translationStatus';
import {
  InvalidTranslationResponseError,
  MissingProviderCredentialError,
  ProviderConfigurationError,
  ProviderRateLimitError,
} from '../domain/translationError';
import type { TranslationDocument } from '../domain/translationDocument';
import type { TranslationDiagnostics } from '../ports/translationDiagnostics';
import { SimpleEvent } from './translationEvents';

export class TranslationCoordinator {
  private cache = new InMemoryTranslationCache();
  private currentMode: TranslationViewMode = 'translation-only';
  private statusBar: TranslationStatusSink | null = null;
  private md = new MarkdownIt();
  private translationSessions = new Map<string, DocumentTranslationSession>();
  private readonly stateStore = new TranslationStore();
  private readonly executor = new TranslationExecutor();

  private readonly translationUpdated = new SimpleEvent<string | undefined>();
  readonly onTranslationUpdated = this.translationUpdated.subscribe;

  constructor(
    private translationTargets: TranslationTargetRegistry,
    private settings: TranslationSettingsRepository,
    private providerFactory: TranslationProviderFactory,
    private diagnostics: TranslationDiagnostics
  ) {
    this.currentMode = settings.get().defaultMode;
    this.diagnostics.info('Markdown Twin active.');
  }

  logWarning(message: string): void {
    this.diagnostics.warning(message);
  }

  logError(message: string, error?: unknown, showOutputHint = true): void {
    void this.diagnostics.report({ kind: 'unexpected', message, error, showOutputHint });
  }

  logInfo(message: string): void {
    this.diagnostics.info(message);
  }

  dispose(): void {
    this.stopTranslation();
    this.translationUpdated.dispose();
  }

  setStatusBar(statusBar: TranslationStatusSink) {
    this.statusBar = statusBar;
  }

  isActive(): boolean {
    return this.stateStore.isAnyEnabled();
  }

  isDocumentActive(documentId: string): boolean {
    return this.stateStore.isEnabled(documentId);
  }

  getDocumentState(documentId: string): DocumentTranslationState | undefined {
    return this.stateStore.get(documentId);
  }

  getMode(): TranslationViewMode {
    return this.currentMode;
  }

  async toggleMode(): Promise<void> {
    this.currentMode = this.currentMode === 'translation-only' ? 'bilingual' : 'translation-only';
    await this.settings.update({ defaultMode: this.currentMode });
    this.statusBar?.update(this.currentMode);
    this.translationUpdated.fire(undefined);
  }

  getTranslation(documentId: string, originalContent: string, langCode: string): string | null {
    const spec = this.stateStore.get(documentId)?.spec;
    if (!spec) return null;
    const parts = splitTranslatableParts(originalContent, spec.sourceLanguage);
    const cacheKey = createTranslationCacheKey(spec, langCode);
    const translationSlice = new Map<number, string>();
    let transOffset = 0;

    let allTranslated = true;
    for (const part of parts) {
      if (part.translate) {
        const cached = this.cache.get(documentId, cacheKey, part.text);
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

  async startTranslation(document: TranslationDocument, overrideProvider?: string): Promise<boolean> {
    if (document.languageId !== 'markdown') {
      this.logWarning(`Skip translation for non-markdown document: ${document.id}`);
      return false;
    }

    const docUriStr = document.id;
    const targetLangs = [...this.translationTargets.getTargetLanguages(docUriStr)];
    if (targetLangs.length === 0) {
      this.logWarning(`Skip translation without an open Twin panel: ${docUriStr}`);
      this.stopDocumentTranslation(document.id);
      return false;
    }

    const session = this.ensureDocumentSession(document.id);
    const run = session.begin();

    const settings = this.settings.get();
    const providerId = normalizeProviderId(overrideProvider ?? settings.providerId);
    const providerName = this.providerFactory.getMetadata(providerId)?.displayName ?? providerId;
    this.statusBar?.setActiveProvider(providerId);

    const sourceLang = settings.sourceLanguage;
    const batchSize = settings.batchSize;
    const spec: TranslationSpec = {
      providerId,
      sourceLanguage: sourceLang,
      targetLanguages: targetLangs,
      providerOptionsKey: providerId === 'microsoft'
        ? `region:${settings.azureRegion}`
        : 'default',
    };
    this.stateStore.enable(docUriStr, spec);

    this.logInfo(
      `Start translation: provider=${providerId}, source=${sourceLang}, targets=${targetLangs.join(',')}, uri=${document.id}`
    );

    let provider;
    try {
      provider = await this.providerFactory.create(providerId, {
        azureRegion: settings.azureRegion,
      });
    } catch (error: unknown) {
      if (error instanceof MissingProviderCredentialError) {
        const message = `Missing credentials for ${providerName}`;
        this.stateStore.setStatus(docUriStr, {
          kind: 'failed',
          error: { kind: 'authentication', message },
        });
        await this.diagnostics.report({ kind: 'missing-credentials', providerName });
        this.statusBar?.showError(docUriStr, providerName);
        return this.failStartTranslation(document.id, session, run);
      }
      throw error;
    }
    if (!provider) {
      this.stateStore.setStatus(docUriStr, {
        kind: 'failed',
        error: { kind: 'provider', message: `Unknown provider: ${providerId}` },
      });
      this.statusBar?.showError(docUriStr, providerName);
      return this.failStartTranslation(document.id, session, run);
    }
    if (!session.isCurrent(run)) {
      return false;
    }

    const currentTexts = this.extractTranslatableTexts(document, sourceLang);
    const { langToTranslateMap, totalCount } = this.cache.preparePendingTranslations(
      document.id,
      targetLangs,
      currentTexts,
      targetLanguage => createTranslationCacheKey(spec, targetLanguage)
    );
    this.logInfo(
      `Translation queue: uniqueTexts=${currentTexts.size}, totalPending=${totalCount}, targets=${targetLangs.join(',')}`
    );

    if (totalCount === 0) {
      this.logWarning(`No pending translations for ${document.id}`);
      this.statusBar?.showComplete(docUriStr, this.currentMode, providerName, targetLangs);
      this.stateStore.setStatus(docUriStr, { kind: 'completed' });
      this.translationUpdated.fire(document.id);
      return true;
    }

    const result = await this.executor.execute({
      session,
      run,
      provider,
      sourceLanguage: sourceLang,
      targetLanguages: targetLangs,
      pendingByTarget: langToTranslateMap,
      totalCount,
      batchSize,
      isEnabled: () => this.isDocumentActive(document.id),
      commitBatch: (targetLanguage, sourceTexts, translatedTexts) => {
        const docCache = this.cache.ensureDocumentCache(
          document.id,
          createTranslationCacheKey(spec, targetLanguage)
        );
        for (let index = 0; index < sourceTexts.length; index++) {
          docCache.set(sourceTexts[index], translatedTexts[index]);
        }
      },
      onProgress: (completed, total) => {
        this.stateStore.setStatus(docUriStr, { kind: 'running', completed, total });
        this.statusBar?.showProgress(docUriStr, providerName, completed, total, targetLangs);
        this.translationUpdated.fire(document.id);
      },
    });

    if (result.kind === 'completed') {
      this.stateStore.setStatus(docUriStr, { kind: 'completed' });
      this.statusBar?.showComplete(docUriStr, this.currentMode, providerName, targetLangs);
      return true;
    }
    if (result.kind === 'failed') {
      this.stateStore.setStatus(docUriStr, {
        kind: 'failed',
        error: this.toTranslationFailure(result.error, result.targetLanguage),
      });
      await this.handleTranslationFailure(
        result.error,
        document.id,
        providerName,
        result.targetLanguage
      );
    }
    return false;
  }

  private failStartTranslation(
    documentId: string,
    session: DocumentTranslationSession,
    run: TranslationRun
  ): false {
    if (session.isCurrent(run)) {
      if (!this.isActive()) {
        this.statusBar?.setActiveProvider(null);
      }
      this.translationUpdated.fire(documentId);
    }
    return false;
  }

  private extractTranslatableTexts(document: TranslationDocument, sourceLang: string): Set<string> {
    const text = document.text;
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

  private async handleTranslationFailure(
    error: unknown,
    documentId: string,
    providerName: string,
    targetLanguage: string
  ): Promise<void> {
    this.statusBar?.showError(documentId, providerName);
    if (error instanceof ProviderConfigurationError && error.kind === 'azure-region') {
      await this.diagnostics.report({ kind: 'azure-region', region: error.value });
      return;
    }
    if (error instanceof ProviderRateLimitError) {
      await this.diagnostics.report({ kind: 'rate-limit' });
      return;
    }
    await this.diagnostics.report({
      kind: 'translation-failed',
      providerName,
      targetLanguage,
      error,
    });
  }

  private toTranslationFailure(error: unknown, targetLanguage: string): TranslationFailure {
    if (error instanceof InvalidTranslationResponseError) {
      return { kind: 'invalid-response', message: error.message, targetLanguage };
    }
    if (error instanceof ProviderRateLimitError) {
      return { kind: 'rate-limit', message: error.message, targetLanguage };
    }
    return {
      kind: 'provider',
      message: error instanceof Error ? error.message : String(error),
      targetLanguage,
    };
  }

  getDebounceDelayMs(): number {
    return this.settings.get().debounceDelayMs;
  }

  canRerunDocument(documentId: string): boolean {
    return this.isDocumentActive(documentId) && this.hasOpenPanelForDocument(documentId);
  }

  closeDocument(documentId: string): void {
    this.stopDocumentTranslation(documentId);
  }

  stopDocumentTranslation(documentId: string): void {
    this.stateStore.remove(documentId);
    this.translationSessions.get(documentId)?.cancel();
    this.translationSessions.delete(documentId);
    this.statusBar?.removeDocument(documentId);

    const count = this.cache.releaseDocument(documentId);

    if (count > 0) {
      this.logInfo(`Cache released for closed document (all languages): ${documentId}`);
    }

    if (!this.isActive()) {
      this.statusBar?.setActiveProvider(null);
      this.statusBar?.showOffline();
    }
    this.translationUpdated.fire(documentId);
  }

  stopTranslation(): void {
    this.stateStore.clear();
    this.cancelAllDocumentSessions();
    this.cache.clear();
    this.statusBar?.setActiveProvider(null);
    this.statusBar?.showOffline();
    this.translationUpdated.fire(undefined);
  }

  clearAllCache(): void {
    this.cancelAllDocumentSessions();
    this.cache.clear();
    this.stateStore.clearSpecs();
    this.translationUpdated.fire(undefined);
  }

  clearDocumentCache(documentId: string): void {
    this.cache.clearDocument(documentId);
    const state = this.stateStore.get(documentId);
    if (state?.enabled) {
      this.stateStore.setStatus(documentId, { kind: 'idle' });
    }
    this.translationUpdated.fire(documentId);
  }

  private ensureDocumentSession(documentId: string): DocumentTranslationSession {
    let session = this.translationSessions.get(documentId);
    if (!session) {
      session = new DocumentTranslationSession();
      this.translationSessions.set(documentId, session);
    }
    return session;
  }

  private cancelAllDocumentSessions(): void {
    for (const session of this.translationSessions.values()) {
      session.cancel();
    }
    this.translationSessions.clear();
  }

  private hasOpenPanelForDocument(documentId: string): boolean {
    return this.translationTargets.hasDocument(documentId);
  }

  generateTranslatedMarkdown(
    document: TranslationDocument,
    langCode: string,
    mode: TranslationViewMode = this.getMode()
  ): TranslatedMarkdownResult {
    const spec = this.stateStore.get(document.id)?.spec;
    const docCache = spec
      ? this.cache.getDocumentCache(document.id, createTranslationCacheKey(spec, langCode))
      : undefined;
    if (!docCache || docCache.size === 0) {
      const text = document.text;
      const lineCount = text.split(/\r?\n/).length;
      return {
        text,
        lineOrigins: Array.from({ length: lineCount }, (_, index) => index),
      };
    }

    return buildTranslatedMarkdown({
      source: document.text,
      langCode,
      mode,
      md: this.md,
      getTranslation: (content, code) => this.getTranslation(document.id, content, code),
    });
  }

}
