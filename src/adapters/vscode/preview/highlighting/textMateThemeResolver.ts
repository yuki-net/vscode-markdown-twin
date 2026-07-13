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
  extensionPath?: string;
  extensionUri?: { fsPath: string };
  packageJSON?: {
    contributes?: {
      themes?: unknown[];
    };
  };
};

type ThemeContribution = {
  id?: unknown;
  label?: unknown;
  path?: unknown;
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
      vscode.workspace.getConfiguration('editor').get<unknown>('tokenColorCustomizations')
  ) {}

  resolveActiveTheme(): ResolvedTextMateTheme {
    const themeId = this.activeThemeProvider();
    const rules: ThemeRule[] = [];
    const themePath = this.resolveThemeFilePath(themeId);
    if (themePath) {
      rules.push(...this.readThemeRules(themePath));
    }
    rules.push(...this.readCustomizedTokenRules(themeId));

    const theme: IRawTheme = {
      name: `markdown-twin-${themeId || 'default'}`,
      settings: rules.map(rule => ({
        scope: rule.scope,
        settings: rule.settings ?? {},
      })),
    };

    return { id: themeId, theme };
  }

  private resolveThemeFilePath(themeId: string): string | undefined {
    for (const extension of this.extensionsProvider()) {
      const themes = extension.packageJSON?.contributes?.themes;
      if (!Array.isArray(themes)) continue;

      const hit = themes
        .map(theme => theme as ThemeContribution)
        .find(theme => theme.id === themeId || theme.label === themeId);
      if (typeof hit?.path !== 'string') continue;

      return path.resolve(extension.extensionUri?.fsPath ?? extension.extensionPath ?? '', hit.path);
    }
    return undefined;
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
