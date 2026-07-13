import * as vscode from 'vscode';

export function getMarkdownPreviewBodyClasses(): string[] {
  const classes = ['vscode-body'];
  const previewConfig = vscode.workspace.getConfiguration('markdown.preview');

  if (previewConfig.get<boolean>('markEditorSelection', true)) {
    classes.push('showEditorSelection');
  }
  if (previewConfig.get<boolean>('scrollBeyondLastLine', true)) {
    classes.push('scrollBeyondLastLine');
  }
  if (previewConfig.get<boolean>('wordWrap', true)) {
    classes.push('wordWrap');
  }

  return classes;
}

export function getMarkdownPreviewStyleVars(): Record<string, string> {
  const previewConfig = vscode.workspace.getConfiguration('markdown.preview');
  const vars: Record<string, string> = {};

  const fontFamily = previewConfig.get<string>('fontFamily');
  if (fontFamily) {
    vars['--markdown-font-family'] = fontFamily;
  }

  const fontSize = previewConfig.get<number>('fontSize');
  if (typeof fontSize === 'number' && fontSize > 0) {
    vars['--markdown-font-size'] = `${fontSize}px`;
  }

  const lineHeight = previewConfig.get<number>('lineHeight');
  if (typeof lineHeight === 'number' && lineHeight > 0) {
    vars['--markdown-line-height'] = String(lineHeight);
  }

  return vars;
}

export function shouldScrollPreviewWithEditor(): boolean {
  return vscode.workspace.getConfiguration('markdown.preview').get<boolean>('scrollPreviewWithEditor', true);
}

export function shouldScrollEditorWithPreview(): boolean {
  return vscode.workspace.getConfiguration('markdown.preview').get<boolean>('scrollEditorWithPreview', true);
}
