import { ProviderRateLimitError, ProviderTimeoutError } from '../../domain/translationError';
import type { TranslationProvider } from '../../ports/translationProvider';

export interface ProviderExecutionPolicyOptions {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly baseRetryDelayMs: number;
}

export const DEFAULT_PROVIDER_EXECUTION_POLICY: ProviderExecutionPolicyOptions = {
  timeoutMs: 30_000,
  maxRetries: 2,
  baseRetryDelayMs: 500,
};

type QueueEntry = {
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: unknown) => void;
  readonly signal: AbortSignal;
  onAbort?: () => void;
};

/** A shared gate limits concurrent provider calls across document sessions. */
export class ProviderConcurrencyGate {
  private active = 0;
  private readonly queue: QueueEntry[] = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Concurrency limit must be positive');
  }

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(createAbortError());
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.createRelease());
    }
    return new Promise((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject, signal };
      entry.onAbort = () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) this.queue.splice(index, 1);
        reject(createAbortError());
      };
      signal.addEventListener('abort', entry.onAbort, { once: true });
      this.queue.push(entry);
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.startNext();
    };
  }

  private startNext(): void {
    while (this.queue.length > 0 && this.active < this.limit) {
      const entry = this.queue.shift()!;
      entry.signal.removeEventListener('abort', entry.onAbort!);
      if (entry.signal.aborted) {
        entry.reject(createAbortError());
        continue;
      }
      this.active++;
      entry.resolve(this.createRelease());
    }
  }
}

export class ResilientTranslationProvider implements TranslationProvider {
  readonly id;
  readonly name;

  constructor(
    private readonly inner: TranslationProvider,
    private readonly gate: ProviderConcurrencyGate,
    private readonly options: ProviderExecutionPolicyOptions = DEFAULT_PROVIDER_EXECUTION_POLICY
  ) {
    this.id = inner.id;
    this.name = inner.name;
  }

  async translate(
    texts: readonly string[],
    sourceLanguage: string,
    targetLanguage: string,
    signal: AbortSignal
  ): Promise<readonly string[]> {
    const release = await this.gate.acquire(signal);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.runAttempt(texts, sourceLanguage, targetLanguage, signal);
        } catch (error: unknown) {
          if (signal.aborted) throw createAbortError();
          if (
            !(error instanceof ProviderRateLimitError)
            || this.inner.rateLimitRetryMode === 'none'
            || attempt >= this.options.maxRetries
          ) {
            throw error;
          }
          const delayMs = error.retryAfterMs
            ?? this.options.baseRetryDelayMs * 2 ** attempt;
          await abortableDelay(delayMs, signal);
        }
      }
    } finally {
      release();
    }
  }

  private async runAttempt(
    texts: readonly string[],
    sourceLanguage: string,
    targetLanguage: string,
    parentSignal: AbortSignal
  ): Promise<readonly string[]> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new ProviderTimeoutError(this.options.timeoutMs));
      }, this.options.timeoutMs);
    });
    let rejectCancelled: ((error: unknown) => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      rejectCancelled = reject;
    });
    const cancel = () => rejectCancelled?.(createAbortError());
    if (parentSignal.aborted) cancel();
    else parentSignal.addEventListener('abort', cancel, { once: true });

    try {
      return await Promise.race([
        this.inner.translate(texts, sourceLanguage, targetLanguage, controller.signal),
        timeout,
        cancelled,
      ]);
    } catch (error: unknown) {
      if (timedOut) throw new ProviderTimeoutError(this.options.timeoutMs);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      parentSignal.removeEventListener('abort', abort);
      parentSignal.removeEventListener('abort', cancel);
    }
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, delayMs));
    const abort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function createAbortError(): Error {
  const error = new Error('Translation cancelled');
  error.name = 'AbortError';
  return error;
}
