import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import type { TranslationManager } from './translationManager';
import type { TextMateHighlightService } from './preview/highlighting/textMateHighlightService';
import type { TranslationTargetRegistry } from './ports/translationTargetRegistry';

/** Application-facing gateway for preview panels. */
export class PreviewRegistry implements TranslationTargetRegistry {
  configureHighlightService(service: TextMateHighlightService): void {
    PreviewPanel.configureHighlightService(service);
  }

  getActivePanel(): PreviewPanel | undefined {
    return PreviewPanel.getActivePanel();
  }

  getPanel(documentUri: vscode.Uri, langCode: string): PreviewPanel | undefined {
    return PreviewPanel.allPanels.get(`${documentUri.toString()}@${langCode}`);
  }

  findForDocument(documentUri: string): PreviewPanel[] {
    return Array.from(PreviewPanel.allPanels.values()).filter(
      panel => panel.editorDocumentUri.toString() === documentUri
    );
  }

  hasDocument(documentUri: string): boolean {
    return this.findForDocument(documentUri).length > 0;
  }

  getTargetLanguages(documentUri: string): readonly string[] {
    return this.findForDocument(documentUri).map(panel => panel.langCode);
  }

  setCurrentPanel(panel: PreviewPanel | undefined): void {
    PreviewPanel.currentPanel = panel;
  }

  createOrShow(
    extensionUri: vscode.Uri,
    translationManager: TranslationManager,
    document?: vscode.TextDocument,
    options: { avoidOpeningSource?: boolean } = {}
  ): Promise<boolean> {
    return PreviewPanel.createOrShow(extensionUri, translationManager, document, options);
  }
}
