export interface PreviewScrollMessage {
  readonly command: 'scroll';
  readonly line: number;
  readonly mode?: 'preview' | 'source';
  readonly anchorLine?: number;
}

export type PreviewWebviewMessage = PreviewScrollMessage;
