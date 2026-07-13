import type { ProviderId } from './provider';

export class MissingProviderCredentialError extends Error {
  constructor(readonly providerId: ProviderId) {
    super(`Missing credentials for provider: ${providerId}`);
    this.name = 'MissingProviderCredentialError';
  }
}

export class InvalidTranslationResponseError extends Error {
  constructor(
    readonly expectedCount: number,
    readonly actualCount: number
  ) {
    super(`Translation provider returned ${actualCount} results for ${expectedCount} inputs`);
    this.name = 'InvalidTranslationResponseError';
  }
}

export class ProviderRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderConfigurationError extends Error {
  constructor(
    readonly kind: 'azure-region',
    readonly value: string,
    message: string
  ) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}
