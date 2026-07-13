import type { TranslationSpec } from '../domain/translationSpec';
import type { TranslationStatus } from '../domain/translationStatus';

export interface DocumentTranslationState {
  readonly documentId: string;
  readonly enabled: boolean;
  readonly spec?: TranslationSpec;
  readonly status: TranslationStatus;
}

/** Single source of truth for document translation lifecycle state. */
export class TranslationStore {
  private readonly states = new Map<string, DocumentTranslationState>();

  get(documentId: string): DocumentTranslationState | undefined {
    return this.states.get(documentId);
  }

  values(): readonly DocumentTranslationState[] {
    return [...this.states.values()];
  }

  isAnyEnabled(): boolean {
    return this.values().some(state => state.enabled);
  }

  isEnabled(documentId: string): boolean {
    return this.states.get(documentId)?.enabled ?? false;
  }

  enable(documentId: string, spec: TranslationSpec): void {
    this.states.set(documentId, {
      documentId,
      enabled: true,
      spec,
      status: { kind: 'idle' },
    });
  }

  setStatus(documentId: string, status: TranslationStatus): void {
    const current = this.states.get(documentId);
    this.states.set(documentId, {
      documentId,
      enabled: current?.enabled ?? false,
      spec: current?.spec,
      status,
    });
  }

  disable(documentId: string): void {
    const current = this.states.get(documentId);
    if (!current) return;
    this.states.set(documentId, {
      ...current,
      enabled: false,
      status: { kind: 'cancelled' },
    });
  }

  remove(documentId: string): void {
    this.states.delete(documentId);
  }

  clearSpecs(): void {
    for (const [documentId, state] of this.states) {
      this.states.set(documentId, {
        ...state,
        spec: undefined,
        status: state.enabled ? { kind: 'idle' } : state.status,
      });
    }
  }

  clear(): void {
    this.states.clear();
  }
}
