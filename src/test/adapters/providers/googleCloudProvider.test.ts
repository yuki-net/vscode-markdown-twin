import { GoogleCloudProvider } from '../../../adapters/providers/googleCloudProvider';

describe('GoogleCloudProvider Tests', () => {
  let provider: GoogleCloudProvider;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    provider = new GoogleCloudProvider('fake-api-key');
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return empty array for empty input', async () => {
    const results = await provider.translate([], 'auto', 'ko', new AbortController().signal);
    expect(results).toEqual([]);
  });

  it('should successfully translate texts using mock fetch', async () => {
    const mockTranslations = [
      { translatedText: '안녕하세요' },
      { translatedText: '세계' },
    ];

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: {
            translations: mockTranslations,
          },
        }),
      })
    ) as any;

    const results = await provider.translate(['Hello', 'World'], 'en', 'ko', new AbortController().signal);
    expect(results).toEqual(['안녕하세요', '세계']);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://translation.googleapis.com/language/translate/v2?key=fake-api-key',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: ['Hello', 'World'],
          target: 'ko',
          format: 'text',
          source: 'en',
        }),
      })
    );
  });

  it('should handle fetch errors gracefully', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({
          error: {
            message: 'Invalid API Key',
          },
        }),
      })
    ) as any;

    await expect(provider.translate(['Hello'], 'en', 'ko', new AbortController().signal)).rejects.toThrow(
      'Google Cloud Translation failed: Invalid API Key'
    );
  });
});
