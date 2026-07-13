import type { TranslationSettingsRepository } from '../../ports/settingsRepository';

export function changeLanguage(
  settings: TranslationSettingsRepository,
  targetLanguage: string
): Promise<void> {
  return settings.update({ targetLanguage });
}
