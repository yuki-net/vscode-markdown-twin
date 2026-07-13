import type { SecretRepository } from '../../ports/secretRepository';
import type { ProviderId } from '../../domain/provider';
import type {
  TranslationProviderFactory,
  TranslationProviderMetadata,
  TranslationProviderOptions,
} from '../../ports/translationProviderFactory';
import type { TranslationProvider } from '../../ports/translationProvider';
import { MissingProviderCredentialError } from '../../domain/translationError';
import { DeeplProvider } from './deeplProvider';
import { GoogleCloudProvider } from './googleCloudProvider';
import { MicrosoftProvider } from './microsoftProvider';
import { PapagoProvider } from './papagoProvider';
import {
  DEFAULT_PROVIDER_EXECUTION_POLICY,
  ProviderConcurrencyGate,
  ResilientTranslationProvider,
  type ProviderExecutionPolicyOptions,
} from './resilientTranslationProvider';

export interface ProviderDefinition {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly requiresKey: boolean;
  create(apiKey: string, options: TranslationProviderOptions): TranslationProvider;
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

export class RegistryTranslationProviderFactory implements TranslationProviderFactory {
  private readonly gates = new Map<ProviderId, ProviderConcurrencyGate>();

  constructor(
    private readonly secrets: SecretRepository,
    private readonly executionPolicy: ProviderExecutionPolicyOptions = DEFAULT_PROVIDER_EXECUTION_POLICY,
    private readonly maxConcurrency = 2
  ) {}

  getMetadata(id: ProviderId): TranslationProviderMetadata | undefined {
    const definition = PROVIDER_DEFINITIONS.find(provider => provider.id === id);
    return definition && {
      id: definition.id,
      displayName: definition.displayName,
      requiresCredentials: definition.requiresKey,
    };
  }

  async create(
    id: ProviderId,
    options: TranslationProviderOptions
  ): Promise<TranslationProvider | null> {
    const definition = PROVIDER_DEFINITIONS.find(provider => provider.id === id);
    if (!definition) return null;

    const apiKey = await this.secrets.get(id) ?? '';
    if (definition.requiresKey && !apiKey) {
      throw new MissingProviderCredentialError(id);
    }
    let gate = this.gates.get(id);
    if (!gate) {
      gate = new ProviderConcurrencyGate(this.maxConcurrency);
      this.gates.set(id, gate);
    }
    return new ResilientTranslationProvider(
      definition.create(apiKey, options),
      gate,
      this.executionPolicy
    );
  }
}
