import { Uri } from 'vscode';
import { buildPreviewWebviewHtml } from '../../../../adapters/vscode/preview/webviewHtml';

describe('buildPreviewWebviewHtml', () => {
  it('applies VS Code markdown preview body classes and style variables', () => {
    const html = buildPreviewWebviewHtml({
      previewHeaderTitle: 'Preview',
      renderedHtml: '<h1>Preview</h1>',
      highlightedSource: '',
      sourceText: '',
      sourceLineCount: 1,
      sourceLineOrigins: [0],
      sourceLineHeight: 19,
      initialScrollLine: 0,
      markdownCssUri: Uri.parse('vscode-resource:/markdown.css') as any,
      twinCssUri: Uri.parse('vscode-resource:/markdown-twin.css') as any,
      webviewScriptUri: Uri.parse('vscode-resource:/webview.js') as any,
      bodyClasses: ['vscode-body', 'wordWrap', 'scrollBeyondLastLine', 'showEditorSelection'],
      htmlStyleVars: {
        '--markdown-font-size': '15px',
        '--markdown-line-height': '1.6',
      },
      cspSource: 'vscode-resource:',
      scriptNonce: 'nonce',
      viewMode: 'preview',
    });

    expect(html).toContain('class="vscode-body wordWrap scrollBeyondLastLine showEditorSelection mt-preview-mode"');
    expect(html).toContain('style="--markdown-font-size: 15px; --markdown-line-height: 1.6;"');
    expect(html).toContain('id="markdown-twin-initial-state" type="application/json"');
    expect(html).toContain('"viewMode":"preview"');
    expect(html).toContain('nonce="nonce" src="vscode-resource:/webview.js"');
    expect(html).not.toContain('function interpolateOffsetForLine');
  });
});
