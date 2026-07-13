import { shouldTranslate, splitTranslatableParts, joinTranslatedParts } from '../../../domain/markdown/extractTranslationUnits';

describe('Language Detector Tests', () => {
  describe('shouldTranslate', () => {
    it('should translate Japanese sentences', () => {
      expect(shouldTranslate('これは日本語の文章です。', 'ja')).toBe(true);
      expect(shouldTranslate('こんにちは、世界。', 'ja')).toBe(true);
    });

    it('should ignore pure English or identifiers', () => {
      expect(shouldTranslate('Hello World', 'ja')).toBe(false);
      expect(shouldTranslate('12345', 'ja')).toBe(false);
      expect(shouldTranslate('const x = 1;', 'ja')).toBe(false);
      expect(shouldTranslate('code-line-content', 'ja')).toBe(false);
    });

    it('should return false for empty or whitespace strings', () => {
      expect(shouldTranslate('', 'ja')).toBe(false);
      expect(shouldTranslate('   ', 'ja')).toBe(false);
    });

    it('should translate English sentences when source language is English', () => {
      expect(shouldTranslate('Hello World', 'en')).toBe(true);
    });
  });

  describe('splitTranslatableParts and joinTranslatedParts', () => {
    it('should split Japanese and keep identifiers and inline code intact', () => {
      const text = 'こんにちは `world` です。';
      const parts = splitTranslatableParts(text, 'ja');

      expect(parts.length).toBe(3);
      expect(parts[0]).toEqual({ text: 'こんにちは ', translate: true });
      expect(parts[1]).toEqual({ text: '`world`', translate: false });
      expect(parts[2]).toEqual({ text: ' です。', translate: true });

      const translatedMap = new Map<number, string>();
      translatedMap.set(0, 'Hello ');
      translatedMap.set(1, '!');

      const joined = joinTranslatedParts(parts, translatedMap);
      expect(joined).toBe('Hello `world`!');
    });
  });
});
