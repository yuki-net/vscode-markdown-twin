import type { TranslationProvider } from '../../ports/translationProvider';
import { readResponseErrorMessage, TooManyRequestsError } from './httpError';
import { mapDeepLSourceLanguageCode, mapDeepLTargetLanguageCode } from './languageCodeMapper';

export class DeeplProvider implements TranslationProvider {
  readonly id = 'deepl';
  readonly name = 'DeepL';
  readonly requiresApiKey = true;

  constructor(private apiKey: string) {}

  async translate(texts: readonly string[], sourceLang: string, targetLang: string, signal: AbortSignal): Promise<readonly string[]> {
    if (texts.length === 0) return [];

    const endpoint = this.apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: texts,
        source_lang: mapDeepLSourceLanguageCode(sourceLang),
        target_lang: mapDeepLTargetLanguageCode(targetLang),
        tag_handling: 'off',
      }),
      signal,
    });

    if (!response.ok) {
      const errorMsg = await readResponseErrorMessage(response, [
        payload => payload?.message,
      ]);
      if (response.status === 429) {
        throw new TooManyRequestsError(`DeepL rate limit: ${errorMsg}`);
      }
      throw new Error(`DeepL translation failed (${response.status}): ${errorMsg}`);
    }

    const data = await response.json() as { translations: { text: string }[] };
    if (!data?.translations) {
      throw new Error('DeepL: Invalid response structure');
    }
    return data.translations.map(t => t.text);
  }
}
