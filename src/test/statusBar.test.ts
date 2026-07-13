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

  it('renders the remaining completed document after an in-progress document is removed', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const completed = vscode.Uri.file('/workspace/completed.md');
    const translating = vscode.Uri.file('/workspace/translating.md');

    statusBar.showComplete(completed, 'translation-only', 'DeepL');
    statusBar.showProgress(translating, 'Google Cloud', 2, 10);
    statusBar.removeDocument(translating);

    expect(item.text).toContain('Twin DeepL (KO)');
    expect(item.text).not.toContain('20%');
  });

  it('returns to the ready display after the final document is removed', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const document = vscode.Uri.file('/workspace/document.md');

    statusBar.showProgress(document, 'DeepL', 2, 10);
    statusBar.removeDocument(document);

    expect(item.text).toContain('Twin: Google Cloud (KO)');
    expect(item.text).not.toContain('20%');
  });

  it('keeps another document progress visible when one document fails', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const failed = vscode.Uri.file('/workspace/failed.md');
    const translating = vscode.Uri.file('/workspace/translating.md');

    statusBar.showProgress(translating, 'DeepL', 3, 10);
    statusBar.showError(failed, 'Google Cloud');

    expect(item.text).toContain('Twin DeepL 30%');
    expect(item.text).not.toContain('Error');
  });

  it('restores a completed document after an errored document is removed', () => {
    const statusBar = new StatusBar();
    const item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    const completed = vscode.Uri.file('/workspace/completed.md');
    const failed = vscode.Uri.file('/workspace/failed.md');

    statusBar.showComplete(completed, 'translation-only', 'DeepL');
    statusBar.showError(failed, 'Google Cloud');
    expect(item.text).toContain('Error');

    statusBar.removeDocument(failed);

    expect(item.text).toContain('Twin DeepL (KO)');
    expect(item.text).not.toContain('Error');
  });
});
