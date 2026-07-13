import { escapeHtml } from '../../../utils/html';
import type { TranslatedMarkdownResult } from '../../../domain/translationResult';
import type { TextMateHighlightService } from './highlighting/textMateHighlightService';

const SOURCE_LINE_HEIGHT = 19;

export interface SourceViewModel {
  highlightedSource: string;
  sourceText: string;
  sourceLineCount: number;
  sourceLineOrigins: number[];
  sourceLineHeight: number;
  sourceHighlightError?: string;
}

export async function buildSourceViewModel(
  translated: TranslatedMarkdownResult,
  highlightService: TextMateHighlightService,
  logHighlightError: (message: string, err: unknown) => void
): Promise<SourceViewModel> {
  const sourceMarkdown = translated.text;
  let highlightedSource = escapeHtml(sourceMarkdown);
  let sourceHighlightError: string | undefined;

  try {
    const result = await highlightService.highlightLanguage(sourceMarkdown, 'markdown');
    highlightedSource = result.html;
    if (result.kind === 'failed') {
      sourceHighlightError = `Source highlight failed: ${result.error.message}`;
      logHighlightError(sourceHighlightError, result.error);
    }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    sourceHighlightError = `Source highlight failed: ${reason}`;
    logHighlightError(sourceHighlightError, error);
  }

  return {
    highlightedSource,
    sourceText: sourceMarkdown,
    sourceLineCount: countLines(sourceMarkdown),
    sourceLineOrigins: translated.lineOrigins,
    sourceLineHeight: SOURCE_LINE_HEIGHT,
    sourceHighlightError,
  };
}

export function emptySourceViewModel(translated: TranslatedMarkdownResult): SourceViewModel {
  return {
    highlightedSource: '',
    sourceText: translated.text,
    sourceLineCount: countLines(translated.text),
    sourceLineOrigins: translated.lineOrigins,
    sourceLineHeight: SOURCE_LINE_HEIGHT,
  };
}

function countLines(text: string): number {
  return text.split(/\r?\n/).length;
}
