import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import type { TranslationCoordinator } from './application/translationCoordinator';
import type { TextMateHighlightService } from './preview/highlighting/textMateHighlightService';
import type { TranslationTargetRegistry } from './ports/translationTargetRegistry';
import { createLocalResourceRoots } from './preview/webviewResources';
import { getTargetLanguageCode } from './languages';
import { isCursor } from './utils';
import { t } from './i18n';

/** Owns all preview instances and their active selection for one extension lifecycle. */
export class PreviewRegistry implements TranslationTargetRegistry {
  private readonly panels = new Map<string, PreviewPanel>();
  private currentPanel: PreviewPanel | undefined;
  private highlightService: TextMateHighlightService | undefined;

  configureHighlightService(service: TextMateHighlightService): void {
    this.highlightService = service;
  }

  getActivePanel(): PreviewPanel | undefined {
    if (this.currentPanel?.isActive) {
      this.syncActiveContexts();
      return this.currentPanel;
    }

    const active = Array.from(this.panels.values()).find(panel => panel.isActive);
    if (active) this.currentPanel = active;
    this.syncActiveContexts();
    return active ?? this.currentPanel;
  }

  getPanel(documentUri: vscode.Uri, langCode: string): PreviewPanel | undefined {
    return this.panels.get(this.key(documentUri.toString(), langCode));
  }

  findForDocument(documentUri: string): PreviewPanel[] {
    return Array.from(this.panels.values()).filter(
      panel => panel.editorDocumentUri.toString() === documentUri
    );
  }

  hasDocument(documentUri: string): boolean {
    return this.findForDocument(documentUri).length > 0;
  }

  getTargetLanguages(documentUri: string): readonly string[] {
    return this.findForDocument(documentUri).map(panel => panel.langCode);
  }

  getDocumentUris(): readonly string[] {
    return [...new Set(Array.from(this.panels.values()).map(
      panel => panel.editorDocumentUri.toString()
    ))];
  }

  setCurrentPanel(panel: PreviewPanel | undefined): void {
    this.currentPanel = panel;
    this.syncActiveContexts();
  }

  isCurrentDocument(documentUri: string): boolean {
    return this.currentPanel?.editorDocumentUri.toString() === documentUri;
  }

  syncActiveContexts(): void {
    const active = Array.from(this.panels.values()).find(panel => panel.isActive);
    if (active) this.currentPanel = active;

    void vscode.commands.executeCommand('setContext', 'markdownTwin.previewActive', !!active);
    void vscode.commands.executeCommand('setContext', 'markdownTwin.showingSource', active?.viewMode === 'source');
  }

  unregister(panel: PreviewPanel): { hasDocument: boolean; hasPanels: boolean } {
    this.panels.delete(this.key(panel.editorDocumentUri.toString(), panel.langCode));

    if (this.currentPanel === panel) {
      const remaining = Array.from(this.panels.values());
      this.currentPanel = remaining.at(-1);
    }
    this.syncActiveContexts();

    return {
      hasDocument: this.hasDocument(panel.editorDocumentUri.toString()),
      hasPanels: this.panels.size > 0,
    };
  }

  async createOrShow(
    extensionUri: vscode.Uri,
    coordinator: TranslationCoordinator,
    document?: vscode.TextDocument,
    options: { avoidOpeningSource?: boolean } = {}
  ): Promise<boolean> {
    const editor = document
      ? await this.resolveEditorForDocument(document, !options.avoidOpeningSource)
      : vscode.window.activeTextEditor;
    const previewDocument = document ?? editor?.document;
    if (!previewDocument || previewDocument.languageId !== 'markdown') {
      vscode.window.showErrorMessage(t('noActiveEditor'));
      return false;
    }

    const code = getTargetLanguageCode();
    const panelKey = this.key(previewDocument.uri.toString(), code);
    const column = editor?.viewColumn ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
    const targetColumn = column ? column + 1 : vscode.ViewColumn.Two;
    const existing = this.panels.get(panelKey);
    if (existing) {
      this.currentPanel = existing;
      this.syncActiveContexts();
      if (!isCursor()) existing.reveal(targetColumn);
      return true;
    }

    if (!this.highlightService) {
      throw new Error('Preview highlighting service has not been configured');
    }

    const webviewPanel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      t('previewTitle', path.basename(previewDocument.fileName)),
      targetColumn,
      {
        enableScripts: true,
        localResourceRoots: createLocalResourceRoots(extensionUri, previewDocument),
        retainContextWhenHidden: true,
      }
    );
    webviewPanel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'flags', `${code}.svg`);

    const panel = new PreviewPanel(
      webviewPanel,
      extensionUri,
      previewDocument,
      editor,
      coordinator,
      this.highlightService,
      code,
      this
    );
    this.panels.set(panelKey, panel);
    this.currentPanel = panel;
    this.syncActiveContexts();
    return true;
  }

  private async resolveEditorForDocument(
    document: vscode.TextDocument,
    openIfNeeded: boolean
  ): Promise<vscode.TextEditor | undefined> {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.uri.toString() === document.uri.toString()) return activeEditor;

    const visibleEditor = vscode.window.visibleTextEditors.find(
      editor => editor.document.uri.toString() === document.uri.toString()
    );
    if (visibleEditor || !openIfNeeded) return visibleEditor;

    try {
      return await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
    } catch {
      return undefined;
    }
  }

  private key(documentUri: string, langCode: string): string {
    return `${documentUri}@${langCode}`;
  }
}
