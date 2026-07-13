import * as vscode from 'vscode';
import { StatusBar } from '../statusBar';

describe('StatusBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.env as any).language = 'en';
  });

  it('aggregates parallel document progress and lists each file in the tooltip', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');

    statusBar.showProgress(first, 'Google Cloud', 1, 4);
    statusBar.showProgress(second, 'DeepL', 3, 6);

    expect(item.text).toContain('Twin: 2 files 40%');
    expect(item.tooltip).toContain('first.md: 25% (1/4)');
    expect(item.tooltip).toContain('second.md: 50% (3/6)');
    expect(item.tooltip).toContain('Google Cloud');
    expect(item.tooltip).toContain('DeepL');
  });

  it('returns to single-document progress when another document completes', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');

    statusBar.showProgress(first, 'Google Cloud', 1, 4);
    statusBar.showProgress(second, 'DeepL', 3, 6);
    statusBar.showComplete(first, 'translation-only', 'Google Cloud');

    expect(item.text).toContain('Twin DeepL 50% (KO)');
  });

  it('shows only the selected language even when one document has multiple previews', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const document = vscode.Uri.file('/workspace/document.md');

    statusBar.showProgress(document, 'Google Cloud', 1, 4);

    expect(item.text).toContain('(KO)');
    expect(item.text).not.toMatch(/JA|RU|US/);
  });
});
