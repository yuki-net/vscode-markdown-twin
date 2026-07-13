import type { ApiKeyManager } from '../apiKeyManager';
import { DeeplProvider } from './deeplProvider';
import { GoogleCloudProvider } from './googleCloudProvider';
import type { ITranslationProvider, ProviderId } from './ITranslationProvider';
import { MicrosoftProvider } from './microsoftProvider';
import { PapagoProvider } from './papagoProvider';

export interface ProviderOptions {
  readonly azureRegion: string;
}

export interface ProviderDefinition {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly requiresKey: boolean;
  create(apiKey: string, options: ProviderOptions): ITranslationProvider;
}

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    id: 'google-cloud',
    displayName: 'Google Cloud',
    requiresKey: true,
    create: apiKey => new GoogleCloudProvider(apiKey),
  },
  {
    id: 'microsoft',
    displayName: 'Azure',
    requiresKey: true,
    create: (apiKey, options) => new MicrosoftProvider(apiKey, options.azureRegion),
  },
  {
    id: 'deepl',
    displayName: 'DeepL',
    requiresKey: true,
    create: apiKey => new DeeplProvider(apiKey),
  },
  {
    id: 'papago',
    displayName: 'Papago',
    requiresKey: true,
    create: apiKey => new PapagoProvider(apiKey),
  },
];

export async function createTranslationProvider(
  id: ProviderId,
  apiKeyManager: ApiKeyManager,
  options: ProviderOptions
): Promise<ITranslationProvider | null> {
  const definition = PROVIDER_DEFINITIONS.find(provider => provider.id === id);
  if (!definition) return null;

  const apiKey = await apiKeyManager.getKey(id) ?? '';
  return definition.create(apiKey, options);
}
