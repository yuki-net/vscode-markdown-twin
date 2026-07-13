import { DEFAULT_PROVIDER_ID, normalizeProviderId } from '../../../domain/provider';

describe('provider defaults', () => {
  it('uses Google Cloud as the initial provider', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('google-cloud');
    expect(normalizeProviderId(undefined)).toBe('google-cloud');
    expect(normalizeProviderId('unknown-provider')).toBe('google-cloud');
  });
});
