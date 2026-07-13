import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import { StatusBar } from './statusBar';
import { ApiKeyManager } from './apiKeyManager';
import { ProviderSelector, PROVIDER_DEFS } from './providerSelector';
import { normalizeProviderId } from './providers/ITranslationProvider';
import {
  SUPPORTED_LANGUAGES,
  getTargetLanguageCode,
  normalizeSourceLanguageCode,
  normalizeTargetLanguageCode,
} from './languages';
import { PreviewPanel } from './previewPanel';
import { t } from './i18n';
import { isCursor } from './utils';
import { retranslateActivePreview, retranslatePreviewDocument } from './previewActions';
import { runTranslationForDocument } from './translationRunner';
import { promptAzureRegion } from './azureRegion';
import { TextMateHighlightService } from './preview/highlighting/textMateHighlightService';
import { PreviewRegistry } from './previewRegistry';

let translationManager: TranslationManager;

type ToggleTranslationHandler = (requestedLangCode?: string) => Promise<void>;

interface ExtensionServices {
  context: vscode.ExtensionContext;
  apiKeyManager: ApiKeyManager;
  translationManager: TranslationManager;
  statusBar: StatusBar;
  providerSelector: ProviderSelector;
  previewRegistry: PreviewRegistry;
}

interface TranslationDocumentResolution {
  document: vscode.TextDocument;
  avoidOpeningSource: boolean;
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

function syncTargetLangContext(): void {
  const code = getTargetLanguageCode();
  void vscode.commands.executeCommand('setContext', 'markdownTwin.targetLang', code);
}

async function resolveTranslationDocument(previewRegistry: PreviewRegistry): Promise<TranslationDocumentResolution | undefined> {
  const nativePreviewUri = getNativeMarkdownPreviewDocumentUri();
  if (nativePreviewUri) {
    try {
      const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === nativePreviewUri.toString())
        ?? await vscode.workspace.openTextDocument(nativePreviewUri);
      if (document.languageId === 'markdown') {
        return { document, avoidOpeningSource: true };
      }
    } catch {
      // Fall through to the regular editor and Twin panel lookup below.
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
      // Fall through to the regular editor and Twin panel lookup below.
    }
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.languageId === 'markdown') {
    return { document: activeEditor.document, avoidOpeningSource: false };
  }

  const panelDoc = previewRegistry.getActivePanel()?.editorDocument;
  if (panelDoc?.languageId === 'markdown') {
    return { document: panelDoc, avoidOpeningSource: false };
  }

  return undefined;
}

async function applyTargetLanguageByCode(code: string): Promise<void> {
  const target = SUPPORTED_LANGUAGES.find(l => l.code === code);
  if (!target) return;

  const config = vscode.workspace.getConfiguration('markdownTwin');
  const current = normalizeTargetLanguageCode(config.get<string>('targetLanguage'));
  if (current !== target.code) {
    await config.update('targetLanguage', target.code, vscode.ConfigurationTarget.Global);
  }

  await vscode.commands.executeCommand('setContext', 'markdownTwin.targetLang', target.code);
}

async function migrateLegacySettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration('markdownTwin');

  const rawProvider = config.get<string>('provider');
  const providerId = normalizeProviderId(rawProvider);
  if (rawProvider && rawProvider !== providerId) {
    await config.update('provider', providerId, vscode.ConfigurationTarget.Global);
  }

  const rawSource = config.get<string>('sourceLanguage');
  const sourceCode = normalizeSourceLanguageCode(rawSource);
  if (rawSource && rawSource !== sourceCode) {
    await config.update('sourceLanguage', sourceCode, vscode.ConfigurationTarget.Global);
  }

  const rawTarget = config.get<string>('targetLanguage');
  const targetCode = normalizeTargetLanguageCode(rawTarget);
  if (rawTarget && rawTarget !== targetCode) {
    await config.update('targetLanguage', targetCode, vscode.ConfigurationTarget.Global);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  await migrateLegacySettings();

  const apiKeyManager = new ApiKeyManager(context.secrets);
  const previewRegistry = new PreviewRegistry();
  translationManager = new TranslationManager(apiKeyManager, previewRegistry);
  context.subscriptions.push(translationManager);

  const statusBar = new StatusBar();
  translationManager.setStatusBar(statusBar);
  statusBar.showOffline();
  context.subscriptions.push(statusBar);

  const highlightService = new TextMateHighlightService();
  previewRegistry.configureHighlightService(highlightService);
  context.subscriptions.push(highlightService);

  const providerSelector = new ProviderSelector(
    apiKeyManager,
    translationManager,
    statusBar,
    context.extensionUri,
    previewRegistry
  );
  const services: ExtensionServices = {
    context,
    apiKeyManager,
    translationManager,
    statusBar,
    providerSelector,
    previewRegistry,
  };

  syncTargetLangContext();
  void vscode.commands.executeCommand('setContext', 'markdownTwin.previewActive', false);
  void vscode.commands.executeCommand('setContext', 'markdownTwin.showingSource', false);
  registerConfigurationSync(services);
  registerCommands(services, createToggleTranslationHandler(services));
  registerEditorDocumentListeners(services);
  registerFirstRunApiKeyPrompt(services);
}

