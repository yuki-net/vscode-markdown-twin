import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import type { ProviderId } from './providers/ITranslationProvider';

export interface RunTranslationOptions {
  clearCache?: boolean;
  clearAllCache?: boolean;
  overrideProvider?: ProviderId;
}

export async function runTranslationForDocument(
  translationManager: TranslationManager,
  document: vscode.TextDocument | undefined,
  options?: RunTranslationOptions
): Promise<boolean> {
  if (!document) return false;

  if (options?.clearAllCache) {
    translationManager.clearAllCache();
  } else if (options?.clearCache) {
    translationManager.clearDocumentCache(document.uri);
  }

  const success = await translationManager.startTranslation(document, options?.overrideProvider);
  await vscode.commands.executeCommand(
    'setContext',
    'markdownTwin.translationActive',
    translationManager.isActive()
  );
  return success;
}
