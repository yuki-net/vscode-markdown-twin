/// <reference lib="dom" />

import { buildPreviewWebviewScript } from './main';
import type { PreviewInitialState } from './protocol';

const stateElement = document.getElementById('markdown-twin-initial-state');
if (!stateElement?.textContent) {
  throw new Error('Markdown Twin initial webview state is missing');
}

const state = JSON.parse(stateElement.textContent) as PreviewInitialState;
const currentScript = document.currentScript as HTMLScriptElement | null;
const runtime = document.createElement('script');
runtime.nonce = currentScript?.nonce ?? '';
runtime.textContent = buildPreviewWebviewScript({
  sourceLineCount: state.sourceLineCount,
  sourceLineOrigins: [...state.sourceLineOrigins],
  sourceLineHeight: state.sourceLineHeight,
  initialScrollLine: state.initialScrollLine,
  sourceText: state.sourceText,
  isSource: state.viewMode === 'source',
});
document.head.appendChild(runtime);
runtime.remove();
