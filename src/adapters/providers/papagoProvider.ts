import type { TranslationProvider } from '../../ports/translationProvider';
import { readResponseErrorMessage, readRetryAfterMilliseconds, TooManyRequestsError } from './httpError';
import { mapLanguageCodeForProvider } from './languageCodeMapper';

export class PapagoProvider implements TranslationProvider {
  readonly id = 'papago';
  readonly name = 'Papago (Naver)';
  readonly requiresApiKey = true;
  readonly rateLimitRetryMode = 'none';

  private clientId: string;
  private clientSecret: string;

  // APIキーは "clientId:clientSecret" 形式で受け取り、内部で分割する。
  constructor(apiKey: string) {
    const [id, secret] = apiKey.split(':');
    this.clientId = id ?? '';
    this.clientSecret = secret ?? '';
  }

  async translate(texts: readonly string[], sourceLang: string, targetLang: string, signal: AbortSignal): Promise<readonly string[]> {
    if (texts.length === 0) return [];

    // Papago accepts one text per request. Keep a small bounded pool so a large
    // translation batch cannot fan out into an unbounded number of HTTP calls.
    const batchController = new AbortController();
    const abortBatch = () => batchController.abort();
    if (signal.aborted) abortBatch();
    else signal.addEventListener('abort', abortBatch, { once: true });

    const results = new Array<string>(texts.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (!batchController.signal.aborted && nextIndex < texts.length) {
        const index = nextIndex++;
        results[index] = await this.translateOne(
          texts[index],
          sourceLang,
          targetLang,
          batchController.signal
        );
      }
    };
    const concurrency = Math.min(3, texts.length);
    const workers = Array.from({ length: concurrency }, () => worker());
    try {
      await Promise.all(workers);
      return results;
    } catch (error: unknown) {
      batchController.abort();
      await Promise.allSettled(workers);
      throw error;
    } finally {
      signal.removeEventListener('abort', abortBatch);
    }
  }

  private async translateOne(text: string, sourceLang: string, targetLang: string, signal: AbortSignal): Promise<string> {
    const response = await fetch('https://naveropenapi.apigw.ntruss.com/nmt/v1/translation', {
      method: 'POST',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': this.clientId,
        'X-NCP-APIGW-API-KEY': this.clientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: mapLanguageCodeForProvider(this.id, sourceLang),
        target: mapLanguageCodeForProvider(this.id, targetLang),
        text,
      }),
      signal,
    });

    if (!response.ok) {
      const errorMsg = await readResponseErrorMessage(response, [
        payload => payload?.error?.message,
      ]);
      if (response.status === 429) {
        throw new TooManyRequestsError(
          `Papago rate limit: ${errorMsg}`,
          readRetryAfterMilliseconds(response)
        );
      }
      throw new Error(`Papago translation failed (${response.status}): ${errorMsg}`);
    }

    const data = await response.json() as { message: { result: { translatedText: string } } };
    const translatedText = data?.message?.result?.translatedText;
    if (!translatedText) {
      throw new Error('Papago: Invalid response structure');
    }
    return translatedText;
  }
}
