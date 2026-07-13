import * as path from 'path';
import * as vscode from 'vscode';

export function createWebviewNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function createLocalResourceRoots(extensionUri: vscode.Uri, document: vscode.TextDocument): vscode.Uri[] {
  const roots = [vscode.Uri.file(path.join(extensionUri.fsPath, 'media'))];

  if (document.uri.scheme === 'file') {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    roots.push(workspaceFolder?.uri ?? vscode.Uri.file(path.dirname(document.uri.fsPath)));
  }

  return roots;
}

export function resolveMarkdownResourceUri(
  href: string,
  document: vscode.TextDocument,
  webview: vscode.Webview
): string {
  try {
    if (/^[a-z-]+:/i.test(href)) {
      return /^file:/i.test(href)
        ? webview.asWebviewUri(vscode.Uri.parse(href)).toString(true)
        : href;
    }

    if (document.uri.scheme !== 'file') {
      return href;
    }

    const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(href);
    const resourcePath = decodeURIComponent(match?.[1] ?? href).replace(/\\/g, '/');
    const query = match?.[2]?.slice(1) ?? '';
    const fragment = match?.[3]?.slice(1) ?? '';

    const uri = resourcePath.startsWith('/')
      ? resolveWorkspaceAbsoluteResource(resourcePath, document) ?? vscode.Uri.file(resourcePath)
      : vscode.Uri.joinPath(vscode.Uri.file(path.dirname(document.uri.fsPath)), resourcePath);

    return webview.asWebviewUri(uri.with({ query, fragment })).toString(true);
  } catch {
    return href;
  }
}

function resolveWorkspaceAbsoluteResource(resourcePath: string, document: vscode.TextDocument): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder
    ? vscode.Uri.joinPath(workspaceFolder.uri, resourcePath)
    : undefined;
}
