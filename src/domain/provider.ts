export type ProviderId = 'google-cloud' | 'microsoft' | 'deepl' | 'papago';

export const DEFAULT_PROVIDER_ID: ProviderId = 'google-cloud';

const PROVIDER_ALIAS_TO_ID: Readonly<Record<string, ProviderId>> = {
  'google-cloud': 'google-cloud',
  'google cloud': 'google-cloud',
  'google cloud translation': 'google-cloud',
  azure: 'microsoft',
  microsoft: 'microsoft',
  deepl: 'deepl',
  papago: 'papago',
};

export function normalizeProviderId(rawValue: string | undefined): ProviderId {
  if (!rawValue) return DEFAULT_PROVIDER_ID;
  return PROVIDER_ALIAS_TO_ID[rawValue.trim().toLowerCase()] ?? DEFAULT_PROVIDER_ID;
}
