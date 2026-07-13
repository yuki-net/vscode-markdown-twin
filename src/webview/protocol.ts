export interface PreviewScrollMessage {
  readonly command: 'scroll';
  readonly line: number;
  readonly origin: 'webview';
  readonly mode?: 'preview' | 'source';
  readonly anchorLine?: number;
}

export type PreviewWebviewMessage = PreviewScrollMessage;

export interface PreviewInitialState {
  readonly sourceLineCount: number;
  readonly sourceLineOrigins: readonly number[];
  readonly sourceLineHeight: number;
  readonly initialScrollLine: number;
  readonly sourceText: string;
  readonly viewMode: PreviewViewMode;
}

export type PreviewViewMode = 'preview' | 'source';

export type ExtensionToPreviewMessage =
  | {
      readonly type: 'update';
      readonly html?: string;
      readonly sourceHtml?: string;
      readonly sourceText?: string;
      readonly sourceLineCount?: number;
      readonly sourceLineOrigins?: readonly number[];
      readonly sourceLineHeight?: number;
      readonly scrollLine: number;
      readonly sourceHighlightError?: string;
    }
  | { readonly type: 'setViewMode'; readonly mode: PreviewViewMode }
  | { readonly type: 'scroll'; readonly line: number; readonly origin: 'editor' };

export function isPreviewWebviewMessage(value: unknown): value is PreviewWebviewMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<PreviewScrollMessage>;
  return message.command === 'scroll'
    && message.origin === 'webview'
    && typeof message.line === 'number'
    && Number.isFinite(message.line)
    && (message.mode === undefined || message.mode === 'preview' || message.mode === 'source')
    && (message.anchorLine === undefined
      || (typeof message.anchorLine === 'number' && Number.isFinite(message.anchorLine)));
}
