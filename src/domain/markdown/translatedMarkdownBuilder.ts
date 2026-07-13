import MarkdownIt from 'markdown-it';
import { EXCLUDED_TOKEN_TYPES } from './extractTranslationUnits';

export type { TranslationViewMode } from '../translationViewMode';
import type { TranslationViewMode } from '../translationViewMode';
import type { TranslatedMarkdownResult } from '../translationResult';
import {
  buildIdentityLineOrigins,
  buildLineOffsets,
  buildReplacementLineOrigins,
  buildSegmentLineOrigins,
  mergeTextSegments,
  offsetToLine,
} from './sourceLineMap';

type Replacement = {
  start: number;
  end: number;
  text: string;
  sourceStartLine: number;
  sourceEndLine: number;
};

interface BuildTranslatedMarkdownArgs {
  source: string;
  langCode: string;
  mode: TranslationViewMode;
  md: MarkdownIt;
  getTranslation: (content: string, langCode: string) => string | null;
}

export function buildTranslatedMarkdown(args: BuildTranslatedMarkdownArgs): TranslatedMarkdownResult {
  const { source: originalText, langCode, mode, md, getTranslation } = args;
  const lineOffsets = buildLineOffsets(originalText);

  const replacements = collectInlineReplacements(
    originalText,
    langCode,
    mode,
    md,
    getTranslation,
    lineOffsets
  );
  if (replacements.length === 0) {
    return {
      text: originalText,
      lineOrigins: buildIdentityLineOrigins(originalText),
    };
  }

  return applyReplacements(originalText, replacements, lineOffsets);
}

function collectInlineReplacements(
  source: string,
  langCode: string,
  mode: TranslationViewMode,
  md: MarkdownIt,
  getTranslation: (content: string, langCode: string) => string | null,
  lineOffsets: number[]
): Replacement[] {
  const tokens = md.parse(source, {});
  const rangeCursor = new Map<string, number>();
  const replacements: Replacement[] = [];
  let tableRowRange: [number, number] | null = null;
  let inTableCell = false;
  let headingTag: string | null = null;

  for (const token of tokens) {
    if (token.type === 'heading_open') {
      headingTag = token.tag;
      continue;
    }
    if (token.type === 'heading_close') {
      headingTag = null;
      continue;
    }
    if (token.type === 'tr_open' && Array.isArray(token.map) && token.map.length >= 2) {
      tableRowRange = [token.map[0], token.map[1]];
      continue;
    }
    if (token.type === 'tr_close') {
      tableRowRange = null;
      continue;
    }
    if (token.type === 'th_open' || token.type === 'td_open') {
      inTableCell = true;
      continue;
    }
    if (token.type === 'th_close' || token.type === 'td_close') {
      inTableCell = false;
      continue;
    }

    if (EXCLUDED_TOKEN_TYPES.includes(token.type as any)) continue;
    if (token.type !== 'inline') continue;

    const translation = getTranslation(token.content, langCode);
    if (!translation || translation === token.content) continue;
    const tokenRange = Array.isArray(token.map) && token.map.length >= 2
      ? [token.map[0], token.map[1]] as [number, number]
      : tableRowRange;
    if (!tokenRange) continue;

    const [startLine, endLineExclusive] = tokenRange;
    const rangeStart = lineOffsets[startLine] ?? 0;
    const rangeEnd = lineOffsets[endLineExclusive] ?? source.length;
    const rangeKey = `${startLine}:${endLineExclusive}`;
    const searchStart = Math.max(rangeStart, rangeCursor.get(rangeKey) ?? rangeStart);

    const hitIndex = source.indexOf(token.content, searchStart);
    if (hitIndex < 0) continue;
    if (hitIndex + token.content.length > rangeEnd) continue;

    rangeCursor.set(rangeKey, hitIndex + token.content.length);

    const replacementText = buildReplacementText(token.content, translation, mode, inTableCell, headingTag);

    replacements.push({
      start: hitIndex,
      end: hitIndex + token.content.length,
      text: replacementText,
      sourceStartLine: offsetToLine(lineOffsets, hitIndex),
      sourceEndLine: offsetToLine(lineOffsets, Math.max(hitIndex, hitIndex + token.content.length - 1)),
    });
  }

  return normalizeReplacements(replacements);
}

function buildReplacementText(
  original: string,
  translation: string,
  mode: TranslationViewMode,
  inTableCell: boolean,
  headingTag: string | null
): string {
  if (inTableCell) {
    const tableSafeTranslation = normalizeTableCellText(translation);
    return mode === 'translation-only'
      ? tableSafeTranslation
      : `${tableSafeTranslation}<span class="mt-bilingual-original-cell">${escapeHtml(normalizeTableCellText(original))}</span>`;
  }

  if (mode === 'bilingual' && headingTag && /^h[1-6]$/.test(headingTag)) {
    return `${translation}\n\n<${headingTag} class="mt-bilingual-original mt-bilingual-original-heading">${escapeHtml(original)}</${headingTag}>`;
  }

  return mode === 'translation-only'
    ? translation
    : `${translation}\n\n<div class="mt-bilingual-original">${formatOriginalBlock(original)}</div>`;
}

function normalizeTableCellText(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatOriginalBlock(text: string): string {
  return escapeHtml(text)
    .split(/\r?\n/)
    .join('<br>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeReplacements(replacements: Replacement[]): Replacement[] {
  const ordered = replacements.sort((a, b) => {
    if (a.start === b.start) return b.end - a.end;
    return a.start - b.start;
  });

  const result: Replacement[] = [];
  let lastEnd = -1;
  for (const replacement of ordered) {
    if (replacement.start < lastEnd) {
      continue;
    }
    result.push(replacement);
    lastEnd = replacement.end;
  }

  return result;
}

function applyReplacements(
  source: string,
  replacements: Replacement[],
  lineOffsets: number[]
): TranslatedMarkdownResult {
  const ordered = [...replacements].sort((a, b) => a.start - b.start);
  const segments: Array<{ text: string; lineOrigins: number[] }> = [];
  let cursor = 0;

  for (const replacement of ordered) {
    if (cursor < replacement.start) {
      const unchangedText = source.slice(cursor, replacement.start);
      segments.push({
        text: unchangedText,
        lineOrigins: buildSegmentLineOrigins(unchangedText, offsetToLine(lineOffsets, cursor)),
      });
    }

    segments.push({
      text: replacement.text,
      lineOrigins: buildReplacementLineOrigins(
        replacement.text,
        replacement.sourceStartLine,
        replacement.sourceEndLine
      ),
    });
    cursor = replacement.end;
  }

  if (cursor < source.length) {
    const tailText = source.slice(cursor);
    segments.push({
      text: tailText,
      lineOrigins: buildSegmentLineOrigins(tailText, offsetToLine(lineOffsets, cursor)),
    });
  }

  return mergeTextSegments(segments);
}
