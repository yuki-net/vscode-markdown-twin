import { DocumentTranslationSession } from '../../application/documentTranslationSession';

describe('DocumentTranslationSession', () => {
  it('invalidates and aborts an older run when a new run starts', () => {
    const session = new DocumentTranslationSession();
    const first = session.begin();
    const second = session.begin();

    expect(first.signal.aborted).toBe(true);
    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it('does not commit a result from a stale run', () => {
    const session = new DocumentTranslationSession();
    const first = session.begin();
    session.begin();
    const commit = jest.fn();

    expect(session.commit(first, commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('invalidates the current run when cancelled', () => {
    const session = new DocumentTranslationSession();
    const run = session.begin();

    session.cancel();

    expect(run.signal.aborted).toBe(true);
    expect(session.isCurrent(run)).toBe(false);
  });
});
