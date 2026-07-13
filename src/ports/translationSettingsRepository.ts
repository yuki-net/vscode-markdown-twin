import type { TranslationSettings } from '../domain/translationSettings';
import type { TranslationViewMode } from '../translatedMarkdownBuilder';

export interface TranslationSettingsRepository {
  get(): TranslationSettings;
  updateDefaultMode(mode: TranslationViewMode): Promise<void>;
}
