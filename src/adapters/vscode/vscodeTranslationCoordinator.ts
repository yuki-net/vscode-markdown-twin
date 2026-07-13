import * as vscode from 'vscode';
import type { ProviderId } from '../../domain/provider';
import type { TranslationViewMode } from '../../domain/translationViewMode';
import type { TranslatedMarkdownResult } from '../../domain/translationResult';
import { TranslationCoordinator } from '../../application/translationCoordinator';
import type { TranslationTargetRegistry } from '../../ports/translationTargetRegistry';
import { translateDocument } from '../../application/commands/translateDocument';

export interface RunTranslationOptions {
  clearCache?: boolean;
  clearAllCache?: boolean;
  overrideProvider?: ProviderId;
}

interface VscodeTranslationTargetRegistry extends TranslationTargetRegistry {
  getDocument(documentUri: string): vscode.TextDocument | undefined;
}

/** Single command gateway for translation state changes. */
export class VscodeTranslationCoordinator implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | undefined>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly serviceSubscription: { dispose(): void };

  constructor(
    private readonly service: TranslationCoordinator,
    private readonly targets: VscodeTranslationTargetRegistry
  ) {
    this.serviceSubscription = service.onTranslationUpdated(documentId => {
      this.changeEmitter.fire(documentId ? vscode.Uri.parse(documentId) : undefined);
    });
  }

  async run(
    document: vscode.TextDocument | undefined,
    options?: RunTranslationOptions
  ): Promise<boolean> {
    if (!document) return false;

    if (options?.clearAllCache) {
      this.service.clearAllCache();
    } else if (options?.clearCache) {
      this.service.clearDocumentCache(document.uri.toString());
    }

    const success = await translateDocument(this.service, this.snapshot(document), options?.overrideProvider);
    await this.syncActiveContext();
    return success;
  }

  async rerunAll(options?: RunTranslationOptions): Promise<void> {
    if (options?.clearAllCache) {
      this.service.clearAllCache();
    }

    const documents = this.targets.getDocumentUris()
      .map(uri => vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri)
        ?? this.targets.getDocument(uri))
      .filter((document): document is vscode.TextDocument => document !== undefined);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < documents.length) {
        const document = documents[nextIndex++];
        await this.run(document, {
          ...options,
          clearAllCache: false,
          clearCache: options?.clearAllCache ? false : options?.clearCache,
        });
      }
    };
    const concurrency = Math.min(2, documents.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  isActive(): boolean {
    return this.service.isActive();
  }

  getMode(): TranslationViewMode {
    return this.service.getMode();
  }

  toggleMode(): Promise<void> {
    return this.service.toggleMode();
  }

  generateTranslatedMarkdown(
    document: vscode.TextDocument,
    langCode: string,
    mode?: TranslationViewMode
  ): TranslatedMarkdownResult {
    return this.service.generateTranslatedMarkdown(this.snapshot(document), langCode, mode);
  }

  invalidateDocument(uri: vscode.Uri): void {
    if (!this.service.canRerunDocument(uri.toString())) return;
    const documentId = uri.toString();
    const existing = this.debounceTimers.get(documentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(documentId);
      const document = vscode.workspace.textDocuments.find(
        candidate => candidate.uri.toString() === documentId
      );
      if (document && this.service.canRerunDocument(documentId)) void this.run(document);
    }, this.service.getDebounceDelayMs());
    this.debounceTimers.set(documentId, timer);
  }

  closeDocument(uri: vscode.Uri): void {
    this.clearDebounceTimer(uri.toString());
    this.service.closeDocument(uri.toString());
    void this.syncActiveContext();
  }

  stopDocument(uri: vscode.Uri): void {
    this.clearDebounceTimer(uri.toString());
    this.service.stopDocumentTranslation(uri.toString());
    void this.syncActiveContext();
  }

  stop(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.service.stopTranslation();
    void this.syncActiveContext();
  }

  clearAllCache(): void {
    this.service.clearAllCache();
  }

  logError(message: string, error?: unknown, showOutputHint = true): void {
    this.service.logError(message, error, showOutputHint);
  }

  dispose(): void {
    this.stop();
    this.serviceSubscription.dispose();
    this.changeEmitter.dispose();
  }

  private async syncActiveContext(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'markdownTwin.translationActive',
      this.service.isActive()
    );
  }

  private clearDebounceTimer(documentId: string): void {
    const timer = this.debounceTimers.get(documentId);
    if (!timer) return;
    clearTimeout(timer);
    this.debounceTimers.delete(documentId);
  }

  private snapshot(document: vscode.TextDocument) {
    return {
      id: document.uri.toString(),
      languageId: document.languageId,
      text: document.getText(),
    };
  }
}
