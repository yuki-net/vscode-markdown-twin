export interface Language {
  code: string;
  label: string;
  displayCode: string;
}

export const DEFAULT_SOURCE_LANG_CODE = 'auto';
export const DEFAULT_TARGET_LANG_CODE = 'ko';
export const AUTO_DETECT_LANG_CODE = 'auto';

export const TARGET_LANGUAGES: Language[] = [
  { code: 'ja', label: 'Japanese (日本語)', displayCode: 'JA' },
  { code: 'en', label: 'English (English)', displayCode: 'EN' },
  { code: 'ko', label: 'Korean (한국어)', displayCode: 'KO' },
  { code: 'zh-Hans', label: 'Simplified Chinese (简体中文)', displayCode: 'ZH-CN' },
  { code: 'zh-Hant', label: 'Traditional Chinese (繁體中文)', displayCode: 'ZH-TW' },
  { code: 'es', label: 'Spanish (Español)', displayCode: 'ES' },
  { code: 'fr', label: 'French (Français)', displayCode: 'FR' },
  { code: 'de', label: 'German (Deutsch)', displayCode: 'DE' },
  { code: 'it', label: 'Italian (Italiano)', displayCode: 'IT' },
  { code: 'pt', label: 'Portuguese (Português)', displayCode: 'PT' },
  { code: 'ru', label: 'Russian (Русский)', displayCode: 'RU' },
  { code: 'vi', label: 'Vietnamese (Tiếng Việt)', displayCode: 'VI' },
  { code: 'th', label: 'Thai (ไทย)', displayCode: 'TH' },
  { code: 'id', label: 'Indonesian (Bahasa Indonesia)', displayCode: 'ID' },
  { code: 'ar', label: 'Arabic (العربية)', displayCode: 'AR' },
  { code: 'hi', label: 'Hindi (हिन्दी)', displayCode: 'HI' },
];

export const SUPPORTED_LANGUAGES = TARGET_LANGUAGES;

export const LEGACY_PREFIX_TO_CODE: Record<string, string> = {
  'auto detect': AUTO_DETECT_LANG_CODE,
  japanese: 'ja',
  english: 'en',
  korean: 'ko',
  chinese: 'zh-Hans',
  'simplified chinese': 'zh-Hans',
  'chinese simplified': 'zh-Hans',
  'traditional chinese': 'zh-Hant',
  'chinese traditional': 'zh-Hant',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hant': 'zh-Hant',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  vietnamese: 'vi',
  thai: 'th',
  indonesian: 'id',
  arabic: 'ar',
  hindi: 'hi',
};

function findLanguage(value: string): Language | undefined {
  const lower = value.trim().toLowerCase();
  return TARGET_LANGUAGES.find(l =>
    l.code.toLowerCase() === lower ||
    l.displayCode.toLowerCase() === lower ||
    l.label.toLowerCase() === lower
  );
}

function resolveLegacyLanguageCode(value: string): string | undefined {
  const lower = value.trim().toLowerCase();
  const matchedPrefix = Object.keys(LEGACY_PREFIX_TO_CODE)
    .sort((a, b) => b.length - a.length)
    .find(prefix => lower.startsWith(prefix));
  return matchedPrefix ? LEGACY_PREFIX_TO_CODE[matchedPrefix] : undefined;
}

function normalizeLanguageCode(rawValue: string | undefined, fallback: string, allowAuto: boolean): string {
  if (!rawValue) return fallback;

  const trimmed = rawValue.trim();
  if (!trimmed) return fallback;

  if (allowAuto && trimmed.toLowerCase() === AUTO_DETECT_LANG_CODE) {
    return AUTO_DETECT_LANG_CODE;
  }

  const byLanguage = findLanguage(trimmed);
  if (byLanguage) {
    return byLanguage.code;
  }

  const byLegacy = resolveLegacyLanguageCode(trimmed);
  if (byLegacy && (allowAuto || byLegacy !== AUTO_DETECT_LANG_CODE)) {
    return byLegacy;
  }

  return fallback;
}

export function normalizeSourceLanguageCode(rawValue: string | undefined): string {
  return normalizeLanguageCode(rawValue, DEFAULT_SOURCE_LANG_CODE, true);
}

export function normalizeTargetLanguageCode(rawValue: string | undefined): string {
  return normalizeLanguageCode(rawValue, DEFAULT_TARGET_LANG_CODE, false);
}

export function getLanguageDisplayCode(lang: string): string {
  const normalized = normalizeTargetLanguageCode(lang);
  return findLanguage(normalized)?.displayCode ?? normalized.toUpperCase().slice(0, 2);
}

export function resolveSourceLanguageCode(lang: string): string {
  return normalizeSourceLanguageCode(lang);
}

export function getLanguageLabel(code: string): string {
  if (code === AUTO_DETECT_LANG_CODE) {
    return 'Auto';
  }

  return TARGET_LANGUAGES.find(l => l.code === code)?.label ?? code;
}
