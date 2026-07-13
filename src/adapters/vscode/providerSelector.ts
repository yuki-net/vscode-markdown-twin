import * as vscode from 'vscode';
import { ApiKeyManager } from './apiKeyManager';
import { VscodeTranslationCoordinator } from './vscodeTranslationCoordinator';
import { StatusBarPresenter } from './statusBarPresenter';
import type { ProviderId } from '../../domain/provider';
import {
  SUPPORTED_LANGUAGES,
  getLanguageLabel,
  normalizeTargetLanguageCode,
} from '../../languages';
import { t } from '../../i18n';
import { getAzureRegion, promptAzureRegion } from './azureRegion';
import { PROVIDER_DEFINITIONS } from '../providers/providerRegistry';
import type { TranslationSettingsRepository } from '../../ports/settingsRepository';
import { changeLanguage } from '../../application/commands/changeLanguage';
import { changeProvider } from '../../application/commands/changeProvider';

interface ProviderItem extends vscode.QuickPickItem {
  id: ProviderId;
  displayName: string;
  requiresKey: boolean;
  hasKey: boolean;
}

export class ProviderSelector {
  constructor(
    private apiKeyManager: ApiKeyManager,
    private coordinator: VscodeTranslationCoordinator,
    private statusBar: StatusBarPresenter,
    private extensionUri: vscode.Uri,
    private settings: TranslationSettingsRepository
  ) {}

