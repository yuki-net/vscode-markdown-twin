import * as vscode from 'vscode';
import { normalizeBatchSize, TranslationManager } from '../translationManager';

describe('TranslationManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    const result = await manager.startTranslation(document, 'google-cloud');

    expect(result).toBe(false);
    expect(apiKeyManager.getKey).toHaveBeenCalledWith('google-cloud');
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Google Cloud')
    );
  });
});
