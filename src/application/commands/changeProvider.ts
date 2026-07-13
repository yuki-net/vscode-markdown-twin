import type { ProviderId } from '../../domain/provider';
import type { TranslationSettingsRepository } from '../../ports/settingsRepository';

export function changeProvider(
  settings: TranslationSettingsRepository,
  providerId: ProviderId
): Promise<void> {
  return settings.update({ providerId });
}
