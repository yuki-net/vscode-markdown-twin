import * as vscode from 'vscode';
import type { TranslationViewMode } from '../../../domain/translationViewMode';
import type { TranslatedMarkdownResult } from '../../../domain/translationResult';
import type { VscodeTranslationCoordinator } from '../vscodeTranslationCoordinator';
import type { PreviewPanel } from './previewPanel';
import type { PreviewRegistry } from './previewRegistry';
import type { TextMateHighlightService } from './highlighting/textMateHighlightService';

/** Coordinates preview lifecycle without putting translation mutations in the panel. */
export class PreviewController implements vscode.Disposable {
  readonly onDidChange: vscode.Event<vscode.Uri | undefined>;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly coordinator: VscodeTranslationCoordinator,
    private readonly registry: PreviewRegistry,
    highlightService: TextMateHighlightService
  ) {
    this.onDidChange = coordinator.onDidChange;
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const documentId = event.document.uri.toString();
        if (!this.registry.isCurrentDocument(documentId)) return;
        for (const panel of this.registry.findForDocument(documentId)) panel.refresh();
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration('markdown.preview')) return;
        for (const panel of this.registry.getPanels()) panel.resetRender();
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges(event => {
        for (const panel of this.registry.findForDocument(event.textEditor.document.uri.toString())) {
          panel.syncEditorScroll(event);
        }
      }),
      highlightService.onDidChange(() => {
        for (const panel of this.registry.getPanels()) panel.refresh();
      })
    );
  }

  generate(
    document: vscode.TextDocument,
    language: string,
    mode?: TranslationViewMode
  ): TranslatedMarkdownResult {
    return this.coordinator.generateTranslatedMarkdown(document, language, mode);
  }

  logError(message: string, error?: unknown, showOutputHint = true): void {
    this.coordinator.logError(message, error, showOutputHint);
  }

  panelActivated(panel: PreviewPanel): void {
    this.registry.setCurrentPanel(panel);
    if (this.coordinator.isActive()) {
      void this.coordinator.run(panel.editorDocument);
    } else {
      panel.refresh();
    }
  }

  panelDisposed(panel: PreviewPanel): void {
    const remaining = this.registry.unregister(panel);
    if (!remaining.hasDocument) {
      this.coordinator.stopDocument(panel.editorDocumentUri);
    }
    if (!remaining.hasPanels) {
      this.coordinator.stop();
      void vscode.commands.executeCommand('setContext', 'markdownTwin.previewActive', false);
      void vscode.commands.executeCommand('setContext', 'markdownTwin.showingSource', false);
      void vscode.commands.executeCommand('setContext', 'markdownTwin.translationActive', false);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
