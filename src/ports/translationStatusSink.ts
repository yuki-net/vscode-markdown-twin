import type { TranslationViewMode } from '../domain/translationViewMode';

export interface TranslationStatusSink {
  setActiveProvider(providerId: string | null): void;
  showOffline(): void;
  showProgress(documentId: string, providerName: string, done: number, total: number, targetLanguages?: readonly string[]): void;
  showComplete(documentId: string, mode: TranslationViewMode, providerName: string, targetLanguages?: readonly string[]): void;
  showError(documentId: string, providerName: string): void;
  removeDocument(documentId: string): void;
  update(mode: TranslationViewMode): void;
}
