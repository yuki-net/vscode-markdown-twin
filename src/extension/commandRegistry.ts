import * as vscode from 'vscode';
import type { ApiKeyManager } from '../adapters/vscode/apiKeyManager';
import { promptAzureRegion } from '../adapters/vscode/azureRegion';
import type { ProviderId } from '../domain/provider';
import { t } from '../i18n';
import { SUPPORTED_LANGUAGES } from '../languages';
import { retranslateActivePreview, retranslatePreviewDocument } from '../adapters/vscode/preview/previewActions';
import type { PreviewPanel } from '../adapters/vscode/preview/previewPanel';
import type { PreviewRegistry } from '../adapters/vscode/preview/previewRegistry';
import type { ProviderSelector } from '../adapters/vscode/providerSelector';
import type { StatusBarPresenter } from '../adapters/vscode/statusBarPresenter';
import { isCursor } from '../utils';
import type { VscodeTranslationCoordinator } from '../adapters/vscode/vscodeTranslationCoordinator';
import type { VscodeSettingsRepository } from '../adapters/vscode/vscodeSettingsRepository';
import { changeLanguage } from '../application/commands/changeLanguage';

export interface ExtensionServices {
  readonly context: vscode.ExtensionContext;
  readonly apiKeyManager: ApiKeyManager;
  readonly coordinator: VscodeTranslationCoordinator;
  readonly statusBar: StatusBarPresenter;
  readonly providerSelector: ProviderSelector;
  readonly previewRegistry: PreviewRegistry;
  readonly settingsRepository: VscodeSettingsRepository;
}

interface TranslationDocumentResolution {
  readonly document: vscode.TextDocument;
  readonly avoidOpeningSource: boolean;
}

function getNativeMarkdownPreviewDocumentUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom && input.viewType === 'vscode.markdown.preview.editor') {
    return input.uri;
  }
  return undefined;
}

function isLegacyNativeMarkdownPreviewActive(): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputWebview && input.viewType === 'markdown.preview';
}

async function resolveTranslationDocument(
  previewRegistry: PreviewRegistry
): Promise<TranslationDocumentResolution | undefined> {
  const nativePreviewUri = getNativeMarkdownPreviewDocumentUri();
  if (nativePreviewUri) {
    try {
      const document = vscode.workspace.textDocuments.find(
        candidate => candidate.uri.toString() === nativePreviewUri.toString()
      ) ?? await vscode.workspace.openTextDocument(nativePreviewUri);
      if (document.languageId === 'markdown') return { document, avoidOpeningSource: true };
    } catch {
      // Continue with the editor and Twin panel fallbacks.
    }
  }

  if (isLegacyNativeMarkdownPreviewActive()) {
    try {
      await vscode.commands.executeCommand('markdown.showSource');
      const sourceEditor = vscode.window.activeTextEditor;
      if (sourceEditor?.document.languageId === 'markdown') {
        return { document: sourceEditor.document, avoidOpeningSource: false };
      }
    } catch {
      // Continue with the editor and Twin panel fallbacks.
    }
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.languageId === 'markdown') {
    return { document: activeEditor.document, avoidOpeningSource: false };
  }

  const panelDocument = previewRegistry.getActivePanel()?.editorDocument;
  return panelDocument?.languageId === 'markdown'
    ? { document: panelDocument, avoidOpeningSource: false }
    : undefined;
}

async function applyTargetLanguageByCode(
  settings: VscodeSettingsRepository,
  code: string
): Promise<void> {
  const target = SUPPORTED_LANGUAGES.find(language => language.code === code);
  if (!target) return;
  if (settings.get().targetLanguage !== target.code) {
    await changeLanguage(settings, target.code);
  }
  await vscode.commands.executeCommand('setContext', 'markdownTwin.targetLang', target.code);
}

