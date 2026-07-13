import { PapagoProvider } from '../adapters/providers/papagoProvider';

describe('PapagoProvider', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps Chinese variants and preserves auto source detection in request bodies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        message: {
          result: {
            translatedText: 'translated',
          },
        },
      }),
    }) as any;

    const provider = new PapagoProvider('client-id:client-secret');
    await provider.translate(['source text'], 'auto', 'zh-Hant', new AbortController().signal);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://naveropenapi.apigw.ntruss.com/nmt/v1/translation',
      expect.objectContaining({
        body: JSON.stringify({
          source: 'auto',
          target: 'zh-TW',
          text: 'source text',
        }),
      })
    );
  });
});
