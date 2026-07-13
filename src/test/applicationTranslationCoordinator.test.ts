import * as vscode from 'vscode';
import { TranslationCoordinator } from '../application/translationCoordinator';
import { normalizeBatchSize } from '../domain/translationSettings';
import { createTranslationCacheKey, type TranslationSpec } from '../domain/translationSpec';
import { MissingProviderCredentialError } from '../domain/translationError';
import { InMemoryTranslationCache } from '../application/inMemoryTranslationCache';
const targetsByDocument = new Map<string, string[]>();
const translationTargets = {
  hasDocument: (documentUri: string) => targetsByDocument.has(documentUri),
  getTargetLanguages: (documentUri: string) => targetsByDocument.get(documentUri) ?? [],
  getDocumentUris: () => [...targetsByDocument.keys()],
};
const settingsRepository = {
  get: () => ({
    providerId: 'google-cloud' as const,
    sourceLanguage: 'auto',
    targetLanguage: 'ko',
    batchSize: 10,
    debounceDelayMs: 2000,
    defaultMode: 'translation-only' as const,
    azureRegion: 'global',
  }),
  update: jest.fn(async () => undefined),
  onDidChange: jest.fn(),
};

const provider = {
  id: 'google-cloud' as const,
  name: 'Google Cloud',
  translate: jest.fn<Promise<readonly string[]>, [readonly string[], string, string, AbortSignal]>(),
};

const providerFactory = {
  getMetadata: jest.fn(() => ({
    id: 'google-cloud' as const,
    displayName: 'Google Cloud',
    requiresCredentials: true,
  })),
  create: jest.fn(async () => provider),
};
const diagnostics = {
  info: jest.fn(),
  warning: jest.fn(),
  report: jest.fn(async () => undefined),
  dispose: jest.fn(),
};

function createManager(factory: typeof providerFactory = providerFactory): TranslationCoordinator {
  return new TranslationCoordinator(
    translationTargets,
    settingsRepository,
    factory,
    diagnostics,
    new InMemoryTranslationCache()
  );
}

