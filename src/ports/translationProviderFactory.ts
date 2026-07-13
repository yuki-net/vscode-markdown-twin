import type { ProviderId } from '../domain/provider';
import type { TranslationProvider } from './translationProvider';

export interface TranslationProviderOptions {
  readonly azureRegion: string;
}

export interface TranslationProviderMetadata {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly requiresCredentials: boolean;
}

export interface TranslationProviderFactory {
  getMetadata(providerId: ProviderId): TranslationProviderMetadata | undefined;
  create(
    providerId: ProviderId,
    options: TranslationProviderOptions
  ): Promise<TranslationProvider | null>;
}