export function registerCommands(services: ExtensionServices): void {
  const { context, coordinator, providerSelector, previewRegistry, settingsRepository } = services;
  const toggleTranslation = async (requestedLangCode?: string): Promise<void> => {
    if (requestedLangCode) await applyTargetLanguageByCode(settingsRepository, requestedLangCode);

    const resolution = await resolveTranslationDocument(previewRegistry);
    if (!resolution) {
      vscode.window.showWarningMessage(t('noActiveEditor'));
      return;
    }
    const { document, avoidOpeningSource } = resolution;
    const activeEditor = vscode.window.activeTextEditor;
    const canCreatePanel = activeEditor?.document.uri.toString() === document.uri.toString();
    const settings = settingsRepository.get();

    if (previewRegistry.getPanel(document.uri, settings.targetLanguage)) {
      await retranslatePreviewDocument({
        extensionUri: context.extensionUri,
        coordinator,
        previewRegistry,
        document,
        options: { revealPreview: !isCursor() && canCreatePanel },
      });
      return;
    }

    if (!canCreatePanel && !avoidOpeningSource) {
      await vscode.window.showTextDocument(document, { preview: false });
    }

    let provider: ProviderId | undefined = settings.providerId;
    if (!provider) {
      provider = await providerSelector.show();
      if (!provider) return;
    }
    const panelReady = await previewRegistry.createOrShow(context.extensionUri, document, {
      avoidOpeningSource,
    });
    if (panelReady) await coordinator.run(document, { overrideProvider: provider });
  };

  register(context, 'markdownTwin.toggleTranslation', toggleTranslation);
  for (const language of SUPPORTED_LANGUAGES) {
    register(context, `markdownTwin.toggleTranslation.${language.code}`, () => toggleTranslation(language.code));
  }
  register(context, 'markdownTwin.toggleBilingual', () => coordinator.toggleMode());
  register(context, 'markdownTwin.selectProvider', () => providerSelector.showMenu());
  register(context, 'markdownTwin.setApiKey', () => providerSelector.showApiKeyPicker());
  register(context, 'markdownTwin.configureAzureRegion', () => promptAzureRegion(settingsRepository));
  register(context, 'markdownTwin.openSettings', () =>
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:yukiidayo.vscode-markdown-twin')
  );
  register(context, 'markdownTwin.copyTranslatedMarkdown', async () => {
    const panel = previewRegistry.getActivePanel();
    if (!panel) return;
    try {
      const result = coordinator.generateTranslatedMarkdown(panel.editorDocument, panel.langCode, 'translation-only');
      await vscode.env.clipboard.writeText(result.text);
      vscode.window.showInformationMessage(t('copiedToClipboard'));
    } catch (error: unknown) {
      coordinator.logError('Failed to copy translated markdown', error);
    }
  });
  register(context, 'markdownTwin.exportTranslatedMarkdown', async () => {
    const panel = previewRegistry.getActivePanel();
    if (!panel) return;
    try {
      const result = coordinator.generateTranslatedMarkdown(panel.editorDocument, panel.langCode, 'translation-only');
      const saveUri = await promptForTranslatedMarkdownSaveUri(panel);
      if (!saveUri) return;
      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(result.text, 'utf8'));
      vscode.window.showInformationMessage(t('exportedSuccessfully', basenameFromUri(saveUri, 'translated.md')));
    } catch (error: unknown) {
      coordinator.logError('Failed to export translated markdown', error);
    }
  });
  register(context, 'markdownTwin.openTranslatedSource', () =>
    previewRegistry.getActivePanel()?.setViewMode('source')
  );
  register(context, 'markdownTwin.openPreviewFromSource', () =>
    previewRegistry.getActivePanel()?.setViewMode('preview')
  );
  register(context, 'markdownTwin.copyFromPreviewContext', () =>
    vscode.commands.executeCommand('editor.action.clipboardCopyAction')
  );
  register(context, 'markdownTwin.retranslateFromPreviewContext', () =>
    retranslateActivePreview(coordinator, previewRegistry, { clearCache: true })
  );
}

function register(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: any[]) => any
): void {
  context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

async function promptForTranslatedMarkdownSaveUri(panel: PreviewPanel): Promise<vscode.Uri | undefined> {
  const documentUri = panel.editorDocument.uri;
  const fileName = basenameFromUri(documentUri, 'document.md');
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot === -1 ? fileName : fileName.substring(0, lastDot);
  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(documentUri, '..', `${baseName}.${panel.langCode}.md`),
    filters: { Markdown: ['md', 'markdown'] },
  });
}

function basenameFromUri(uri: vscode.Uri, fallback: string): string {
  const lastSlash = uri.path.lastIndexOf('/');
  return lastSlash === -1 ? fallback : uri.path.substring(lastSlash + 1);
}
