import type { ProviderId } from '../../domain/provider';

type LanguageCodeMap = Partial<Record<ProviderId, Record<string, string>>>;

const PROVIDER_LANGUAGE_CODE_MAP: LanguageCodeMap = {
  'google-cloud': {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
  },
  deepl: {
    'zh-Hans': 'ZH-HANS',
    'zh-Hant': 'ZH-HANT',
  },
  papago: {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
  },
};

export function mapLanguageCodeForProvider(providerId: ProviderId, languageCode: string): string {
  if (languageCode === 'auto') {
    return languageCode;
  }

  return PROVIDER_LANGUAGE_CODE_MAP[providerId]?.[languageCode] ?? languageCode;
}

export function mapDeepLTargetLanguageCode(languageCode: string): string {
  return mapLanguageCodeForProvider('deepl', languageCode).toUpperCase();
}

export function mapDeepLSourceLanguageCode(languageCode: string): string | undefined {
  if (languageCode === 'auto') {
    return undefined;
  }

  return mapLanguageCodeForProvider('deepl', languageCode).toUpperCase();
}
