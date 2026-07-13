import type { TranslationProvider } from '../../ports/translationProvider';
import { ProviderConfigurationError } from '../../domain/translationError';
import { readResponseErrorMessage, readRetryAfterMilliseconds, TooManyRequestsError } from './httpError';
import { mapLanguageCodeForProvider } from './languageCodeMapper';

export class AzureRegionError extends ProviderConfigurationError {
  readonly region: string;
  constructor(region: string) {
    super('azure-region', region, `Azure translation failed (401): wrong region "${region}"`);
    this.name = 'AzureRegionError';
    this.region = region;
  }
}

export class MicrosoftProvider implements TranslationProvider {
  readonly id = 'microsoft';
  readonly name = 'Azure Translator';
  readonly requiresApiKey = true;

  constructor(private apiKey: string, private region = 'global') {}

  async translate(texts: readonly string[], sourceLang: string, targetLang: string, signal: AbortSignal): Promise<readonly string[]> {
    if (texts.length === 0) return [];

    const params = new URLSearchParams({
      'api-version': '3.0',
      to: mapLanguageCodeForProvider(this.id, targetLang),
    });
    if (sourceLang !== 'auto') {
      params.set('from', mapLanguageCodeForProvider(this.id, sourceLang));
    }

    const response = await fetch(
      `https://api.cognitive.microsofttranslator.com/translate?${params}`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Ocp-Apim-Subscription-Region': this.region,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(texts.map(text => ({ Text: text }))),
        signal,
      }
    );

    if (!response.ok) {
      const errorMsg = await readResponseErrorMessage(response, [
        payload => payload?.error?.message,
      ]);
      if (response.status === 429) {
        throw new TooManyRequestsError(
          `Azure rate limit: ${errorMsg}`,
          readRetryAfterMilliseconds(response)
        );
      }
      if (response.status === 401) {
        const lower = errorMsg.toLowerCase();
        if (lower.includes('endpoint') || lower.includes('regional')) {
          throw new AzureRegionError(this.region);
        }
      }
      throw new Error(`Azure translation failed (${response.status}): ${errorMsg}`);
    }

    const data = await response.json() as { translations: { text: string; to: string }[] }[];
    return data.map(item => {
      const text = item.translations[0]?.text;
      if (text === undefined) throw new Error('Azure: Invalid response structure');
      return text;
    });
  }
}
