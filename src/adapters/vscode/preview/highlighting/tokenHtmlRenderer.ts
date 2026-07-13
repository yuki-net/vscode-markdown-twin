import type { IGrammar, StateStack } from 'vscode-textmate';
import { INITIAL } from 'vscode-textmate';
import { escapeHtml } from '../../../../utils/html';

export function renderTokenizedHtml(grammar: IGrammar, source: string, colorMap: string[]): string {
  const lines = source.split(/\r?\n/);
  const renderedLines: string[] = [];
  let ruleStack: StateStack | null = INITIAL;

  for (const line of lines) {
    const result = grammar.tokenizeLine2(line, ruleStack);
    ruleStack = result.ruleStack;
    renderedLines.push(renderLine(line, result.tokens, colorMap));
  }

  return renderedLines.join('\n');
}

function renderLine(line: string, tokens: Uint32Array, colorMap: string[]): string {
  if (!line || tokens.length === 0) return '';

  const segments: Array<{ style: string; html: string }> = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const start = tokens[index];
    const metadata = tokens[index + 1];
    const end = index + 2 < tokens.length ? tokens[index + 2] : line.length;
    if (end <= start) continue;

    const html = escapeHtml(line.slice(start, end));
    const style = styleFromMetadata(metadata, colorMap);
    const previous = segments[segments.length - 1];
    if (previous?.style === style) {
      previous.html += html;
    } else {
      segments.push({ style, html });
    }
  }

  return segments
    .map(segment => segment.style ? `<span style="${segment.style}">${segment.html}</span>` : segment.html)
    .join('');
}

function styleFromMetadata(metadata: number, colorMap: string[]): string {
  const fontStyle = (metadata >>> 11) & 0b1111;
  const foregroundId = (metadata >>> 15) & 0x1ff;
  const backgroundId = (metadata >>> 24) & 0xff;
  const styles: string[] = [];

  const foreground = colorMap[foregroundId];
  if (foregroundId > 1 && foreground) styles.push(`color:${foreground}`);

  const background = colorMap[backgroundId];
  // TextMate reserves the initial background entry for the theme default.
  // Let the preview code-block background show through unless a token rule overrides it.
  if (backgroundId > 2 && background) styles.push(`background-color:${background}`);

  if (fontStyle & 1) styles.push('font-style:italic');
  if (fontStyle & 2) styles.push('font-weight:700');
  if (fontStyle & 4) styles.push('text-decoration:underline');
  if (fontStyle & 8) styles.push('text-decoration:line-through');

  return styles.join(';');
}
