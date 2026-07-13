import { createTranslationCacheKey, type TranslationSpec } from '../domain/translationSpec';

describe('TranslationSpec', () => {
  const base: TranslationSpec = {
    providerId: 'google-cloud',
    sourceLanguage: 'auto',
    targetLanguages: ['ko'],
    providerOptionsKey: 'default',
  };

  it('separates cache entries by provider, source, target, and provider options', () => {
    const baseKey = createTranslationCacheKey(base, 'ko');

    expect(createTranslationCacheKey({ ...base, providerId: 'deepl' }, 'ko')).not.toBe(baseKey);
    expect(createTranslationCacheKey({ ...base, sourceLanguage: 'en' }, 'ko')).not.toBe(baseKey);
    expect(createTranslationCacheKey(base, 'ja')).not.toBe(baseKey);
    expect(createTranslationCacheKey({ ...base, providerOptionsKey: 'region:japaneast' }, 'ko')).not.toBe(baseKey);
  });
});
