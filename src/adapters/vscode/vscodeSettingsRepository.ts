import * as vscode from 'vscode';
import { normalizeProviderId } from '../../domain/provider';
import {
  normalizeSourceLanguageCode,
  normalizeTargetLanguageCode,
  resolveSourceLanguageCode,
} from '../../languages';
import type { TranslationSettingsRepository } from '../../ports/settingsRepository';
import type { TranslationSettingKey, TranslationSettingsChange } from '../../ports/settingsRepository';
import type { TranslationSettings } from '../../domain/translationSettings';
import { normalizeBatchSize } from '../../domain/translationSettings';

export class VscodeSettingsRepository implements TranslationSettingsRepository {
  onDidChange(listener: (change: TranslationSettingsChange) => void | Promise<void>): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(event => {
      const change: TranslationSettingsChange = {
        affects: (key: TranslationSettingKey) => {
          const configKey = key === 'debounceDelayMs' ? 'debounceDelay' : key;
          return event.affectsConfiguration(`markdownTwin.${configKey}`);
        },
      };
      void listener(change);
    });
  }

  get(): TranslationSettings {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const rawMode = config.get<string>('defaultMode') ?? 'Translation Only';
    const debounceSeconds = config.get<number>('debounceDelay') ?? 2;

    return {
      providerId: normalizeProviderId(config.get<string>('provider')),
      sourceLanguage: resolveSourceLanguageCode(config.get<string>('sourceLanguage') ?? 'auto'),
      targetLanguage: normalizeTargetLanguageCode(config.get<string>('targetLanguage')),
      batchSize: normalizeBatchSize(config.get<number>('batchSize')),
      debounceDelayMs: Math.max(1, debounceSeconds) * 1000,
      defaultMode: rawMode === 'Bilingual' ? 'bilingual' : 'translation-only',
      azureRegion: config.get<string>('azureRegion') ?? 'global',
    };
  }

  async update(patch: Partial<TranslationSettings>): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const updates: Array<Thenable<void>> = [];
    if (patch.providerId !== undefined) updates.push(config.update('provider', patch.providerId, vscode.ConfigurationTarget.Global));
    if (patch.sourceLanguage !== undefined) updates.push(config.update('sourceLanguage', patch.sourceLanguage, vscode.ConfigurationTarget.Global));
    if (patch.targetLanguage !== undefined) updates.push(config.update('targetLanguage', patch.targetLanguage, vscode.ConfigurationTarget.Global));
    if (patch.batchSize !== undefined) updates.push(config.update('batchSize', patch.batchSize, vscode.ConfigurationTarget.Global));
    if (patch.debounceDelayMs !== undefined) updates.push(config.update('debounceDelay', patch.debounceDelayMs / 1000, vscode.ConfigurationTarget.Global));
    if (patch.defaultMode !== undefined) {
      const value = patch.defaultMode === 'bilingual' ? 'Bilingual' : 'Translation Only';
      updates.push(config.update('defaultMode', value, vscode.ConfigurationTarget.Global));
    }
    if (patch.azureRegion !== undefined) updates.push(config.update('azureRegion', patch.azureRegion, vscode.ConfigurationTarget.Global));
    await Promise.all(updates);
  }

  async migrateLegacySettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const rawProvider = config.get<string>('provider');
    const rawSource = config.get<string>('sourceLanguage');
    const rawTarget = config.get<string>('targetLanguage');
    await this.update({
      ...(rawProvider && rawProvider !== normalizeProviderId(rawProvider)
        ? { providerId: normalizeProviderId(rawProvider) }
        : {}),
      ...(rawSource && rawSource !== normalizeSourceLanguageCode(rawSource)
        ? { sourceLanguage: normalizeSourceLanguageCode(rawSource) }
        : {}),
      ...(rawTarget && rawTarget !== normalizeTargetLanguageCode(rawTarget)
        ? { targetLanguage: normalizeTargetLanguageCode(rawTarget) }
        : {}),
    });
  }
}
