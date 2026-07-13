import {
  getLanguageDisplayCode,
  normalizeSourceLanguageCode,
  normalizeTargetLanguageCode,
} from '../../languages';

describe('languages', () => {
  it('normalizes Chinese app language codes and display codes', () => {
    expect(normalizeTargetLanguageCode('zh-Hans')).toBe('zh-Hans');
    expect(normalizeTargetLanguageCode('zh-Hant')).toBe('zh-Hant');
    expect(getLanguageDisplayCode('zh-Hans')).toBe('ZH-CN');
    expect(getLanguageDisplayCode('zh-Hant')).toBe('ZH-TW');
  });

  it('uses the most specific legacy Chinese prefix before the generic Chinese prefix', () => {
    expect(normalizeSourceLanguageCode('Chinese Simplified')).toBe('zh-Hans');
    expect(normalizeSourceLanguageCode('Chinese Traditional')).toBe('zh-Hant');
    expect(normalizeSourceLanguageCode('Traditional Chinese')).toBe('zh-Hant');
    expect(normalizeSourceLanguageCode('zh-TW')).toBe('zh-Hant');
  });
});
