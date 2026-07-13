import * as vscode from 'vscode';
import { bindVscodeEvents } from '../../extension/vscodeEventBindings';
import type { TranslationSettingsChange } from '../../ports/settingsRepository';

describe('VS Code event bindings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.textDocuments as any[]).length = 0;
  });

  it('recreates target previews and reruns every translated document after a language change', async () => {
    let configurationListener!: (change: TranslationSettingsChange) => Promise<void>;
    const first = { uri: vscode.Uri.file('/workspace/first.md'), languageId: 'markdown' } as any;
    const second = { uri: vscode.Uri.file('/workspace/second.md'), languageId: 'markdown' } as any;
    (vscode.workspace.textDocuments as any[]).push(first, second);
    const services = createServices(listener => { configurationListener = listener; });
    services.previewRegistry.getDocumentUris.mockReturnValue([
      first.uri.toString(),
      second.uri.toString(),
    ] as any);

    bindVscodeEvents(services as any);
    await configurationListener({ affects: key => key === 'targetLanguage' });

    expect(services.previewRegistry.createOrShow).toHaveBeenCalledTimes(2);
    expect(services.coordinator.rerunAll).toHaveBeenCalledTimes(1);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'markdownTwin.targetLang',
      'ja'
    );
  });

  it('recreates a target preview from the retained panel document after the source editor closes', async () => {
    let configurationListener!: (change: TranslationSettingsChange) => Promise<void>;
    const retained = { uri: vscode.Uri.file('/workspace/retained.md'), languageId: 'markdown' } as any;
    const services = createServices(listener => { configurationListener = listener; });
    services.previewRegistry.getDocumentUris.mockReturnValue([retained.uri.toString()] as any);
    services.previewRegistry.getDocument.mockReturnValue(retained);

    bindVscodeEvents(services as any);
    await configurationListener({ affects: key => key === 'targetLanguage' });

    expect(services.previewRegistry.createOrShow).toHaveBeenCalledWith(
      services.context.extensionUri,
      retained,
      { avoidOpeningSource: true }
    );
    expect(services.coordinator.rerunAll).toHaveBeenCalledTimes(1);
  });

  it.each(['sourceLanguage', 'providerId', 'azureRegion'] as const)(
    'clears cache once and reruns all documents when %s changes',
    async changedKey => {
      let configurationListener!: (change: TranslationSettingsChange) => Promise<void>;
      const services = createServices(listener => { configurationListener = listener; });

      bindVscodeEvents(services as any);
      await configurationListener({ affects: key => key === changedKey });

      expect(services.coordinator.rerunAll).toHaveBeenCalledWith({ clearAllCache: true });
    }
  );
});

function createServices(
  captureConfigurationListener: (listener: (change: TranslationSettingsChange) => Promise<void>) => void
) {
  const settingsRepository = {
    get: jest.fn(() => ({ targetLanguage: 'ja' })),
    onDidChange: jest.fn((listener: (change: TranslationSettingsChange) => Promise<void>) => {
      captureConfigurationListener(listener);
      return { dispose: jest.fn() };
    }),
  };
  return {
    context: { subscriptions: [], extensionUri: vscode.Uri.file('/extension') },
    coordinator: {
      isActive: jest.fn(() => true),
      rerunAll: jest.fn(async () => undefined),
      clearAllCache: jest.fn(),
      invalidateDocument: jest.fn(),
      closeDocument: jest.fn(),
    },
    statusBar: { showOffline: jest.fn() },
    previewRegistry: {
      getDocumentUris: jest.fn(() => []),
      getDocument: jest.fn(),
      createOrShow: jest.fn(async () => true),
      findForDocument: jest.fn(() => []),
      setCurrentPanel: jest.fn(),
      hasDocument: jest.fn(() => false),
    },
    settingsRepository,
    apiKeyManager: { getKey: jest.fn(async () => 'key') },
  };
}