function createToggleTranslationHandler(services: ExtensionServices): ToggleTranslationHandler {
  const { context, translationManager, providerSelector, previewRegistry } = services;

  return async (requestedLangCode?: string) => {
    if (requestedLangCode) {
      await applyTargetLanguageByCode(requestedLangCode);
    }

    const resolution = await resolveTranslationDocument(previewRegistry);
    if (!resolution) {
      vscode.window.showWarningMessage(t('noActiveEditor'));
      return;
    }
    const { document, avoidOpeningSource } = resolution;

    const activeEditor = vscode.window.activeTextEditor;
    const canCreatePanelFromActiveEditor = !!activeEditor && activeEditor.document.uri.toString() === document.uri.toString();
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const code = getTargetLanguageCode();
    if (previewRegistry.getPanel(document.uri, code)) {
      await retranslatePreviewDocument({
        extensionUri: context.extensionUri,
        translationManager,
        previewRegistry,
        document,
        options: {
          revealPreview: !isCursor() && canCreatePanelFromActiveEditor,
        },
      });
      return;
    }

    if (!canCreatePanelFromActiveEditor && !avoidOpeningSource) {
      await vscode.window.showTextDocument(document, { preview: false });
    }

    let provider = config.get<string>('provider');
    if (!provider) {
      provider = await providerSelector.show();
      if (!provider) return;
    }

    const providerId = normalizeProviderId(provider);

    const panelReady = await previewRegistry.createOrShow(context.extensionUri, translationManager, document, {
      avoidOpeningSource,
    });
    if (!panelReady) return;

    await runTranslationForDocument(translationManager, document, { overrideProvider: providerId });
  };
}

function registerConfigurationSync(services: ExtensionServices): void {
  const { context, translationManager, statusBar, previewRegistry } = services;

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration('markdownTwin.targetLanguage')) {
        syncTargetLangContext();
        const activePanel = previewRegistry.getActivePanel();
        if (activePanel) {
          await previewRegistry.createOrShow(context.extensionUri, translationManager, activePanel.editorDocument);
        }

        if (translationManager.isActive()) {
          await retranslateActivePreview(translationManager, previewRegistry, { clearCache: true });
        } else {
          statusBar.showOffline();
        }
      }

      if (e.affectsConfiguration('markdownTwin.sourceLanguage')) {
        translationManager.clearAllCache();

        if (translationManager.isActive()) {
          await retranslateActivePreview(translationManager, previewRegistry);
        } else {
          statusBar.showOffline();
        }
      }

      if (e.affectsConfiguration('markdownTwin.provider') && !translationManager.isActive()) {
        statusBar.showOffline();
      }
    })
  );
}

