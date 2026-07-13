import * as vscode from 'vscode';
import { ApiKeyManager } from '../adapters/vscode/apiKeyManager';
import { PreviewController } from '../adapters/vscode/preview/previewController';
import { PreviewRegistry } from '../adapters/vscode/preview/previewRegistry';
import { TextMateHighlightService } from '../adapters/vscode/preview/highlighting/textMateHighlightService';
import { ProviderSelector } from '../adapters/vscode/providerSelector';
import { RegistryTranslationProviderFactory } from '../adapters/providers/providerRegistry';
import { StatusBarPresenter } from '../adapters/vscode/statusBarPresenter';
import { TranslationCoordinator } from '../application/translationCoordinator';
import { VscodeTranslationCoordinator } from '../adapters/vscode/vscodeTranslationCoordinator';
import { VscodeTranslationDiagnostics } from '../adapters/vscode/vscodeTranslationDiagnostics';
import { VscodeSettingsRepository } from '../adapters/vscode/vscodeSettingsRepository';
import { VscodeSecretRepository } from '../adapters/vscode/vscodeSecretRepository';
import { registerCommands, type ExtensionServices } from './commandRegistry';
import { bindVscodeEvents, syncTargetLanguageContext } from './vscodeEventBindings';

let translationCoordinator: VscodeTranslationCoordinator | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settingsRepository = new VscodeSettingsRepository();
  await settingsRepository.migrateLegacySettings();
  const secretRepository = new VscodeSecretRepository(context.secrets);
  const apiKeyManager = new ApiKeyManager(secretRepository, settingsRepository);
  const previewRegistry = new PreviewRegistry(settingsRepository);
  const diagnostics = new VscodeTranslationDiagnostics();
  const applicationCoordinator = new TranslationCoordinator(
    previewRegistry,
    settingsRepository,
    new RegistryTranslationProviderFactory(secretRepository),
    diagnostics
  );
  translationCoordinator = new VscodeTranslationCoordinator(applicationCoordinator, previewRegistry);

  const highlightService = new TextMateHighlightService();
  const previewController = new PreviewController(translationCoordinator, previewRegistry, highlightService);
  previewRegistry.configureController(previewController);
  previewRegistry.configureHighlightService(highlightService);

  const statusBar = new StatusBarPresenter(settingsRepository);
  applicationCoordinator.setStatusBar(statusBar);
  statusBar.showOffline();

  const providerSelector = new ProviderSelector(
    apiKeyManager,
    translationCoordinator,
    statusBar,
    context.extensionUri,
    settingsRepository
  );
  const services: ExtensionServices = {
    context,
    apiKeyManager,
    coordinator: translationCoordinator,
    statusBar,
    providerSelector,
    previewRegistry,
    settingsRepository,
  };

  context.subscriptions.push(
    applicationCoordinator,
    translationCoordinator,
    diagnostics,
    highlightService,
    previewController,
    statusBar
  );
  syncTargetLanguageContext(services);
  void vscode.commands.executeCommand('setContext', 'markdownTwin.previewActive', false);
  void vscode.commands.executeCommand('setContext', 'markdownTwin.showingSource', false);
  registerCommands(services);
  bindVscodeEvents(services);
}

export function deactivate(): void {
  translationCoordinator?.stop();
}
