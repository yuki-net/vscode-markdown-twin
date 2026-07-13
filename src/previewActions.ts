import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { TranslationManager } from './translationManager';
import { runTranslationForDocument, type RunTranslationOptions } from './translationRunner';
import { PreviewRegistry } from './previewRegistry';

export interface RetranslatePreviewOptions extends RunTranslationOptions {
  revealPreview?: boolean;
}

interface RetranslatePreviewArgs {
  extensionUri?: vscode.Uri;
  translationManager: TranslationManager;
  previewRegistry: PreviewRegistry;
  document: vscode.TextDocument | undefined;
  options?: RetranslatePreviewOptions;
}

export function getActivePreviewPanel(previewRegistry: PreviewRegistry): PreviewPanel | undefined {
  return previewRegistry.getActivePanel();
}

export function getActivePreviewDocument(previewRegistry: PreviewRegistry): vscode.TextDocument | undefined {
  const activeUri = getActivePreviewPanel(previewRegistry)?.editorDocumentUri;
  if (!activeUri) return undefined;

  return vscode.workspace.textDocuments.find(
    document => document.uri.toString() === activeUri.toString()
  );
}

export async function retranslatePreviewDocument(args: RetranslatePreviewArgs): Promise<boolean> {
  const { extensionUri, translationManager, previewRegistry, document, options } = args;
  if (!document) return false;

  if (options?.revealPreview) {
    if (!extensionUri) return false;

    const panelReady = await previewRegistry.createOrShow(extensionUri, translationManager, document);
    if (!panelReady) {
      return false;
    }
  }

  return runTranslationForDocument(translationManager, document, options);
}

export async function retranslateActivePreview(
  translationManager: TranslationManager,
  previewRegistry: PreviewRegistry,
  options?: RetranslatePreviewOptions
): Promise<boolean> {
  return retranslatePreviewDocument({
    translationManager,
    previewRegistry,
    document: getActivePreviewDocument(previewRegistry),
    options,
  });
}
