import * as vscode from 'vscode';
import { VscodeTranslationCoordinator } from '../../../adapters/vscode/vscodeTranslationCoordinator';

describe('TranslationCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.textDocuments as any[]).length = 0;
  });

  function createManager() {
    return {
      onTranslationUpdated: jest.fn(() => ({ dispose: jest.fn() })),
      clearAllCache: jest.fn(),
      clearDocumentCache: jest.fn(),
      startTranslation: jest.fn(async () => true),
      isActive: jest.fn(() => true),
      stopTranslation: jest.fn(),
    };
  }

  it('clears the shared cache once and reruns every open preview document', async () => {
    const first = {
      uri: vscode.Uri.file('/workspace/first.md'),
      languageId: 'markdown',
      getText: () => 'first',
    } as any;
    const second = {
      uri: vscode.Uri.file('/workspace/second.md'),
      languageId: 'markdown',
      getText: () => 'second',
    } as any;
    (vscode.workspace.textDocuments as any[]).push(first, second);
    const manager = createManager();
    const targets = {
      hasDocument: jest.fn(() => true),
      getTargetLanguages: jest.fn(() => ['ko']),
      getDocumentUris: jest.fn(() => [first.uri.toString(), second.uri.toString()]),
      getDocument: jest.fn((uri: string) => uri === first.uri.toString() ? first : second),
    };
    const coordinator = new VscodeTranslationCoordinator(manager as any, targets);

    await coordinator.rerunAll({ clearAllCache: true });

    expect(manager.clearAllCache).toHaveBeenCalledTimes(1);
    expect(manager.startTranslation).toHaveBeenCalledTimes(2);
    expect(manager.startTranslation).toHaveBeenCalledWith({
      id: first.uri.toString(),
      languageId: 'markdown',
      text: 'first',
    }, undefined);
    expect(manager.startTranslation).toHaveBeenCalledWith({
      id: second.uri.toString(),
      languageId: 'markdown',
      text: 'second',
    }, undefined);
  });

  it('reruns a document retained by a preview after its source editor is closed', async () => {
    const retained = {
      uri: vscode.Uri.file('/workspace/closed.md'),
      languageId: 'markdown',
      getText: () => 'retained preview text',
    } as any;
    const manager = createManager();
    const targets = {
      hasDocument: jest.fn(() => true),
      getTargetLanguages: jest.fn(() => ['ko']),
      getDocumentUris: jest.fn(() => [retained.uri.toString()]),
      getDocument: jest.fn(() => retained),
    };
    const coordinator = new VscodeTranslationCoordinator(manager as any, targets);

    await coordinator.rerunAll();

    expect(manager.startTranslation).toHaveBeenCalledWith({
      id: retained.uri.toString(),
      languageId: 'markdown',
      text: 'retained preview text',
    }, undefined);
  });
});
