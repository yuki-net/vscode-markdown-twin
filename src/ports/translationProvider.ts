import type { ProviderId } from '../domain/provider';

export interface TranslationProvider {
  readonly id: ProviderId;
  readonly name: string;

  translate(
    texts: readonly string[],
    sourceLanguage: string,
    targetLanguage: string,
    signal: AbortSignal
  ): Promise<readonly string[]>;
}
