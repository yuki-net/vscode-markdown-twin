import { escapeHtml } from '../../../utils/html';
import type { TranslatedMarkdownResult } from '../../../domain/translationResult';
import type { TextMateHighlightService } from './highlighting/textMateHighlightService';
import { createMarkdownPreviewEngine, type MarkdownPreviewEngineOptions } from './markdownEngine';

type MarkdownToken = {
  type: string;
  content: string;
  info?: string;
};

export async function renderMarkdownPreview(
  translated: TranslatedMarkdownResult,
  options: Omit<MarkdownPreviewEngineOptions, 'highlightCode'>,
  highlightService: TextMateHighlightService,
  logHighlightError: (message: string, error: unknown) => void
): Promise<string> {
  const highlightedFences = new Map<string, string>();
  const md = createMarkdownPreviewEngine({
    ...options,
    highlightCode: (code, language) => highlightedFences.get(fenceKey(code, language)) ?? escapeHtml(code),
  });
  const env = {};
  const tokens = md.parse(translated.text, env) as MarkdownToken[];
  const uniqueFences = new Map<string, { code: string; language?: string }>();

  for (const token of tokens) {
    if (token.type !== 'fence') continue;
    const language = fenceLanguage(token.info);
    uniqueFences.set(fenceKey(token.content, language), { code: token.content, language });
  }

  await Promise.all([...uniqueFences.entries()].map(async ([key, fence]) => {
    const result = await highlightService.highlightFence(fence.code, fence.language);
    highlightedFences.set(key, result.html);
    if (result.kind === 'failed') {
      logHighlightError(`Preview code highlight failed for ${fence.language ?? 'plain text'}`, result.error);
    }
  }));

  return md.renderer.render(tokens as any, md.options, env);
}

function fenceLanguage(info: string | undefined): string | undefined {
  return info?.trim().split(/\s+/, 1)[0] || undefined;
}

function fenceKey(code: string, language: string | undefined): string {
  return `${language?.toLowerCase() ?? ''}\0${code}`;
}
