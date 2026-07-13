import {
  WEBVIEW_SCRIPT_BOOTSTRAP,
  WEBVIEW_SCRIPT_COPY,
  WEBVIEW_SCRIPT_FOLDING,
  WEBVIEW_SCRIPT_NAVIGATION,
  WEBVIEW_SCRIPT_SHARED,
  WEBVIEW_SCRIPT_SOURCE_UI,
  WEBVIEW_SCRIPT_SOURCE_RENDERING,
  WEBVIEW_SCRIPT_STICKY,
} from './scripts';

export interface BuildPreviewWebviewScriptArgs {
  sourceLineCount: number;
  sourceLineOrigins: number[];
  sourceLineHeight: number;
  initialScrollLine: number;
  sourceText: string;
  isSource: boolean;
}

export function buildPreviewWebviewScript(args: BuildPreviewWebviewScriptArgs): string {
  const { sourceLineCount, sourceLineOrigins, sourceLineHeight, initialScrollLine, sourceText, isSource } = args;

  return `
        const vscode = acquireVsCodeApi();
        let isSyncingScroll = false;
        let scrollTimeout;
        const initialSourceLineCount = ${sourceLineCount};
        const initialSourceLineOrigins = ${JSON.stringify(sourceLineOrigins)};
        const initialSourceLineHeight = ${sourceLineHeight};
        const initialScrollLine = ${initialScrollLine};
        const initialSourceText = ${JSON.stringify(sourceText)};
        const initialViewMode = '${isSource ? 'source' : 'preview'}';
        const collapsedFoldStarts = new Set();
        let foldRangeByStart = new Map();
${WEBVIEW_SCRIPT_SHARED}
${WEBVIEW_SCRIPT_SOURCE_UI}
${WEBVIEW_SCRIPT_FOLDING}
${WEBVIEW_SCRIPT_SOURCE_RENDERING}
${WEBVIEW_SCRIPT_NAVIGATION}
${WEBVIEW_SCRIPT_STICKY}
${WEBVIEW_SCRIPT_COPY}
${WEBVIEW_SCRIPT_BOOTSTRAP}
    `;
}
