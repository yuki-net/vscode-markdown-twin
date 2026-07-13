import { renderMarkdownPreview } from '../../../../adapters/vscode/preview/previewRenderer';

describe('renderMarkdownPreview', () => {
  it('renders asynchronously highlighted fenced code without hljs classes', async () => {
    const highlightService = {
      highlightFence: jest.fn(async (source: string, language: string | undefined) => ({
        kind: 'highlighted',
        languageId: language ?? 'plain',
        html: `<span style="color:#ff0000">${source.replace(/</g, '&lt;')}</span>`,
      })),
    };

    const html = await renderMarkdownPreview(
      {
        text: '```ts\nconst value = 1;\n```',
        lineOrigins: [0, 1, 2],
      },
      {},
      highlightService as any,
      jest.fn()
    );

    expect(highlightService.highlightFence).toHaveBeenCalledWith('const value = 1;\n', 'ts');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain('<span style="color:#ff0000">const value = 1;');
    expect(html).not.toContain('hljs');
  });

  it('logs grammar failures and renders their escaped fallback', async () => {
    const error = new Error('broken grammar');
    const logError = jest.fn();
    const highlightService = {
      highlightFence: jest.fn(async () => ({
        kind: 'failed',
        html: '&lt;unsafe&gt;',
        error,
      })),
    };

    const html = await renderMarkdownPreview(
      {
        text: '```broken\n<unsafe>\n```',
        lineOrigins: [0, 1, 2],
      },
      {},
      highlightService as any,
      logError
    );

    expect(html).toContain('&lt;unsafe&gt;');
    expect(logError).toHaveBeenCalledWith('Preview code highlight failed for broken', error);
  });
});
