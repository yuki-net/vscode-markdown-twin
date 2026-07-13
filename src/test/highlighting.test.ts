import * as path from 'path';
import { LanguageGrammarCatalog } from '../adapters/vscode/preview/highlighting/languageGrammarCatalog';
import { TextMateHighlightService } from '../adapters/vscode/preview/highlighting/textMateHighlightService';
import { TextMateThemeResolver } from '../adapters/vscode/preview/highlighting/textMateThemeResolver';

const fixtureRoot = path.join(__dirname, 'fixtures', 'highlighting');

function createFixtureExtension() {
  return {
    extensionPath: fixtureRoot,
    extensionUri: { fsPath: fixtureRoot },
    packageJSON: {
      contributes: {
        languages: [
          { id: 'simple', aliases: ['Simple', 'smp'] },
          { id: 'embedded', aliases: ['Embedded'] },
        ],
        grammars: [
          {
            language: 'simple',
            scopeName: 'source.simple',
            path: './simple.tmLanguage.json',
            embeddedLanguages: {
              'meta.embedded.simple': 'embedded',
            },
            tokenTypes: {
              'string.quoted.double.simple': 'string',
            },
          },
          {
            scopeName: 'comment.todo.injection',
            path: './injection.tmLanguage.json',
            injectTo: ['source.simple'],
          },
        ],
        themes: [
          {
            id: 'Fixture Theme',
            label: 'Fixture Theme',
            path: './child-theme.json',
          },
          {
            id: 'External Theme',
            label: 'External Theme',
            path: './external-theme.json',
          },
        ],
      },
    },
  };
}

describe('LanguageGrammarCatalog', () => {
  it('defers extension scanning until highlighting needs the catalog', () => {
    const extensionsProvider = jest.fn(() => [createFixtureExtension()]);

    const catalog = new LanguageGrammarCatalog(extensionsProvider);

    expect(extensionsProvider).not.toHaveBeenCalled();
    expect(catalog.resolveFenceLanguage('simple')).toBe('simple');
    expect(extensionsProvider).toHaveBeenCalledTimes(1);
  });

  it('resolves aliases and preserves grammar contribution metadata', () => {
    const catalog = new LanguageGrammarCatalog(() => [createFixtureExtension()]);

    expect(catalog.resolveFenceLanguage('SMP title="example"')).toBe('simple');
    expect(catalog.resolveFenceLanguage('{.simple}')).toBe('simple');
    expect(catalog.resolveFenceLanguage('unknown')).toBeUndefined();

    const grammar = catalog.getGrammarForLanguage('simple');
    expect(grammar?.scopeName).toBe('source.simple');
    expect(catalog.getInjections('source.simple')).toEqual(['comment.todo.injection']);
    expect(catalog.getGrammarConfiguration(grammar!).embeddedLanguages).toEqual({
      'meta.embedded.simple': catalog.getLanguageNumber('embedded'),
    });
    expect(catalog.getGrammarConfiguration(grammar!).tokenTypes).toEqual({
      'string.quoted.double.simple': 2,
    });
  });
});

describe('TextMateThemeResolver', () => {
  it('parses inherited JSONC themes and applies active-theme customizations', () => {
    const resolver = new TextMateThemeResolver(
      () => [createFixtureExtension()],
      () => 'Fixture Theme',
      () => ({
        comments: '#123456',
        '[Fixture*]': {
          textMateRules: [
            {
              scope: 'keyword.control.simple',
              settings: { foreground: '#abcdef' },
            },
          ],
        },
      })
    );

    const resolved = resolver.resolveActiveTheme();
    const rules = resolved.theme.settings ?? [];

    expect(resolved.id).toBe('Fixture Theme');
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'keyword.control.simple', settings: { foreground: '#ff0000' } }),
      expect.objectContaining({ scope: 'string.quoted.double.simple', settings: { foreground: '#00ff00' } }),
      expect.objectContaining({ scope: 'keyword.todo.simple' }),
      expect.objectContaining({
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: '#123456' },
      }),
      expect.objectContaining({ scope: 'keyword.control.simple', settings: { foreground: '#abcdef' } }),
    ]));
  });

  it('loads external tmTheme token colors referenced by a JSON theme', () => {
    const resolver = new TextMateThemeResolver(
      () => [createFixtureExtension()],
      () => 'External Theme',
      () => ({})
    );

    expect(resolver.resolveActiveTheme().theme.settings).toContainEqual({
      scope: 'constant.numeric.simple',
      settings: { foreground: '#112233' },
    });
  });
});

describe('TextMateHighlightService', () => {
  it('uses contributed grammars and the active TextMate theme', async () => {
    const extension = createFixtureExtension();
    const catalog = new LanguageGrammarCatalog(() => [extension]);
    const themeResolver = new TextMateThemeResolver(
      () => [extension],
      () => 'Fixture Theme',
      () => ({})
    );
    const service = new TextMateHighlightService(catalog, themeResolver, false);

    try {
      const result = await service.highlightFence('const value = "<tag>";\nTODO', 'smp');

      expect(result.kind).toBe('highlighted');
      expect(result.html).toContain('color:#FF0000');
      expect(result.html).toContain('color:#00FF00');
      expect(result.html).toContain('color:#FFFF00;background-color:#333333;font-weight:700');
      expect(result.html).toContain('&lt;tag&gt;');
    } finally {
      service.dispose();
    }
  });

  it('falls back to escaped plain text for unsupported fences', async () => {
    const extension = createFixtureExtension();
    const service = new TextMateHighlightService(
      new LanguageGrammarCatalog(() => [extension]),
      new TextMateThemeResolver(() => [extension], () => 'Fixture Theme', () => ({})),
      false
    );

    try {
      const result = await service.highlightFence('<script>', 'unknown');
      expect(result).toEqual({ kind: 'unsupported', html: '&lt;script&gt;' });
    } finally {
      service.dispose();
    }
  });

  it('rebuilds the TextMate registry after theme invalidation', async () => {
    const extension = createFixtureExtension();
    let keywordColor = '#111111';
    const service = new TextMateHighlightService(
      new LanguageGrammarCatalog(() => [extension]),
      new TextMateThemeResolver(
        () => [extension],
        () => 'Fixture Theme',
        () => ({
          textMateRules: [
            {
              scope: 'keyword.control.simple',
              settings: { foreground: keywordColor },
            },
          ],
        })
      ),
      false
    );

    try {
      const before = await service.highlightFence('const value = 1;', 'simple');
      keywordColor = '#222222';
      service.invalidateTheme();
      const after = await service.highlightFence('const value = 1;', 'simple');

      expect(before.html).toContain('color:#111111');
      expect(after.html).toContain('color:#222222');
      expect(after.html).not.toEqual(before.html);
    } finally {
      service.dispose();
    }
  });
});
