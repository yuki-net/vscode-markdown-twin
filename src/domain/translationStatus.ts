export type TranslationFailureKind =
  | 'authentication'
  | 'rate-limit'
  | 'timeout'
  | 'provider'
  | 'invalid-response';

export interface TranslationFailure {
  readonly kind: TranslationFailureKind;
  readonly message: string;
  readonly targetLanguage?: string;
}

export type TranslationStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly completed: number; readonly total: number }
  | { readonly kind: 'completed' }
  | { readonly kind: 'partial'; readonly failures: readonly TranslationFailure[] }
  | { readonly kind: 'failed'; readonly error: TranslationFailure }
  | { readonly kind: 'cancelled' };
