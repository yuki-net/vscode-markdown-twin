import * as vscode from 'vscode';
import { ApiKeyManager } from '../apiKeyManager';
import { ProviderSelector } from '../providerSelector';

describe('ProviderSelector', () => {
  const createSecrets = () => ({
    get: jest.fn(() => Promise.resolve(undefined)),
    store: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.env as any).language = 'en';
    (vscode.window.showInputBox as jest.Mock).mockReset();
    (vscode.window.showQuickPick as jest.Mock).mockReset();
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
  });

  it('does not switch provider when required setup is cancelled', async () => {
    const secrets = createSecrets();
    const apiKeyManager = new ApiKeyManager(secrets as any);
    const translationManager = {
      isActive: jest.fn(() => false),
    };
    const statusBar = {
      setActiveProvider: jest.fn(),
      showOffline: jest.fn(),
    };
    const selector = new ProviderSelector(
      apiKeyManager,
      translationManager as any,
      statusBar as any,
      vscode.Uri.file('/extension')
    );

    (vscode.window.showQuickPick as jest.Mock).mockImplementation(async items => {
      return items.find((item: any) => item.id === 'microsoft');
    });
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('azure-key')
      .mockResolvedValueOnce(undefined);

    const result = await selector.show();

    expect(result).toBeUndefined();
    expect(vscode.workspace.getConfiguration('markdownTwin').update).not.toHaveBeenCalledWith(
      'provider',
      'microsoft',
      vscode.ConfigurationTarget.Global
    );
    expect(statusBar.setActiveProvider).not.toHaveBeenCalled();
  });

  it('hides delete API key action when no API keys are saved', async () => {
    const secrets = createSecrets();
    const apiKeyManager = new ApiKeyManager(secrets as any);
    const translationManager = {
      getMode: jest.fn(() => 'translationOnly'),
      isActive: jest.fn(() => false),
    };
    const statusBar = {
      setActiveProvider: jest.fn(),
      showOffline: jest.fn(),
    };
    const selector = new ProviderSelector(
      apiKeyManager,
      translationManager as any,
      statusBar as any,
      vscode.Uri.file('/extension')
    );

    let providerMenuItems: readonly any[] = [];
    (vscode.window.showQuickPick as jest.Mock)
      .mockImplementationOnce(async items => items.find((item: any) => item.action === 'provider'))
      .mockImplementationOnce(async items => {
        providerMenuItems = items;
        return undefined;
      });

    await selector.showMenu();

    expect(providerMenuItems.some(item => item.id === '__deleteApiKey__')).toBe(false);
    expect(providerMenuItems.at(-1)?.id).not.toBe('__sep3__');
  });

  it('does not show a back action when opening the API key picker directly', async () => {
    const secrets = createSecrets();
    const apiKeyManager = new ApiKeyManager(secrets as any);
    const translationManager = {
      isActive: jest.fn(() => false),
    };
    const statusBar = {
      setActiveProvider: jest.fn(),
      showOffline: jest.fn(),
    };
    const selector = new ProviderSelector(
      apiKeyManager,
      translationManager as any,
      statusBar as any,
      vscode.Uri.file('/extension')
    );

    let apiKeyItems: readonly any[] = [];
    (vscode.window.showQuickPick as jest.Mock).mockImplementationOnce(async items => {
      apiKeyItems = items;
      return undefined;
    });

    await selector.showApiKeyPicker();

    expect(apiKeyItems.some(item => item.id === '__back__')).toBe(false);
    expect(apiKeyItems.some(item => item.id === '__sep__')).toBe(false);
  });

  it('deletes a saved API key after confirmation', async () => {
    const secrets = createSecrets();
    (secrets.get as jest.Mock).mockImplementation((key: string) => Promise.resolve(
      key === 'markdownTwin.apiKey.microsoft' ? 'azure-key' : undefined
    ));
    const apiKeyManager = new ApiKeyManager(secrets as any);
    const translationManager = {
      getMode: jest.fn(() => 'translationOnly'),
      isActive: jest.fn(() => false),
    };
    const statusBar = {
      setActiveProvider: jest.fn(),
      showOffline: jest.fn(),
    };
    const selector = new ProviderSelector(
      apiKeyManager,
      translationManager as any,
      statusBar as any,
      vscode.Uri.file('/extension')
    );

    (vscode.window.showQuickPick as jest.Mock)
      .mockImplementationOnce(async items => items.find((item: any) => item.action === 'provider'))
      .mockImplementationOnce(async items => items.find((item: any) => item.id === '__deleteApiKey__'))
      .mockImplementationOnce(async items => items.find((item: any) => item.id === 'microsoft'))
      .mockImplementationOnce(async () => undefined);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');

    await selector.showMenu();

    expect(secrets.delete).toHaveBeenCalledWith('markdownTwin.apiKey.microsoft');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Deleted API key for Azure.');
  });
});
