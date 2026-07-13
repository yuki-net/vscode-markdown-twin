import * as vscode from 'vscode';
import { TranslationCoordinator } from '../application/translationCoordinator';

describe('TranslationCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.textDocuments as any[]).length = 0;
  });

  function createManager() {
    return {
      onTranslationUpdated: jest.fn(),
      clearAllCache: jest.fn(),
      clearDocumentCache: jest.fn(),
      startTranslation: jest.fn(async () => true),
      isActive: jest.fn(() => true),
      stopTranslation: jest.fn(),
    };
  }

  it('clears the shared cache once and reruns every open preview document', async () => {
    const first = { uri: vscode.Uri.file('/workspace/first.md') } as any;
    const second = { uri: vscode.Uri.file('/workspace/second.md') } as any;
    (vscode.workspace.textDocuments as any[]).push(first, second);
    const manager = createManager();
    const targets = {
      hasDocument: jest.fn(() => true),
      getTargetLanguages: jest.fn(() => ['ko']),
      getDocumentUris: jest.fn(() => [first.uri.toString(), second.uri.toString()]),
    };
    const coordinator = new TranslationCoordinator(manager as any, targets);

    await coordinator.rerunAll({ clearAllCache: true });

    expect(manager.clearAllCache).toHaveBeenCalledTimes(1);
    expect(manager.startTranslation).toHaveBeenCalledTimes(2);
    expect(manager.startTranslation).toHaveBeenNthCalledWith(1, first, undefined);
    expect(manager.startTranslation).toHaveBeenNthCalledWith(2, second, undefined);
  });

  it('does not rerun documents that are no longer open', async () => {
    const manager = createManager();
    const targets = {
      hasDocument: jest.fn(() => true),
      getTargetLanguages: jest.fn(() => ['ko']),
      getDocumentUris: jest.fn(() => ['file:///closed.md']),
    };
    const coordinator = new TranslationCoordinator(manager as any, targets);

    await coordinator.rerunAll();

    expect(manager.startTranslation).not.toHaveBeenCalled();
  });
});
