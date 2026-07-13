import * as vscode from 'vscode';
import { buildPreviewWebviewScript } from '../../../webview/main';

export interface BuildPreviewWebviewHtmlArgs {
  previewHeaderTitle: string;
  renderedHtml: string;
  highlightedSource: string;
  sourceText: string;
  sourceLineCount: number;
  sourceLineOrigins: number[];
  sourceLineHeight: number;
  initialScrollLine: number;
  sourceHighlightError?: string;
  markdownCssUri: vscode.Uri;
  twinCssUri: vscode.Uri;
  bodyClasses: string[];
  htmlStyleVars: Record<string, string>;
  cspSource: string;
  scriptNonce: string;
  viewMode: 'preview' | 'source';
}

export function buildPreviewWebviewHtml(args: BuildPreviewWebviewHtmlArgs): string {
  const {
    previewHeaderTitle,
    renderedHtml,
    highlightedSource,
    sourceText,
    sourceLineCount,
    sourceLineOrigins,
    sourceLineHeight,
    initialScrollLine,
    sourceHighlightError,
    markdownCssUri,
    twinCssUri,
    bodyClasses,
    htmlStyleVars,
    cspSource,
    scriptNonce,
    viewMode
  } = args;

  const isPreview = viewMode === 'preview';
  const isSource = viewMode === 'source';
  const modeClass = isSource ? 'mt-source-mode' : 'mt-preview-mode';
  const classAttr = [...bodyClasses, modeClass].join(' ');
  const styleAttr = Object.entries(htmlStyleVars)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
  const script = buildPreviewWebviewScript({
    sourceLineCount,
    sourceLineOrigins,
    sourceLineHeight,
    initialScrollLine,
    sourceText,
    isSource,
  });

  return `<!DOCTYPE html>
<html lang="en" class="${classAttr}" style="${styleAttr}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; style-src-attr 'unsafe-inline'; style-src-elem ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${scriptNonce}';">
    <title>Markdown Twin Preview</title>
    <link rel="stylesheet" href="${markdownCssUri}">
    <link rel="stylesheet" href="${twinCssUri}">
</head>
<body class="${classAttr}" data-vscode-context='{"webviewSection":"markdownTwinContent","preventDefaultContextMenuItems":true}'>
    <div id="mt-topbar">${previewHeaderTitle}</div>
    <div id="preview-container" style="display: ${isPreview ? 'block' : 'none'};">
        <div id="mt-preview-highlight-error" style="display: ${sourceHighlightError ? 'block' : 'none'};">${sourceHighlightError ?? ''}</div>
        ${renderedHtml}
    </div>
    <div id="source-shell" style="display: ${isSource ? 'flex' : 'none'};">
        <div id="mt-source-sticky" class="is-empty">
            <div id="mt-source-sticky-content"></div>
        </div>
        <div id="source-container">
            <div id="mt-source-highlight-error" style="display: ${sourceHighlightError ? 'block' : 'none'};">${sourceHighlightError ?? ''}</div>
            <div id="line-numbers"></div>
            <pre class="language-markdown"><code class="language-markdown" id="source-code">${highlightedSource}</code></pre>
            <div id="mt-source-scrollbar" aria-hidden="true">
                <div id="mt-source-scrollbar-track">
                    <div id="mt-source-scrollbar-thumb"></div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${scriptNonce}">
${script}
    </script>
</body>
</html>`;
}
