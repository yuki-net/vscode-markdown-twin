export interface PendingTranslations {
  readonly langToTranslateMap: Map<string, string[]>;
  readonly totalCount: number;
}

export interface TranslationCache {
  get(documentId: string, cacheKey: string, originalText: string): string | undefined;
  getDocumentCache(documentId: string, cacheKey: string): Map<string, string> | undefined;
  ensureDocumentCache(documentId: string, translationKey: string): Map<string, string>;
  preparePendingTranslations(
    documentId: string,
    targetLanguages: string[],
    currentTexts: Set<string>,
    keyForTarget: (targetLanguage: string) => string
  ): PendingTranslations;
  releaseDocument(documentId: string): number;
  clearDocument(documentId: string): void;
  clear(): void;
}
