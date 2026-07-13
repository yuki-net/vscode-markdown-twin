import { ProviderRateLimitError, ProviderTimeoutError } from '../domain/translationError';
import {
  ProviderConcurrencyGate,
  ResilientTranslationProvider,
} from '../adapters/providers/resilientTranslationProvider';

function createProvider(translate: jest.Mock) {
  return {
    id: 'google-cloud' as const,
    name: 'Google Cloud',
    translate,
  };
}

describe('ResilientTranslationProvider', () => {
  it('retries a rate-limited request and keeps the same cancellation signal chain', async () => {
    const translate = jest.fn()
      .mockRejectedValueOnce(new ProviderRateLimitError('slow down', 0))
      .mockResolvedValueOnce(['translated']);
    const provider = new ResilientTranslationProvider(
      createProvider(translate),
      new ProviderConcurrencyGate(1),
      { timeoutMs: 100, maxRetries: 1, baseRetryDelayMs: 1 }
    );

    await expect(provider.translate(['text'], 'en', 'ja', new AbortController().signal))
      .resolves.toEqual(['translated']);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('fails a provider call that exceeds the timeout', async () => {
    const provider = new ResilientTranslationProvider(
      createProvider(jest.fn(() => new Promise(() => undefined))),
      new ProviderConcurrencyGate(1),
      { timeoutMs: 5, maxRetries: 0, baseRetryDelayMs: 1 }
    );

    await expect(provider.translate(['text'], 'en', 'ja', new AbortController().signal))
      .rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('limits concurrent calls that share a provider gate', async () => {
    let releaseFirst!: () => void;
    const first = new Promise<readonly string[]>(resolve => {
      releaseFirst = () => resolve(['first']);
    });
    const translate = jest.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(['second']);
    const gate = new ProviderConcurrencyGate(1);
    const provider = new ResilientTranslationProvider(
      createProvider(translate),
      gate,
      { timeoutMs: 100, maxRetries: 0, baseRetryDelayMs: 1 }
    );
    const signal = new AbortController().signal;

    const firstCall = provider.translate(['first'], 'en', 'ja', signal);
    const secondCall = provider.translate(['second'], 'en', 'ja', signal);
    await Promise.resolve();
    expect(translate).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(firstCall).resolves.toEqual(['first']);
    await expect(secondCall).resolves.toEqual(['second']);
    expect(translate).toHaveBeenCalledTimes(2);
  });
});
