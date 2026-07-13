import type { TranslatedMarkdownResult } from '../translationResult';

export interface TextSegment {
  readonly text: string;
  readonly lineOrigins: readonly number[];
}

export function buildLineOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') offsets.push(index + 1);
  }
  offsets.push(source.length);
  return offsets;
}

export function buildIdentityLineOrigins(source: string): number[] {
  return Array.from({ length: source.split(/\r?\n/).length }, (_, index) => index);
}

export function offsetToLine(lineOffsets: readonly number[], offset: number): number {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineOffsets[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, Math.min(low, lineOffsets.length - 2));
}

export function buildSegmentLineOrigins(text: string, startLine: number): number[] {
  if (text.length === 0) return [];
  const origins = [startLine];
  let line = startLine;
  for (const _ of text.match(/\r?\n/g) ?? []) origins.push(++line);
  return origins;
}

export function buildReplacementLineOrigins(text: string, startLine: number, endLine: number): number[] {
  if (text.length === 0) return [];
  const maxLine = Math.max(startLine, endLine);
  return Array.from(
    { length: text.split(/\r?\n/).length },
    (_, index) => Math.min(startLine + index, maxLine)
  );
}

export function mergeTextSegments(segments: readonly TextSegment[]): TranslatedMarkdownResult {
  let text = '';
  const lineOrigins: number[] = [];
  let startsNewLine = true;
  for (const segment of segments) {
    text += segment.text;
    if (segment.text.length === 0 || segment.lineOrigins.length === 0) continue;
    if (startsNewLine) lineOrigins.push(...segment.lineOrigins);
    else {
      if (lineOrigins.length === 0) lineOrigins.push(segment.lineOrigins[0]);
      lineOrigins.push(...segment.lineOrigins.slice(1));
    }
    startsNewLine = /\r?\n$/.test(segment.text);
  }
  if (lineOrigins.length === 0) lineOrigins.push(0);
  return { text, lineOrigins };
}
