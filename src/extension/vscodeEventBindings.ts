import * as vscode from 'vscode';
import { t } from '../i18n';
import { retranslatePreviewDocument } from '../adapters/vscode/preview/previewActions';
import { PROVIDER_DEFINITIONS } from '../adapters/providers/providerRegistry';
import type { ExtensionServices } from './commandRegistry';

export function bindVscodeEvents(services: ExtensionServices): void {
  bindConfigurationChanges(services);
  bindEditorAndDocumentChanges(services);
  bindFirstRunCredentialPrompt(services);
}

export function syncTargetLanguageContext(services: ExtensionServices): void {
  const code = services.settingsRepository.get().targetLanguage;
  void vscode.commands.executeCommand('setContext', 'markdownTwin.targetLang', code);
}

function bindConfigurationChanges(services: ExtensionServices): void {
  const { context, coordinator, statusBar, previewRegistry, settingsRepository } = services;
  context.subscriptions.push(settingsRepository.onDidChange(async change => {
    if (change.affects('targetLanguage')) {
      syncTargetLanguageContext(services);
      for (const documentUri of previewRegistry.getDocumentUris()) {
        const document = vscode.workspace.textDocuments.find(
          candidate => candidate.uri.toString() === documentUri
        ) ?? previewRegistry.getDocument(documentUri);
        if (document) {
          await previewRegistry.createOrShow(context.extensionUri, document, { avoidOpeningSource: true });
        }
      }
      if (coordinator.isActive()) await coordinator.rerunAll();
      else statusBar.showOffline();
    }

    if (change.affects('sourceLanguage')) {
      if (coordinator.isActive()) await coordinator.rerunAll({ clearAllCache: true });
      else {
        coordinator.clearAllCache();
        statusBar.showOffline();
      }
    }

    if (change.affects('providerId') || change.affects('azureRegion')) {
      if (coordinator.isActive()) await coordinator.rerunAll({ clearAllCache: true });
      else statusBar.showOffline();
    }
  }));
}

function bindEditorAndDocumentChanges(services: ExtensionServices): void {
  const { context, coordinator, previewRegistry, settingsRepository } = services;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (!editor || editor.document.languageId !== 'markdown') return;
      const panels = previewRegistry.findForDocument(editor.document.uri.toString());
      if (panels.length === 0) return;
      const language = settingsRepository.get().targetLanguage;
      previewRegistry.setCurrentPanel(panels.find(panel => panel.langCode === language) ?? panels[0]);
      if (coordinator.isActive()) {
        await retranslatePreviewDocument({ coordinator, previewRegistry, document: editor.document });
      }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'markdown') coordinator.invalidateDocument(event.document.uri);
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      if (!previewRegistry.hasDocument(document.uri.toString())) coordinator.closeDocument(document.uri);
    })
  );
}

function bindFirstRunCredentialPrompt(services: ExtensionServices): void {
  const { context, apiKeyManager } = services;
  let checked = false;
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async document => {
    if (checked || document.languageId !== 'markdown') return;
    checked = true;
    const providerIds = PROVIDER_DEFINITIONS.filter(provider => provider.requiresKey).map(provider => provider.id);
    const keys = await Promise.all(providerIds.map(id => apiKeyManager.getKey(id)));
    if (keys.some(Boolean)) return;
    const action = await vscode.window.showInformationMessage(t('apiKeyNotSet'), t('apiKeySetButton'));
    if (action) void vscode.commands.executeCommand('markdownTwin.setApiKey');
  }));
}
