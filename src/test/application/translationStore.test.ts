import { TranslationStore } from '../../application/translationStore';
import type { TranslationSpec } from '../../domain/translationSpec';

describe('TranslationStore', () => {
  const spec: TranslationSpec = {
    providerId: 'google-cloud',
    sourceLanguage: 'auto',
    targetLanguages: ['ja'],
    providerOptionsKey: 'default',
  };

  it('keeps enabled state separate from execution status', () => {
    const store = new TranslationStore();
    store.enable('document', spec);
    store.setStatus('document', {
      kind: 'failed',
      error: { kind: 'provider', message: 'failed' },
    });

    expect(store.isEnabled('document')).toBe(true);
    expect(store.get('document')?.status.kind).toBe('failed');
  });

  it('invalidates specs without disabling open translation targets', () => {
    const store = new TranslationStore();
    store.enable('document', spec);

    store.clearSpecs();

    expect(store.isEnabled('document')).toBe(true);
    expect(store.get('document')?.spec).toBeUndefined();
    expect(store.get('document')?.status).toEqual({ kind: 'idle' });
  });
});
