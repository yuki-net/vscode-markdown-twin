import { isPreviewWebviewMessage } from '../../webview/protocol';
import { buildPreviewWebviewScript } from '../../webview/main';

describe('webview protocol', () => {
  it('accepts only finite webview scroll messages', () => {
    expect(isPreviewWebviewMessage({
      command: 'scroll',
      line: 4.5,
      origin: 'webview',
      mode: 'preview',
    })).toBe(true);
    expect(isPreviewWebviewMessage({ command: 'scroll', line: Number.NaN, origin: 'webview' }))
      .toBe(false);
    expect(isPreviewWebviewMessage({ command: 'scroll', line: 1, origin: 'editor' }))
      .toBe(false);
  });

  it('keeps the external webview bundle behavior in the generated runtime', () => {
    const script = buildPreviewWebviewScript({
      sourceLineCount: 1,
      sourceLineOrigins: [0],
      sourceLineHeight: 19,
      initialScrollLine: 0,
      sourceText: '# Title',
      isSource: false,
    });

    expect(script).toContain('function interpolateOffsetForLine');
    expect(script).toContain('function getPreviewEditorLineForPageOffset');
    expect(script).toContain('function getSourceAnchorLineAtContainerTop');
    expect(script).toContain("anchorLine, origin: 'webview', mode: 'source'");
  });
});
