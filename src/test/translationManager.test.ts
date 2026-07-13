import * as vscode from 'vscode';
import { normalizeBatchSize, TranslationManager } from '../translationManager';
import { createTranslationCacheKey, type TranslationSpec } from '../domain/translationSpec';
const targetsByDocument = new Map<string, string[]>();
const translationTargets = {
  hasDocument: (documentUri: string) => targetsByDocument.has(documentUri),
  getTargetLanguages: (documentUri: string) => targetsByDocument.get(documentUri) ?? [],
  getDocumentUris: () => [...targetsByDocument.keys()],
};

describe('TranslationManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    targetsByDocument.clear();
  });

  it('normalizes invalid batch sizes to a positive integer', () => {
    expect(normalizeBatchSize(undefined)).toBe(10);
    expect(normalizeBatchSize(Number.NaN)).toBe(10);
    expect(normalizeBatchSize(0)).toBe(1);
    expect(normalizeBatchSize(-2)).toBe(1);
    expect(normalizeBatchSize(1.9)).toBe(1);
  });

  it('persists mode changes to the defaultMode setting', async () => {
    const manager = new TranslationManager({} as any, translationTargets);

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
    const manager = new TranslationManager({} as any, translationTargets);
    const document = {
      uri: vscode.Uri.file('/workspace/requirements.md'),
      getText: () => '原文です。',
    } as any;

    const spec: TranslationSpec = {
      providerId: 'google-cloud',
      sourceLanguage: 'auto',
      targetLanguages: ['ko'],
      providerOptionsKey: 'default',
    };
    (manager as any).documentSpecs.set(document.uri.toString(), spec);
    (manager as any).cache
      .ensureDocumentCache(document.uri, createTranslationCacheKey(spec, 'ko'))
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
    const manager = new TranslationManager(apiKeyManager as any, translationTargets);
    const document = {
      uri: vscode.Uri.file('/workspace/requirements.md'),
      languageId: 'markdown',
      getText: () => '原文です。',
    } as any;
    targetsByDocument.set(document.uri.toString(), ['ko']);

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
    const manager = new TranslationManager(apiKeyManager as any, translationTargets);
    const document = {
      uri: vscode.Uri.file('/workspace/closed.md'),
      languageId: 'markdown',
      getText: () => 'Text to translate.',
    } as any;

    await expect(manager.startTranslation(document, 'google-cloud')).resolves.toBe(false);
    expect(apiKeyManager.getKey).not.toHaveBeenCalled();
  });

  it('keeps translation sessions independent between documents', () => {
    const manager = new TranslationManager({} as any, translationTargets);
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');

    const firstSession = (manager as any).ensureDocumentSession(first);
    const secondSession = (manager as any).ensureDocumentSession(second);
    const firstRun = firstSession.begin();
    const secondRun = secondSession.begin();

    expect(firstSession.isCurrent(firstRun)).toBe(true);
    expect(secondSession.isCurrent(secondRun)).toBe(true);
  });

  it('stops one document without deactivating another document', () => {
    const manager = new TranslationManager({} as any, translationTargets);
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
