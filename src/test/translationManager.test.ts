import * as vscode from 'vscode';
import { normalizeBatchSize, TranslationManager } from '../translationManager';
import { PreviewPanel } from '../previewPanel';

describe('TranslationManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PreviewPanel.allPanels.clear();
  });

  it('normalizes invalid batch sizes to a positive integer', () => {
    expect(normalizeBatchSize(undefined)).toBe(10);
    expect(normalizeBatchSize(Number.NaN)).toBe(10);
    expect(normalizeBatchSize(0)).toBe(1);
    expect(normalizeBatchSize(-2)).toBe(1);
    expect(normalizeBatchSize(1.9)).toBe(1);
  });

  it('persists mode changes to the defaultMode setting', async () => {
    const manager = new TranslationManager({} as any);

    await manager.toggleMode();

    expect(vscode.workspace.getConfiguration('markdownTwin').update).toHaveBeenCalledWith(
      'defaultMode',
      'Bilingual',
      vscode.ConfigurationTarget.Global
    );

    await manager.toggleMode();

    expect(vscode.workspace.getConfiguration('markdownTwin').update).toHaveBeenCalledWith(
      'defaultMode',
      'Translation Only',
      vscode.ConfigurationTarget.Global
    );
  });

  it('can generate clean translated markdown even when the current mode is bilingual', async () => {
    const manager = new TranslationManager({} as any);
    const document = {
      uri: vscode.Uri.file('/workspace/requirements.md'),
      getText: () => '原文です。',
    } as any;

    (manager as any).cache
      .ensureDocumentCache(document.uri, 'ko')
      .set('原文です。', 'Translated sentence.');

    await manager.toggleMode();

    const bilingual = manager.generateTranslatedMarkdown(document, 'ko');
    const cleanSource = manager.generateTranslatedMarkdown(document, 'ko', 'translation-only');

    expect(bilingual.text).toContain('mt-bilingual-original');
    expect(cleanSource.text).toBe('Translated sentence.');
  });

  it('reports a missing API key without opening the API key prompt', async () => {
    const apiKeyManager = {
      getKey: jest.fn(() => Promise.resolve(undefined)),
    };
    const manager = new TranslationManager(apiKeyManager as any);
    const document = {
      uri: vscode.Uri.file('/workspace/requirements.md'),
      languageId: 'markdown',
      getText: () => '原文です。',
    } as any;
    PreviewPanel.allPanels.set('requirements@ko', {
      editorDocumentUri: document.uri,
      langCode: 'ko',
    } as any);

    const result = await manager.startTranslation(document, 'google-cloud');

    expect(result).toBe(false);
    expect(apiKeyManager.getKey).toHaveBeenCalledWith('google-cloud');
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Google Cloud')
    );
  });

  it('does not start provider work for a document without an open Twin panel', async () => {
    const apiKeyManager = {
      getKey: jest.fn(() => Promise.resolve('secret')),
    };
    const manager = new TranslationManager(apiKeyManager as any);
    const document = {
      uri: vscode.Uri.file('/workspace/closed.md'),
      languageId: 'markdown',
      getText: () => 'Text to translate.',
    } as any;

    await expect(manager.startTranslation(document, 'google-cloud')).resolves.toBe(false);
    expect(apiKeyManager.getKey).not.toHaveBeenCalled();
  });

  it('keeps translation session ids independent between documents', () => {
    const manager = new TranslationManager({} as any);
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');

    const firstSession = (manager as any).beginDocumentSession(first);
    const secondSession = (manager as any).beginDocumentSession(second);

    expect((manager as any).isCurrentDocumentSession(first, firstSession)).toBe(true);
    expect((manager as any).isCurrentDocumentSession(second, secondSession)).toBe(true);
  });

  it('stops one document without deactivating another document', () => {
    const manager = new TranslationManager({} as any);
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');
    (manager as any).activeDocumentUris.add(first.toString());
    (manager as any).activeDocumentUris.add(second.toString());

    manager.stopDocumentTranslation(first);

    expect(manager.isDocumentActive(first)).toBe(false);
    expect(manager.isDocumentActive(second)).toBe(true);
    expect(manager.isActive()).toBe(true);
  });
});
