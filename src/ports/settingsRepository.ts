import type { TranslationSettings } from '../domain/translationSettings';

export type TranslationSettingKey = keyof TranslationSettings;

export interface TranslationSettingsChange {
  affects(key: TranslationSettingKey): boolean;
}

export interface SettingsSubscription {
  dispose(): void;
}

export interface TranslationSettingsRepository {
  get(): TranslationSettings;
  update(patch: Partial<TranslationSettings>): Promise<void>;
  onDidChange(listener: (change: TranslationSettingsChange) => void | Promise<void>): SettingsSubscription;
}