  async showMenu(): Promise<void> {
    while (true) {
      const settings = this.settings.get();
      const providerId = settings.providerId;
      const targetLang = settings.targetLanguage;

      const displayProvider = PROVIDER_DEFINITIONS.find(item => item.id === providerId)?.displayName ?? providerId;
      const langFlagUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'flags', `${targetLang}.svg`);
      const mode = this.coordinator.getMode();
      const modeLabel = mode === 'bilingual' ? t('bilingual') : t('translationOnly');
      const modeIcon = mode === 'bilingual' ? '$(split-horizontal)' : '$(file)';

      type TopItem = vscode.QuickPickItem & { action: 'provider' | 'language' | 'mode' };
      const topItems: TopItem[] = [
        { label: t('outputLanguage'), description: getLanguageLabel(targetLang), action: 'language', iconPath: langFlagUri },
        { label: `${modeIcon} ${t('mode')}`, description: modeLabel, action: 'mode' },
        { label: `$(globe) ${t('provider')}`, description: displayProvider, action: 'provider' },
      ];

      const top = await vscode.window.showQuickPick<TopItem>(
        topItems,
        { title: 'Markdown Twin', placeHolder: t('selectSetting') }
      );

      if (!top) return;

      if (top.action === 'provider') {
        const result = await this._showProviderPicker();
        if (result === '__back__') continue;
        return;
      }

      if (top.action === 'language') {
        const result = await this._showLanguagePicker();
        if (result === '__back__') continue;
        return;
      }

      if (top.action === 'mode') {
        await this.coordinator.toggleMode();
        return;
      }

      return;
    }
  }

  async show(): Promise<ProviderId | undefined> {
    const currentId = this.settings.get().providerId;

    const selected = await vscode.window.showQuickPick(
      await this._buildProviderItems(currentId),
      { title: t('selectProvider'), placeHolder: t('chooseProvider'), matchOnDescription: true }
    );
    if (!selected) return undefined;

    const applied = await this._applyProvider(selected);
    return applied ? selected.id : undefined;
  }

  async showApiKeyPicker(options: { showBack?: boolean } = {}): Promise<string | ProviderId | undefined> {
    const currentId = this.settings.get().providerId;

    const BACK: vscode.QuickPickItem & { id: string } = { label: `$(arrow-left) ${t('back')}`, id: '__back__' };
    const SEP: vscode.QuickPickItem & { id: string } = { label: '', kind: vscode.QuickPickItemKind.Separator, id: '__sep__' };
    const providerItems = await this._buildProviderItems(currentId);
    const items: Array<vscode.QuickPickItem & { id: string }> = options.showBack
      ? [BACK, SEP, ...providerItems]
      : providerItems;

    const selected = await vscode.window.showQuickPick(
      items,
      { title: t('apiKey'), placeHolder: t('chooseProvider'), matchOnDescription: true }
    );
    if (!selected) return undefined;
    if (selected.id === '__back__') return '__back__';

    const providerId = (selected as ProviderItem).id;
    const existing = await this.apiKeyManager.getKey(providerId);
    await this.apiKeyManager.prompt(providerId, existing);
    return providerId;
  }

  private async _showProviderPicker(): Promise<string | ProviderId | undefined> {
    const currentId = this.settings.get().providerId;

    const BACK: vscode.QuickPickItem & { id: string } = { label: `$(arrow-left) ${t('back')}`, id: '__back__' };
    const SEP1: vscode.QuickPickItem & { id: string } = { label: '', kind: vscode.QuickPickItemKind.Separator, id: '__sep1__' };
    const SEP2: vscode.QuickPickItem & { id: string } = { label: '', kind: vscode.QuickPickItemKind.Separator, id: '__sep2__' };
    const API_KEY: vscode.QuickPickItem & { id: string } = {
      label: `$(key) ${t('setOrChangeApiKey')}`,
      description: t('apiKey'),
      id: '__apiKey__',
    };
    const AZURE_REGION: vscode.QuickPickItem & { id: string } = {
      label: `$(server-environment) ${t('azureRegion')}`,
      description: getAzureRegion(this.settings),
      id: '__azureRegion__',
    };
    const DELETE_API_KEY: vscode.QuickPickItem & { id: string } = {
      label: `$(trash) ${t('deleteApiKey')}`,
      id: '__deleteApiKey__',
    };

    const providerItems = await this._buildProviderItems(currentId);
    const hasSavedApiKey = providerItems.some(item => item.hasKey);
    const settingsItems = currentId === 'microsoft'
      ? [API_KEY, AZURE_REGION]
      : [API_KEY];
    if (hasSavedApiKey) {
      settingsItems.push(DELETE_API_KEY);
    }

    const selected = await vscode.window.showQuickPick(
      [BACK, SEP1, ...providerItems, SEP2, ...settingsItems],
      { title: t('provider'), placeHolder: t('chooseProvider'), matchOnDescription: true }
    );

    if (!selected) return undefined;
    if (selected.id === '__back__') return '__back__';

    if (selected.id === '__deleteApiKey__') {
      await this._deleteApiKey();
      return '__back__';
    }

    if (selected.id === '__apiKey__') {
      const result = await this.showApiKeyPicker({ showBack: true });
      return result === undefined ? undefined : '__back__';
    }

    if (selected.id === '__azureRegion__') {
      await promptAzureRegion(this.settings);
      return '__back__';
    }

    const applied = await this._applyProvider(selected as ProviderItem);
    return applied ? (selected as ProviderItem).id : '__back__';
  }

  private async _showLanguagePicker(): Promise<string | undefined> {
    const currentLang = this.settings.get().targetLanguage;

    type LangItem = vscode.QuickPickItem & { code: string };

    const BACK: LangItem = { label: `$(arrow-left) ${t('back')}`, code: '__back__' };
    const SEP: LangItem = { label: '', kind: vscode.QuickPickItemKind.Separator, code: '__sep__' };

    const langItems: LangItem[] = SUPPORTED_LANGUAGES.map(l => ({
      label: l.label,
      description: currentLang === l.code ? '$(check)' : undefined,
      code: l.code,
      picked: currentLang === l.code,
      iconPath: vscode.Uri.joinPath(this.extensionUri, 'media', 'flags', `${l.code}.svg`),
    }));

    const selected = await vscode.window.showQuickPick<LangItem>(
      [BACK, SEP, ...langItems],
      { title: t('outputLanguage'), placeHolder: t('chooseTargetLanguage') }
    );

    if (!selected) return undefined;
    if (selected.code === '__back__') return '__back__';

    await changeLanguage(this.settings, selected.code);
    await vscode.commands.executeCommand('setContext', 'markdownTwin.targetLang', selected.code);

    if (!this.coordinator.isActive()) {
      this.statusBar.showOffline();
    }

    return selected.code;
  }

  private async _deleteApiKey(): Promise<void> {
    const keyProviders = PROVIDER_DEFINITIONS.filter(p => p.requiresKey);

    const withKeys = await Promise.all(
      keyProviders.map(async p => {
        const key = await this.apiKeyManager.getKey(p.id);
        return key ? p : null;
      })
    );
    const available = withKeys.filter((p): p is (typeof keyProviders)[0] => p !== null);

    if (available.length === 0) {
      vscode.window.showInformationMessage(t('noSavedKeys'));
      return;
    }

    type DeleteItem = vscode.QuickPickItem & { id: ProviderId };
    const picked = await vscode.window.showQuickPick<DeleteItem>(
      available.map(p => ({ label: p.displayName, id: p.id })),
      { title: t('deleteApiKey'), placeHolder: t('chooseProvider') }
    );
    if (!picked) return;

    const confirmed = await vscode.window.showWarningMessage(
      t('deleteApiKeyConfirm', picked.label),
      { modal: true },
      t('delete')
    );
    if (confirmed !== t('delete')) return;

    await this.apiKeyManager.deleteKey(picked.id);
    vscode.window.showInformationMessage(t('apiKeyDeleted', picked.label));
  }

  private async _buildProviderItems(currentId: ProviderId): Promise<ProviderItem[]> {
    return Promise.all(PROVIDER_DEFINITIONS.map(async p => {
      const key = await this.apiKeyManager.getKey(p.id);
      let description = key ? t('apiKeyConfigured') : t('apiKeyNotConfigured');
      if (currentId === p.id) {
        description += '  $(check)';
      }

      return {
        label: p.displayName,
        description,
        id: p.id,
        displayName: p.displayName,
        requiresKey: p.requiresKey,
        hasKey: !!key,
        picked: currentId === p.id,
      };
    }));
  }

  private async _applyProvider(selected: ProviderItem): Promise<boolean> {
    if (selected.requiresKey) {
      const existing = await this.apiKeyManager.getKey(selected.id);
      if (!existing) {
        const configuredKey = await this.apiKeyManager.prompt(selected.id);
        if (!configuredKey) {
          return false;
        }
      }
    }

    await changeProvider(this.settings, selected.id);

    if (!this.coordinator.isActive()) {
      this.statusBar.setActiveProvider(selected.id);
      this.statusBar.showOffline();
    }

    return true;
  }
}
