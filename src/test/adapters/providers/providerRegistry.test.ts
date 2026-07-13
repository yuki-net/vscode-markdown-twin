import { MissingProviderCredentialError } from '../../../domain/translationError';
import { RegistryTranslationProviderFactory } from '../../../adapters/providers/providerRegistry';

describe('RegistryTranslationProviderFactory', () => {
  it('keeps provider metadata and construction in one registry', () => {
    const factory = new RegistryTranslationProviderFactory({} as any);

    expect(factory.getMetadata('microsoft')).toEqual({
      id: 'microsoft',
      displayName: 'Azure',
      requiresCredentials: true,
    });
  });

  it('rejects provider creation when credentials are missing', async () => {
    const factory = new RegistryTranslationProviderFactory({
      get: jest.fn(async () => undefined),
    } as any);

    await expect(factory.create('deepl', { azureRegion: 'global' }))
      .rejects.toBeInstanceOf(MissingProviderCredentialError);
  });
});
