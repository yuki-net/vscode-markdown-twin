import * as vscode from 'vscode';
import { normalizeProviderId } from './providers/ITranslationProvider';
import { resolveSourceLanguageCode } from './languages';
import type { TranslationSettingsRepository } from './ports/translationSettingsRepository';
import type { TranslationSettings } from './domain/translationSettings';
import type { TranslationViewMode } from './translatedMarkdownBuilder';
import { normalizeBatchSize } from './domain/translationSettings';

export class VscodeTranslationSettingsRepository implements TranslationSettingsRepository {
  get(): TranslationSettings {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const rawMode = config.get<string>('defaultMode') ?? 'Translation Only';
    const debounceSeconds = config.get<number>('debounceDelay') ?? 2;

    return {
      providerId: normalizeProviderId(config.get<string>('provider')),
      sourceLanguage: resolveSourceLanguageCode(config.get<string>('sourceLanguage') ?? 'auto'),
      batchSize: normalizeBatchSize(config.get<number>('batchSize')),
      debounceDelayMs: Math.max(1, debounceSeconds) * 1000,
      defaultMode: rawMode === 'Bilingual' ? 'bilingual' : 'translation-only',
      azureRegion: config.get<string>('azureRegion') ?? 'global',
    };
  }

  async updateDefaultMode(mode: TranslationViewMode): Promise<void> {
    const value = mode === 'bilingual' ? 'Bilingual' : 'Translation Only';
    await vscode.workspace
      .getConfiguration('markdownTwin')
      .update('defaultMode', value, vscode.ConfigurationTarget.Global);
  }
}
