import { InvalidTranslationResponseError } from '../domain/translationError';
import type { TranslationProvider } from '../ports/translationProvider';
import type { DocumentTranslationSession, TranslationRun } from './documentTranslationSession';

export type TranslationExecutionResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: unknown; readonly targetLanguage: string };

export interface TranslationExecutionRequest {
  readonly session: DocumentTranslationSession;
  readonly run: TranslationRun;
  readonly provider: TranslationProvider;
  readonly sourceLanguage: string;
  readonly targetLanguages: readonly string[];
  readonly pendingByTarget: ReadonlyMap<string, readonly string[]>;
  readonly totalCount: number;
  readonly batchSize: number;
  readonly isEnabled: () => boolean;
  readonly commitBatch: (
    targetLanguage: string,
    sourceTexts: readonly string[],
    translatedTexts: readonly string[]
  ) => void;
  readonly onProgress: (completed: number, total: number) => void;
}

/** Executes provider work without depending on VS Code or presentation state. */
export class TranslationExecutor {
  async execute(request: TranslationExecutionRequest): Promise<TranslationExecutionResult> {
    const {
      session,
      run,
      provider,
      sourceLanguage,
      targetLanguages,
      pendingByTarget,
      totalCount,
      batchSize,
      isEnabled,
      commitBatch,
      onProgress,
    } = request;
    let completed = 0;

    onProgress(completed, totalCount);

    for (const targetLanguage of targetLanguages) {
      if (!isEnabled() || !session.isCurrent(run)) return { kind: 'cancelled' };
      const pending = pendingByTarget.get(targetLanguage) ?? [];

      for (let offset = 0; offset < pending.length; offset += batchSize) {
        if (!isEnabled() || !session.isCurrent(run)) return { kind: 'cancelled' };
        const batch = pending.slice(offset, offset + batchSize);

        try {
          const translated = await provider.translate(
            batch,
            sourceLanguage,
            targetLanguage,
            run.signal
          );
          if (translated.length !== batch.length) {
            throw new InvalidTranslationResponseError(batch.length, translated.length);
          }

          const committed = session.commit(run, () => {
            commitBatch(targetLanguage, batch, translated);
          });
          if (!committed) return { kind: 'cancelled' };
        } catch (error: unknown) {
          if (!session.isCurrent(run) || run.signal.aborted) return { kind: 'cancelled' };
          return { kind: 'failed', error, targetLanguage };
        }

        completed += batch.length;
        onProgress(completed, totalCount);
      }
    }

    return session.isCurrent(run) && isEnabled()
      ? { kind: 'completed' }
      : { kind: 'cancelled' };
  }
}
