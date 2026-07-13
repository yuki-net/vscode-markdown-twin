import type { ProviderId } from './provider';

export interface TranslationSpec {
  readonly providerId: ProviderId;
  readonly sourceLanguage: string;
  readonly targetLanguages: readonly string[];
  readonly providerOptionsKey: string;
}

export function createTranslationCacheKey(spec: TranslationSpec, targetLanguage: string): string {
  return [
    `provider:${spec.providerId}`,
    `source:${spec.sourceLanguage}`,
    `target:${targetLanguage}`,
    `options:${spec.providerOptionsKey}`,
  ].join('|');
}