function registerCommands(services: ExtensionServices, toggleHandler: ToggleTranslationHandler): void {
  const { context, translationManager, providerSelector, previewRegistry } = services;

  registerCommand(context, 'markdownTwin.toggleTranslation', toggleHandler);

  for (const lang of SUPPORTED_LANGUAGES) {
    registerCommand(context, `markdownTwin.toggleTranslation.${lang.code}`, () => toggleHandler(lang.code));
  }

  registerCommand(context, 'markdownTwin.toggleBilingual', async () => {
    await translationManager.toggleMode();
  });

  registerCommand(context, 'markdownTwin.selectProvider', async () => {
    await providerSelector.showMenu();
  });

  registerCommand(context, 'markdownTwin.setApiKey', async () => {
    await providerSelector.showApiKeyPicker();
  });

  registerCommand(context, 'markdownTwin.configureAzureRegion', async () => {
    await promptAzureRegion();
  });

  registerCommand(context, 'markdownTwin.openSettings', async () => {
    await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:yukiidayo.vscode-markdown-twin');
  });

  registerCommand(context, 'markdownTwin.copyTranslatedMarkdown', async () => {
    const activePanel = previewRegistry.getActivePanel();
    if (!activePanel) return;
    try {
      const translated = translationManager.generateTranslatedMarkdown(
        activePanel.editorDocument,
        activePanel.langCode,
        'translation-only'
      );
      await vscode.env.clipboard.writeText(translated.text);
      vscode.window.showInformationMessage(t('copiedToClipboard'));
    } catch (err: any) {
      translationManager.logError('Failed to copy translated markdown', err);
    }
  });

  registerCommand(context, 'markdownTwin.exportTranslatedMarkdown', async () => {
    const activePanel = previewRegistry.getActivePanel();
    if (!activePanel) return;
    try {
      const translated = translationManager.generateTranslatedMarkdown(
        activePanel.editorDocument,
        activePanel.langCode,
        'translation-only'
      );
      const saveUri = await promptForTranslatedMarkdownSaveUri(activePanel);
      if (!saveUri) return;

      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(translated.text, 'utf8'));
      vscode.window.showInformationMessage(t('exportedSuccessfully', basenameFromUri(saveUri, 'translated.md')));
    } catch (err: any) {
      translationManager.logError('Failed to export translated markdown', err);
    }
  });

  registerCommand(context, 'markdownTwin.openTranslatedSource', () => {
    previewRegistry.getActivePanel()?.setViewMode('source');
  });

  registerCommand(context, 'markdownTwin.openPreviewFromSource', () => {
    previewRegistry.getActivePanel()?.setViewMode('preview');
  });

  registerCommand(context, 'markdownTwin.copyFromPreviewContext', async () => {
    await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
  });

  registerCommand(context, 'markdownTwin.retranslateFromPreviewContext', async () => {
    await retranslateActivePreview(translationManager, previewRegistry, { clearCache: true });
  });
}

function registerEditorDocumentListeners(services: ExtensionServices): void {
  const { context, translationManager, previewRegistry } = services;

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (!editor || editor.document.languageId !== 'markdown') return;

      const uriStr = editor.document.uri.toString();
      const panelsForDoc = previewRegistry.findForDocument(uriStr);

      if (panelsForDoc.length === 0) return;

      const code = getTargetLanguageCode();
      previewRegistry.setCurrentPanel(panelsForDoc.find(p => p.langCode === code) ?? panelsForDoc[0]);

      if (translationManager.isActive()) {
        await retranslatePreviewDocument({
          translationManager,
          previewRegistry,
          document: editor.document,
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId !== 'markdown') return;
      translationManager.invalidateCache(e.document.uri);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (previewRegistry.hasDocument(doc.uri.toString())) return;
      translationManager.closeDocument(doc.uri);
    })
  );
}

function registerFirstRunApiKeyPrompt(services: ExtensionServices): void {
  const { context, apiKeyManager } = services;
  let firstRunChecked = false;

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async doc => {
      if (firstRunChecked || doc.languageId !== 'markdown') return;
      firstRunChecked = true;

      const allProviderIds = PROVIDER_DEFS.filter(p => p.requiresKey).map(p => p.id);
      const keys = await Promise.all(allProviderIds.map(id => apiKeyManager.getKey(id)));
      const anyKey = keys.some(k => !!k);
      if (!anyKey) {
        const action = await vscode.window.showInformationMessage(
          t('apiKeyNotSet'),
          t('apiKeySetButton')
        );
        if (action) {
          void vscode.commands.executeCommand('markdownTwin.setApiKey');
        }
      }
    })
  );
}

function registerCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: any[]) => any
): void {
  context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

async function promptForTranslatedMarkdownSaveUri(activePanel: PreviewPanel): Promise<vscode.Uri | undefined> {
  const docUri = activePanel.editorDocument.uri;
  const fileName = basenameFromUri(docUri, 'document.md');
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
  const defaultFileName = `${baseName}.${activePanel.langCode}.md`;

  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(docUri, '..', defaultFileName),
    filters: {
      Markdown: ['md', 'markdown']
    }
  });
}

function basenameFromUri(uri: vscode.Uri, fallback: string): string {
  const lastSlash = uri.path.lastIndexOf('/');
  return lastSlash !== -1 ? uri.path.substring(lastSlash + 1) : fallback;
}

export function deactivate() {
  translationManager?.stopTranslation();
}
