import * as vscode from 'vscode';
import type { ProviderId } from '../providers/ITranslationProvider';
import type { TranslationViewMode, TranslatedMarkdownResult } from '../translatedMarkdownBuilder';
import { TranslationManager } from '../translationManager';
import type { TranslationTargetRegistry } from '../ports/translationTargetRegistry';

export interface RunTranslationOptions {
  clearCache?: boolean;
  clearAllCache?: boolean;
  overrideProvider?: ProviderId;
}

/** Single command gateway for translation state changes. */
export class TranslationCoordinator implements vscode.Disposable {
  readonly onDidChange: vscode.Event<vscode.Uri | undefined>;

  constructor(
    private readonly manager: TranslationManager,
    private readonly targets: TranslationTargetRegistry
  ) {
    this.onDidChange = manager.onTranslationUpdated;
  }

  async run(
    document: vscode.TextDocument | undefined,
    options?: RunTranslationOptions
  ): Promise<boolean> {
    if (!document) return false;

    if (options?.clearAllCache) {
      this.manager.clearAllCache();
    } else if (options?.clearCache) {
      this.manager.clearDocumentCache(document.uri);
    }

    const success = await this.manager.startTranslation(document, options?.overrideProvider);
    await this.syncActiveContext();
    return success;
  }

  async rerunAll(options?: RunTranslationOptions): Promise<void> {
    if (options?.clearAllCache) {
      this.manager.clearAllCache();
    }

    for (const uri of this.targets.getDocumentUris()) {
      const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri);
      if (!document) continue;

      await this.run(document, {
        ...options,
        clearAllCache: false,
        clearCache: options?.clearAllCache ? false : options?.clearCache,
      });
    }
  }

  isActive(): boolean {
    return this.manager.isActive();
  }

  getMode(): TranslationViewMode {
    return this.manager.getMode();
  }

  toggleMode(): Promise<void> {
    return this.manager.toggleMode();
  }

  generateTranslatedMarkdown(
    document: vscode.TextDocument,
    langCode: string,
    mode?: TranslationViewMode
  ): TranslatedMarkdownResult {
    return this.manager.generateTranslatedMarkdown(document, langCode, mode);
  }

  invalidateDocument(uri: vscode.Uri): void {
    this.manager.invalidateCache(uri);
  }

  closeDocument(uri: vscode.Uri): void {
    this.manager.closeDocument(uri);
  }

  stopDocument(uri: vscode.Uri): void {
    this.manager.stopDocumentTranslation(uri);
  }

  stop(): void {
    this.manager.stopTranslation();
  }

  clearAllCache(): void {
    this.manager.clearAllCache();
  }

  logError(message: string, error?: unknown, showOutputHint = true): void {
    this.manager.logError(message, error, showOutputHint);
  }

  dispose(): void {
    this.stop();
  }

  private async syncActiveContext(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'markdownTwin.translationActive',
      this.manager.isActive()
    );
  }
}
