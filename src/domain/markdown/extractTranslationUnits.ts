export const EXCLUDED_TOKEN_TYPES = ['fence', 'code_block', 'html_block'] as const;

export function isIdentifierOnly(text: string): boolean {
  return /^[a-zA-Z0-9\-_/.@:#*~]+$/.test(text.trim());
}

const LANG_TO_REGEX: Record<string, RegExp> = {
  ja: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/,
  en: /[A-Za-z]/,
  ko: /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/,
  'zh-Hans': /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/,
  'zh-Hant': /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/,
  es: /[A-Za-z\u00c0-\u00ff]/,
  fr: /[A-Za-z\u00c0-\u00ff]/,
  de: /[A-Za-z\u00c0-\u00ff]/,
  it: /[A-Za-z\u00c0-\u00ff]/,
  pt: /[A-Za-z\u00c0-\u00ff]/,
  ru: /[\u0400-\u04ff]/,
  vi: /[A-Za-z\u00c0-\u024f\u1e00-\u1eff]/,
  th: /[\u0e00-\u0e7f]/,
  id: /[A-Za-z]/,
  ar: /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/,
  hi: /[\u0900-\u097f]/,
};

function containsLanguageText(text: string, sourceLang: string): boolean {
  if (sourceLang === 'auto') {
    return Object.values(LANG_TO_REGEX).some(pattern => pattern.test(text));
  }

  const pattern = LANG_TO_REGEX[sourceLang];
  if (!pattern) {
    return /[^\x00-\x7f]/.test(text) || /[A-Za-z]/.test(text);
  }

  return pattern.test(text);
}

export function shouldTranslate(text: string, sourceLang: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isIdentifierOnly(trimmed)) return false;
  return containsLanguageText(trimmed, sourceLang);
}

export interface TextPart {
  text: string;
  translate: boolean;
}

export function splitTranslatableParts(text: string, sourceLang: string): TextPart[] {
  const parts: TextPart[] = [];
  // Keep obviously code-like spans intact, but allow normal prose words to be translated.
  const identifierPattern = /(`[^`]*`|https?:\/\/[^\s)]+|www\.[^\s)]+|[A-Za-z0-9][A-Za-z0-9\-_./:@#]*[0-9_./:@#-][A-Za-z0-9\-_./:@#]*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push({ text: before, translate: containsLanguageText(before, sourceLang) });
    }

    parts.push({ text: match[0], translate: false });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    parts.push({ text: remaining, translate: containsLanguageText(remaining, sourceLang) });
  }

  return parts;
}

export function joinTranslatedParts(parts: TextPart[], translations: Map<number, string>): string {
  let transIdx = 0;
  return parts.map(part => {
    if (part.translate) {
      return translations.get(transIdx++) ?? part.text;
    }
    return part.text;
  }).join('');
}
