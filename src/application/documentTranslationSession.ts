export interface TranslationRun {
  readonly generation: number;
  readonly signal: AbortSignal;
}

/**
 * Owns the lifetime of asynchronous translation work for a single document.
 * Starting a new run invalidates and aborts the previous run.
 */
export class DocumentTranslationSession {
  private generation = 0;
  private controller: AbortController | undefined;

  begin(): TranslationRun {
    this.controller?.abort();
    this.controller = new AbortController();

    return {
      generation: ++this.generation,
      signal: this.controller.signal,
    };
  }

  isCurrent(run: TranslationRun): boolean {
    return run.generation === this.generation && !run.signal.aborted;
  }

  commit(run: TranslationRun, action: () => void): boolean {
    if (!this.isCurrent(run)) return false;
    action();
    return true;
  }

  cancel(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
  }
}
