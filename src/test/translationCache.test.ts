import { InMemoryTranslationCache } from '../application/inMemoryTranslationCache';

describe('TranslationCache', () => {
  it('clears only the requested document cache', () => {
    const cache = new InMemoryTranslationCache();
    const first = 'file:///workspace/first.md';
    const second = 'file:///workspace/second.md';

    cache.ensureDocumentCache(first, 'ko').set('hello', '안녕');
    cache.ensureDocumentCache(first, 'en').set('hello', 'hello');
    cache.ensureDocumentCache(second, 'ko').set('world', '세계');

    cache.clearDocument(first);

    expect(cache.get(first, 'ko', 'hello')).toBeUndefined();
    expect(cache.get(first, 'en', 'hello')).toBeUndefined();
    expect(cache.get(second, 'ko', 'world')).toBe('세계');
  });
});
