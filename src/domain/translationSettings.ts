import type { ProviderId } from '../providers/ITranslationProvider';
import type { TranslationViewMode } from '../translatedMarkdownBuilder';

export interface TranslationSettings {
  readonly providerId: ProviderId;
  readonly sourceLanguage: string;
  readonly batchSize: number;
  readonly debounceDelayMs: number;
  readonly defaultMode: TranslationViewMode;
  readonly azureRegion: string;
}

export function normalizeBatchSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.floor(value));
}
