import type * as vscode from 'vscode';
import type { TranslationViewMode } from '../translatedMarkdownBuilder';

export interface TranslationStatusSink {
  setActiveProvider(providerId: string | null): void;
  showOffline(): void;
  showProgress(documentUri: vscode.Uri, providerName: string, done: number, total: number): void;
  showComplete(documentUri: vscode.Uri, mode: TranslationViewMode, providerName: string): void;
  showError(documentUri: vscode.Uri, providerName: string): void;
  removeDocument(documentUri: vscode.Uri): void;
  update(mode: TranslationViewMode): void;
}
