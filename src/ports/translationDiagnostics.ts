export type TranslationDiagnostic =
  | { readonly kind: 'missing-credentials'; readonly providerName: string }
  | { readonly kind: 'azure-region'; readonly region: string }
  | { readonly kind: 'rate-limit' }
  | {
      readonly kind: 'translation-failed';
      readonly providerName: string;
      readonly targetLanguage: string;
      readonly error: unknown;
    }
  | {
      readonly kind: 'unexpected';
      readonly message: string;
      readonly error?: unknown;
      readonly showOutputHint: boolean;
    };

export interface TranslationDiagnostics {
  info(message: string): void;
  warning(message: string): void;
  report(diagnostic: TranslationDiagnostic): Promise<void>;
  dispose(): void;
}