describe('TranslationCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    targetsByDocument.clear();
    provider.translate.mockResolvedValue([]);
  });

  it('normalizes invalid batch sizes to a positive integer', () => {
    expect(normalizeBatchSize(undefined)).toBe(10);
    expect(normalizeBatchSize(Number.NaN)).toBe(10);
    expect(normalizeBatchSize(0)).toBe(1);
    expect(normalizeBatchSize(-2)).toBe(1);
    expect(normalizeBatchSize(1.9)).toBe(1);
  });

  it('persists mode changes to the defaultMode setting', async () => {
    const manager = createManager();

    await manager.toggleMode();

    expect(settingsRepository.update).toHaveBeenCalledWith({ defaultMode: 'bilingual' });

    await manager.toggleMode();

    expect(settingsRepository.update).toHaveBeenCalledWith({ defaultMode: 'translation-only' });
  });

  it('can generate clean translated markdown even when the current mode is bilingual', async () => {
    const manager = createManager();
    const document = {
      id: vscode.Uri.file('/workspace/requirements.md').toString(),
      languageId: 'markdown',
      text: '原文です。',
    } as any;

    const spec: TranslationSpec = {
      providerId: 'google-cloud',
      sourceLanguage: 'auto',
      targetLanguages: ['ko'],
      providerOptionsKey: 'default',
    };
    (manager as any).stateStore.enable(document.id, spec);
    (manager as any).cache
      .ensureDocumentCache(document.id, createTranslationCacheKey(spec, 'ko'))
      .set('原文です。', 'Translated sentence.');

    await manager.toggleMode();

    const bilingual = manager.generateTranslatedMarkdown(document, 'ko');
    const cleanSource = manager.generateTranslatedMarkdown(document, 'ko', 'translation-only');

    expect(bilingual.text).toContain('mt-bilingual-original');
    expect(cleanSource.text).toBe('Translated sentence.');
  });

  it('reports a missing API key without opening the API key prompt', async () => {
    providerFactory.create.mockRejectedValueOnce(new MissingProviderCredentialError('google-cloud'));
    const manager = createManager();
    const document = {
      id: vscode.Uri.file('/workspace/requirements.md').toString(),
      languageId: 'markdown',
      text: '原文です。',
    };
    targetsByDocument.set(document.id, ['ko']);

    const result = await manager.startTranslation(document, 'google-cloud');

    expect(result).toBe(false);
    expect(providerFactory.create).toHaveBeenCalledWith('google-cloud', { azureRegion: 'global' });
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(diagnostics.report).toHaveBeenCalledWith({
      kind: 'missing-credentials',
      providerName: 'Google Cloud',
    });
  });

  it('does not start provider work for a document without an open Twin panel', async () => {
    const manager = createManager();
    const document = {
      id: vscode.Uri.file('/workspace/closed.md').toString(),
      languageId: 'markdown',
      text: 'Text to translate.',
    };

    await expect(manager.startTranslation(document, 'google-cloud')).resolves.toBe(false);
    expect(providerFactory.create).not.toHaveBeenCalled();
  });

  it('keeps translation sessions independent between documents', () => {
    const manager = createManager();
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');

    const firstSession = (manager as any).ensureDocumentSession(first.toString());
    const secondSession = (manager as any).ensureDocumentSession(second.toString());
    const firstRun = firstSession.begin();
    const secondRun = secondSession.begin();

    expect(firstSession.isCurrent(firstRun)).toBe(true);
    expect(secondSession.isCurrent(secondRun)).toBe(true);
  });

  it('stops one document without deactivating another document', () => {
    const manager = createManager();
    const first = vscode.Uri.file('/workspace/first.md');
    const second = vscode.Uri.file('/workspace/second.md');
    const spec: TranslationSpec = {
      providerId: 'google-cloud',
      sourceLanguage: 'auto',
      targetLanguages: ['ko'],
      providerOptionsKey: 'default',
    };
    (manager as any).stateStore.enable(first.toString(), spec);
    (manager as any).stateStore.enable(second.toString(), spec);

    manager.stopDocumentTranslation(first.toString());

    expect(manager.isDocumentActive(first.toString())).toBe(false);
    expect(manager.isDocumentActive(second.toString())).toBe(true);
    expect(manager.isActive()).toBe(true);
  });

  it('rejects an incomplete provider response instead of reporting completion', async () => {
    const document = {
      id: vscode.Uri.file('/workspace/incomplete.md').toString(),
      languageId: 'markdown',
      text: 'Text to translate.',
    };
    targetsByDocument.set(document.id, ['ko']);
    provider.translate.mockResolvedValue([]);
    const status = {
      setActiveProvider: jest.fn(),
      showProgress: jest.fn(),
      showComplete: jest.fn(),
      showError: jest.fn(),
      showOffline: jest.fn(),
      removeDocument: jest.fn(),
      update: jest.fn(),
    };
    const manager = createManager();
    manager.setStatusBar(status);

    await expect(manager.startTranslation(document)).resolves.toBe(false);

    expect(status.showError).toHaveBeenCalledWith(document.id, 'Google Cloud');
    expect(status.showComplete).not.toHaveBeenCalled();
    expect(manager.generateTranslatedMarkdown(document, 'ko').text).toBe('Text to translate.');
  });

  it('does not commit a stale provider response after a newer run completes', async () => {
    const document = {
      id: vscode.Uri.file('/workspace/race.md').toString(),
      languageId: 'markdown',
      text: 'Text to translate.',
    };
    targetsByDocument.set(document.id, ['ko']);

    let resolveFirst!: (value: readonly string[]) => void;
    const firstResponse = new Promise<readonly string[]>(resolve => {
      resolveFirst = resolve;
    });
    provider.translate
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(['new translation']);
    const manager = createManager();

    const firstRun = manager.startTranslation(document);
    while (provider.translate.mock.calls.length < 1) await Promise.resolve();
    const secondRun = manager.startTranslation(document);
    await secondRun;
    resolveFirst(['stale translation']);
    await firstRun;

    const translated = manager.generateTranslatedMarkdown(document, 'ko').text;
    expect(translated).toContain('new translation');
    expect(translated).not.toContain('stale translation');
  });

  it('records partial status when one target succeeds and another fails', async () => {
    const document = {
      id: vscode.Uri.file('/workspace/partial.md').toString(),
      languageId: 'markdown',
      text: 'Text to translate.',
    };
    targetsByDocument.set(document.id, ['ja', 'ko']);
    provider.translate
      .mockResolvedValueOnce(['translated'])
      .mockRejectedValueOnce(new Error('target failed'));
    const manager = createManager();

    await expect(manager.startTranslation(document)).resolves.toBe(false);

    expect(manager.getDocumentState(document.id)?.status).toMatchObject({
      kind: 'partial',
      failures: [{ kind: 'provider', targetLanguage: 'ko' }],
    });
    expect(manager.generateTranslatedMarkdown(document, 'ja').text).toContain('translated');
    expect(manager.generateTranslatedMarkdown(document, 'ko').text).toBe(document.text);
  });
});
