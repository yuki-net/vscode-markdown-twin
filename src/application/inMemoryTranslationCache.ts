import type { TranslationCache } from '../ports/translationCache';

export class InMemoryTranslationCache implements TranslationCache {
  private readonly entries = new Map<string, Map<string, string>>();

  get(documentUri: string, cacheKey: string, originalText: string): string | undefined {
    return this.getDocumentCache(documentUri, cacheKey)?.get(originalText);
  }

  getDocumentCache(documentUri: string, cacheKey: string): Map<string, string> | undefined {
    return this.entries.get(this.key(documentUri, cacheKey));
  }

  ensureDocumentCache(documentUri: string, translationKey: string): Map<string, string> {
    const cacheKey = this.key(documentUri, translationKey);
    let docCache = this.entries.get(cacheKey);
    if (!docCache) {
      docCache = new Map();
      this.entries.set(cacheKey, docCache);
    }
    return docCache;
  }

  preparePendingTranslations(
    documentUri: string,
    targetLangs: string[],
    currentTexts: Set<string>,
    keyForTarget: (targetLanguage: string) => string
  ): { langToTranslateMap: Map<string, string[]>; totalCount: number } {
    const allTexts = Array.from(currentTexts);
    let totalCount = 0;
    const langToTranslateMap = new Map<string, string[]>();

    for (const targetLang of targetLangs) {
      const docCache = this.ensureDocumentCache(documentUri, keyForTarget(targetLang));

      for (const cachedText of docCache.keys()) {
        if (!currentTexts.has(cachedText)) {
          docCache.delete(cachedText);
        }
      }

      const pending = allTexts.filter(text => !docCache.has(text));
      langToTranslateMap.set(targetLang, pending);
      totalCount += pending.length;
    }

    return { langToTranslateMap, totalCount };
  }

  releaseDocument(documentUri: string): number {
    const prefix = `${documentUri.toString()}@`;
    let count = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  clearDocument(documentUri: string): void {
    this.releaseDocument(documentUri);
  }

  clear(): void {
    this.entries.clear();
  }

  private key(documentUri: string, translationKey: string): string {
    return `${documentUri.toString()}@${translationKey}`;
  }
}
