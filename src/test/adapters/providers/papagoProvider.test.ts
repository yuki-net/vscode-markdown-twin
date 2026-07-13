import { PapagoProvider } from '../../../adapters/providers/papagoProvider';

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

  it('aborts sibling requests and does not consume the rest of a failed batch', async () => {
    const siblingSignals: AbortSignal[] = [];
    global.fetch = jest.fn((_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.text === 'first') {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: () => null },
          json: () => Promise.resolve({ error: { message: 'slow down' } }),
        });
      }

      const signal = init?.signal as AbortSignal;
      siblingSignals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }) as any;

    const provider = new PapagoProvider('client-id:client-secret');
    await expect(provider.translate(
      ['first', 'second', 'third', 'fourth', 'fifth'],
      'en',
      'ja',
      new AbortController().signal
    )).rejects.toThrow('slow down');

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(siblingSignals).toHaveLength(2);
    expect(siblingSignals.every(signal => signal.aborted)).toBe(true);
  });
});
