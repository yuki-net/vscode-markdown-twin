import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parse, type ParseError } from 'jsonc-parser';
import { parse as parsePlist } from 'plist';
import type { IRawTheme } from 'vscode-textmate';
import type { ResolvedTextMateTheme } from './types';

type ThemeRule = {
  scope?: string | string[];
  settings?: Record<string, unknown>;
};

type ExtensionLike = {
  id?: string;
  extensionPath?: string;
  extensionUri?: { fsPath: string };
  packageJSON?: {
    name?: string;
    contributes?: {
      themes?: unknown[];
    };
  };
};

type ThemeContribution = {
  id?: unknown;
  label?: unknown;
  uiTheme?: unknown;
  path?: unknown;
};

/** Numeric values mirror vscode.ColorThemeKind without importing the runtime enum. */
const COLOR_THEME_KIND = {
  light: 1,
  dark: 2,
  highContrast: 3,
  highContrastLight: 4,
} as const;

const BUILTIN_THEME_IDS: Record<number, string[]> = {
  [COLOR_THEME_KIND.light]: ['Light Modern', 'Default Light Modern', 'Light+', 'Default Light+'],
  [COLOR_THEME_KIND.dark]: ['Dark Modern', 'Default Dark Modern', 'Dark+', 'Default Dark+'],
  [COLOR_THEME_KIND.highContrast]: ['Default High Contrast', 'High Contrast'],
  [COLOR_THEME_KIND.highContrastLight]: ['Default High Contrast Light', 'High Contrast Light'],
};

const BUILTIN_UI_THEME: Record<number, string> = {
  [COLOR_THEME_KIND.light]: 'vs',
  [COLOR_THEME_KIND.dark]: 'vs-dark',
  [COLOR_THEME_KIND.highContrast]: 'hc-black',
  [COLOR_THEME_KIND.highContrastLight]: 'hc-light',
};

const CUSTOM_TOKEN_SCOPES: Record<string, string[]> = {
  comments: ['comment', 'punctuation.definition.comment'],
  strings: ['string', 'meta.embedded.assembly'],
  numbers: ['constant.numeric'],
  keywords: ['keyword - keyword.operator', 'keyword.control', 'storage', 'storage.type'],
  types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  functions: ['entity.name.function', 'support.function'],
  variables: ['variable', 'entity.name.variable'],
};

export class TextMateThemeResolver {
  constructor(
    private readonly extensionsProvider: () => readonly ExtensionLike[] = () => vscode.extensions.all,
    private readonly activeThemeProvider: () => string = () =>
      vscode.workspace.getConfiguration('workbench').get<string>('colorTheme') ?? '',
    private readonly tokenCustomizationsProvider: () => unknown = () =>
      vscode.workspace.getConfiguration('editor').get<unknown>('tokenColorCustomizations'),
    private readonly syntaxThemeModeProvider: () => string = () =>
      vscode.workspace.getConfiguration('markdownTwin').get<string>('syntaxTheme') ?? 'active',
    private readonly colorThemeKindProvider: () => number = () =>
      vscode.window.activeColorTheme.kind
  ) {}

  resolveActiveTheme(): ResolvedTextMateTheme {
    if (this.resolveMode() === 'builtin') {
      const builtin = this.resolveBuiltinTheme();
      if (builtin) return builtin;
    }

    return this.resolveThemeFromActiveSettings();
  }

  private resolveMode(): 'active' | 'builtin' {
    return this.syntaxThemeModeProvider().trim().toLowerCase() === 'builtin' ? 'builtin' : 'active';
  }

  private resolveThemeFromActiveSettings(): ResolvedTextMateTheme {
    const themeId = this.activeThemeProvider();
    const rules: ThemeRule[] = [];
    const themePath = this.resolveThemeFilePath(themeId);
    if (themePath) {
      rules.push(...this.readThemeRules(themePath));
    }
    rules.push(...this.readCustomizedTokenRules(themeId));

    return this.createResolvedTheme(themeId, rules);
  }

  private resolveBuiltinTheme(): ResolvedTextMateTheme | undefined {
    const kind = this.colorThemeKindProvider();
    const builtin = this.findBuiltinTheme(kind);
    if (!builtin) return undefined;

    return this.createResolvedTheme(builtin.id, this.readThemeRules(builtin.path));
  }

  private createResolvedTheme(id: string, rules: ThemeRule[]): ResolvedTextMateTheme {
    const theme: IRawTheme = {
      name: `markdown-twin-${id || 'default'}`,
      settings: rules.map(rule => ({
        scope: rule.scope,
        settings: rule.settings ?? {},
      })),
    };

    return { id, theme };
  }

  private findBuiltinTheme(kind: number): { id: string; path: string } | undefined {
    const candidates = BUILTIN_THEME_IDS[kind] ?? BUILTIN_THEME_IDS[COLOR_THEME_KIND.dark];
    for (const candidate of candidates) {
      const match = this.findThemeContribution(candidate);
      if (match) return match;
    }

    const uiTheme = BUILTIN_UI_THEME[kind];
    if (!uiTheme) return undefined;

    for (const extension of this.extensionsProvider()) {
      if (!this.isThemeDefaultsExtension(extension)) continue;
      for (const theme of this.themeContributions(extension)) {
        if (theme.uiTheme !== uiTheme || typeof theme.path !== 'string') continue;
        const id = typeof theme.id === 'string'
          ? theme.id
          : typeof theme.label === 'string' ? theme.label : 'builtin';
        return {
          id,
          path: path.resolve(this.extensionRoot(extension), theme.path),
        };
      }
    }

    return undefined;
  }

