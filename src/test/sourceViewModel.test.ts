import { buildSourceViewModel } from '../adapters/vscode/preview/sourceViewModel';

describe('buildSourceViewModel', () => {
  it('uses the shared TextMate service for translated Markdown source', async () => {
    const highlightService = {
      highlightLanguage: jest.fn(async () => ({
        kind: 'highlighted',
        languageId: 'markdown',
        html: '<span style="color:#123456"># Title</span>',
      })),
    };

    const result = await buildSourceViewModel(
      {
        text: '# Title',
        lineOrigins: [4],
      },
      highlightService as any,
      jest.fn()
    );

    expect(highlightService.highlightLanguage).toHaveBeenCalledWith('# Title', 'markdown');
    expect(result.highlightedSource).toContain('color:#123456');
    expect(result.sourceLineOrigins).toEqual([4]);
  });

  it('uses escaped fallback output and reports shared-service failures', async () => {
    const error = new Error('grammar failed');
    const logError = jest.fn();
    const highlightService = {
      highlightLanguage: jest.fn(async () => ({
        kind: 'failed',
        languageId: 'markdown',
        html: '&lt;unsafe&gt;',
        error,
      })),
    };

    const result = await buildSourceViewModel(
      {
        text: '<unsafe>',
        lineOrigins: [0],
      },
      highlightService as any,
      logError
    );

    expect(result.highlightedSource).toBe('&lt;unsafe&gt;');
    expect(result.sourceHighlightError).toBe('Source highlight failed: grammar failed');
    expect(logError).toHaveBeenCalledWith('Source highlight failed: grammar failed', error);
  });
});
