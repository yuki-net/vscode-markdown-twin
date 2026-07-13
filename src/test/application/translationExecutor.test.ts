import { TranslationExecutor } from '../../application/translationExecutor';
import { DocumentTranslationSession } from '../../application/documentTranslationSession';

describe('TranslationExecutor', () => {
  it('commits complete batches and reports exact progress', async () => {
    const session = new DocumentTranslationSession();
    const run = session.begin();
    const commitBatch = jest.fn();
    const onProgress = jest.fn();
    const provider = {
      id: 'google-cloud' as const,
      name: 'Google Cloud',
      translate: jest.fn(async (texts: readonly string[]) => texts.map(text => `translated:${text}`)),
    };

    const result = await new TranslationExecutor().execute({
      session,
      run,
      provider,
      sourceLanguage: 'en',
      targetLanguages: ['ja'],
      pendingByTarget: new Map([['ja', ['one', 'two']]]),
      totalCount: 2,
      batchSize: 10,
      isEnabled: () => true,
      commitBatch,
      onProgress,
    });

    expect(result).toEqual({ kind: 'completed' });
    expect(commitBatch).toHaveBeenCalledWith(
      'ja',
      ['one', 'two'],
      ['translated:one', 'translated:two']
    );
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it('rejects a response whose result count differs from the request', async () => {
    const session = new DocumentTranslationSession();
    const run = session.begin();
    const commitBatch = jest.fn();
    const result = await new TranslationExecutor().execute({
      session,
      run,
      provider: {
        id: 'google-cloud',
        name: 'Google Cloud',
        translate: jest.fn(async () => ['only one']),
      },
      sourceLanguage: 'en',
      targetLanguages: ['ja'],
      pendingByTarget: new Map([['ja', ['one', 'two']]]),
      totalCount: 2,
      batchSize: 10,
      isEnabled: () => true,
      commitBatch,
      onProgress: jest.fn(),
    });

    expect(result.kind).toBe('failed');
    expect(commitBatch).not.toHaveBeenCalled();
  });

  it('does not commit after the session is superseded', async () => {
    const session = new DocumentTranslationSession();
    const run = session.begin();
    let resolve!: (value: readonly string[]) => void;
    const response = new Promise<readonly string[]>(done => { resolve = done; });
    const commitBatch = jest.fn();
    const execution = new TranslationExecutor().execute({
      session,
      run,
      provider: {
        id: 'google-cloud',
        name: 'Google Cloud',
        translate: jest.fn(() => response),
      },
      sourceLanguage: 'en',
      targetLanguages: ['ja'],
      pendingByTarget: new Map([['ja', ['one']]]),
      totalCount: 1,
      batchSize: 10,
      isEnabled: () => true,
      commitBatch,
      onProgress: jest.fn(),
    });

    session.begin();
    resolve(['stale']);

    await expect(execution).resolves.toEqual({ kind: 'cancelled' });
    expect(commitBatch).not.toHaveBeenCalled();
  });

  it('reports partial completion and preserves successful target batches', async () => {
    const session = new DocumentTranslationSession();
    const run = session.begin();
    const commitBatch = jest.fn();
    const provider = {
      id: 'google-cloud' as const,
      name: 'Google Cloud',
      translate: jest.fn()
        .mockResolvedValueOnce(['translated:one'])
        .mockRejectedValueOnce(new Error('second target failed')),
    };

    const result = await new TranslationExecutor().execute({
      session,
      run,
      provider,
      sourceLanguage: 'en',
      targetLanguages: ['ja', 'ko'],
      pendingByTarget: new Map([
        ['ja', ['one']],
        ['ko', ['two']],
      ]),
      totalCount: 2,
      batchSize: 10,
      isEnabled: () => true,
      commitBatch,
      onProgress: jest.fn(),
    });

    expect(result).toMatchObject({ kind: 'partial', completed: 1, total: 2 });
    expect(commitBatch).toHaveBeenCalledTimes(1);
    expect(commitBatch).toHaveBeenCalledWith('ja', ['one'], ['translated:one']);
  });
});
