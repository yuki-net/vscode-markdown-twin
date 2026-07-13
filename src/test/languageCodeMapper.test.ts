import { mapDeepLSourceLanguageCode, mapDeepLTargetLanguageCode, mapLanguageCodeForProvider } from '../adapters/providers/languageCodeMapper';

describe('languageCodeMapper', () => {
  it('keeps app language codes unchanged for Azure when supported directly', () => {
    expect(mapLanguageCodeForProvider('microsoft', 'zh-Hans')).toBe('zh-Hans');
    expect(mapLanguageCodeForProvider('microsoft', 'zh-Hant')).toBe('zh-Hant');
  });

  it('maps Chinese variants to Google Cloud language codes', () => {
    expect(mapLanguageCodeForProvider('google-cloud', 'zh-Hans')).toBe('zh-CN');
    expect(mapLanguageCodeForProvider('google-cloud', 'zh-Hant')).toBe('zh-TW');
  });

  it('maps Chinese variants to Papago language codes', () => {
    expect(mapLanguageCodeForProvider('papago', 'zh-Hans')).toBe('zh-CN');
    expect(mapLanguageCodeForProvider('papago', 'zh-Hant')).toBe('zh-TW');
  });

  it('maps Chinese variants to DeepL language codes and preserves auto source detection', () => {
    expect(mapDeepLSourceLanguageCode('auto')).toBeUndefined();
    expect(mapDeepLSourceLanguageCode('zh-Hans')).toBe('ZH-HANS');
    expect(mapDeepLSourceLanguageCode('zh-Hant')).toBe('ZH-HANT');
    expect(mapDeepLTargetLanguageCode('zh-Hans')).toBe('ZH-HANS');
    expect(mapDeepLTargetLanguageCode('zh-Hant')).toBe('ZH-HANT');
  });

  it('passes through existing shared language codes', () => {
    expect(mapLanguageCodeForProvider('google-cloud', 'ko')).toBe('ko');
    expect(mapLanguageCodeForProvider('papago', 'ja')).toBe('ja');
    expect(mapDeepLTargetLanguageCode('en')).toBe('EN');
  });
});