  private findThemeContribution(themeId: string): { id: string; path: string } | undefined {
    for (const extension of this.extensionsProvider()) {
      const hit = this.themeContributions(extension)
        .find(theme => theme.id === themeId || theme.label === themeId);
      if (!hit || typeof hit.path !== 'string') continue;

      return {
        id: typeof hit.id === 'string' ? hit.id : themeId,
        path: path.resolve(this.extensionRoot(extension), hit.path),
      };
    }
    return undefined;
  }

  private resolveThemeFilePath(themeId: string): string | undefined {
    return this.findThemeContribution(themeId)?.path;
  }

  private themeContributions(extension: ExtensionLike): ThemeContribution[] {
    const themes = extension.packageJSON?.contributes?.themes;
    return Array.isArray(themes) ? themes.map(theme => theme as ThemeContribution) : [];
  }

  private isThemeDefaultsExtension(extension: ExtensionLike): boolean {
    return extension.id === 'vscode.theme-defaults' || extension.packageJSON?.name === 'theme-defaults';
  }

  private extensionRoot(extension: ExtensionLike): string {
    return extension.extensionUri?.fsPath ?? extension.extensionPath ?? '';
  }

  private readThemeRules(themePath: string, visited = new Set<string>()): ThemeRule[] {
    const resolvedPath = path.resolve(themePath);
    if (visited.has(resolvedPath) || !fs.existsSync(resolvedPath)) return [];
    visited.add(resolvedPath);

    if (path.extname(resolvedPath).toLowerCase() !== '.json') {
      return this.readPlistThemeRules(resolvedPath);
    }

    const theme = this.readJsoncFile(resolvedPath);
    if (!theme || typeof theme !== 'object') return [];

    const value = theme as Record<string, unknown>;
    const inherited = typeof value.include === 'string'
      ? this.readThemeRules(path.resolve(path.dirname(resolvedPath), value.include), visited)
      : [];
    const legacyRules = Array.isArray(value.settings)
      ? value.settings.filter(this.isThemeRule)
      : [];
    let ownRules: ThemeRule[] = [];
    if (Array.isArray(value.tokenColors)) {
      ownRules = value.tokenColors.filter(this.isThemeRule);
    } else if (typeof value.tokenColors === 'string') {
      ownRules = this.readThemeRules(path.resolve(path.dirname(resolvedPath), value.tokenColors), visited);
    }

    return [...inherited, ...legacyRules, ...ownRules];
  }

  private readCustomizedTokenRules(themeId: string): ThemeRule[] {
    const custom = this.tokenCustomizationsProvider();
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return [];

    const root = custom as Record<string, unknown>;
    const sections: Record<string, unknown>[] = [root];
    for (const [selector, value] of Object.entries(root)) {
      if (this.themeSelectorMatches(selector, themeId) && value && typeof value === 'object' && !Array.isArray(value)) {
        sections.push(value as Record<string, unknown>);
      }
    }

    return sections.flatMap(section => this.rulesFromCustomizationSection(section));
  }

  private rulesFromCustomizationSection(section: Record<string, unknown>): ThemeRule[] {
    const rules: ThemeRule[] = [];

    for (const [key, scopes] of Object.entries(CUSTOM_TOKEN_SCOPES)) {
      const customization = section[key];
      if (typeof customization === 'string') {
        rules.push({ scope: scopes, settings: { foreground: customization } });
      } else if (customization && typeof customization === 'object' && !Array.isArray(customization)) {
        rules.push({ scope: scopes, settings: customization as Record<string, unknown> });
      }
    }

    if (Array.isArray(section.textMateRules)) {
      rules.push(...section.textMateRules.filter(this.isThemeRule));
    }

    return rules;
  }

  private themeSelectorMatches(selector: string, themeId: string): boolean {
    if (!selector.startsWith('[') || !selector.endsWith(']')) return false;
    const names = selector.match(/\[([^\]]+)\]/g)?.map(name => name.slice(1, -1)) ?? [];
    return names.some(name => {
      if (name === themeId) return true;
      const startsWildcard = name.startsWith('*');
      const endsWildcard = name.endsWith('*');
      const candidate = name.slice(startsWildcard ? 1 : 0, endsWildcard ? -1 : undefined);
      if (startsWildcard && endsWildcard) return themeId.includes(candidate);
      if (startsWildcard) return themeId.endsWith(candidate);
      if (endsWildcard) return themeId.startsWith(candidate);
      return false;
    });
  }

  private readJsoncFile(filePath: string): unknown {
    try {
      const errors: ParseError[] = [];
      const value = parse(fs.readFileSync(filePath, 'utf8'), errors, {
        allowTrailingComma: true,
        disallowComments: false,
      });
      return errors.length === 0 ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private readPlistThemeRules(filePath: string): ThemeRule[] {
    try {
      const value = parsePlist(fs.readFileSync(filePath, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const settings = (value as Record<string, unknown>).settings;
      return Array.isArray(settings) ? settings.filter(this.isThemeRule) : [];
    } catch {
      return [];
    }
  }

  private isThemeRule(value: unknown): value is ThemeRule {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
}
