import * as path from 'path';
import * as vscode from 'vscode';
import type { IEmbeddedLanguagesMap, IGrammarConfiguration, ITokenTypeMap } from 'vscode-textmate';
import type { GrammarDefinition } from './types';

type ExtensionLike = {
  extensionPath?: string;
  extensionUri?: { fsPath: string };
  packageJSON?: {
    contributes?: {
      languages?: unknown[];
      grammars?: unknown[];
    };
  };
};

type LanguageContribution = {
  id?: unknown;
  aliases?: unknown;
};

type GrammarContribution = {
  language?: unknown;
  scopeName?: unknown;
  path?: unknown;
  injectTo?: unknown;
  embeddedLanguages?: unknown;
  tokenTypes?: unknown;
  balancedBracketScopes?: unknown;
  unbalancedBracketScopes?: unknown;
};

const TOKEN_TYPES: Record<string, number> = {
  other: 0,
  comment: 1,
  string: 2,
  regex: 3,
};

export class LanguageGrammarCatalog {
  private readonly aliases = new Map<string, string>();
  private readonly languageNumbers = new Map<string, number>();
  private readonly grammarsByLanguage = new Map<string, GrammarDefinition>();
  private readonly grammarsByScope = new Map<string, GrammarDefinition>();
  private readonly injectionsByScope = new Map<string, string[]>();
  private _revision = 0;
  private isBuilt = false;

  constructor(
    private readonly extensionsProvider: () => readonly ExtensionLike[] = () => vscode.extensions.all
  ) {}

  get revision(): number {
    this.ensureBuilt();
    return this._revision;
  }

  rebuild(): void {
    this.aliases.clear();
    this.languageNumbers.clear();
    this.grammarsByLanguage.clear();
    this.grammarsByScope.clear();
    this.injectionsByScope.clear();

    const extensions = this.extensionsProvider();
    const languageIds = new Set<string>();

    for (const extension of extensions) {
      const languages = extension.packageJSON?.contributes?.languages;
      if (!Array.isArray(languages)) continue;

      for (const rawLanguage of languages) {
        const language = rawLanguage as LanguageContribution;
        if (typeof language.id !== 'string' || !language.id) continue;

        const languageId = language.id;
        languageIds.add(languageId);
        this.registerAlias(languageId, languageId);

        if (Array.isArray(language.aliases)) {
          for (const alias of language.aliases) {
            if (typeof alias === 'string' && alias) {
              this.registerAlias(alias, languageId);
            }
          }
        }
      }
    }

    for (const extension of extensions) {
      const grammars = extension.packageJSON?.contributes?.grammars;
      if (!Array.isArray(grammars)) continue;

      for (const rawGrammar of grammars) {
        const grammar = rawGrammar as GrammarContribution;
        if (typeof grammar.scopeName !== 'string' || typeof grammar.path !== 'string') continue;

        const languageId = typeof grammar.language === 'string' ? grammar.language : undefined;
        if (languageId) {
          languageIds.add(languageId);
          this.registerAlias(languageId, languageId);
        }

        for (const embeddedLanguage of this.objectValues(grammar.embeddedLanguages)) {
          if (typeof embeddedLanguage === 'string' && embeddedLanguage) {
            languageIds.add(embeddedLanguage);
            this.registerAlias(embeddedLanguage, embeddedLanguage);
          }
        }
      }
    }

    [...languageIds]
      .sort((a, b) => a.localeCompare(b))
      .forEach((languageId, index) => this.languageNumbers.set(languageId, index + 1));

    for (const extension of extensions) {
      const grammars = extension.packageJSON?.contributes?.grammars;
      if (!Array.isArray(grammars)) continue;

      for (const rawGrammar of grammars) {
        const grammar = rawGrammar as GrammarContribution;
        if (typeof grammar.scopeName !== 'string' || typeof grammar.path !== 'string') continue;

        const languageId = typeof grammar.language === 'string' ? grammar.language : undefined;
        const definition: GrammarDefinition = {
          scopeName: grammar.scopeName,
          path: path.resolve(extension.extensionUri?.fsPath ?? extension.extensionPath ?? '', grammar.path),
          languageId,
          injectTo: this.stringArray(grammar.injectTo),
          configuration: this.createGrammarConfiguration(grammar),
        };

        this.grammarsByScope.set(definition.scopeName, definition);
        if (languageId) {
          this.grammarsByLanguage.set(languageId, definition);
        }

        for (const targetScope of definition.injectTo) {
          const injections = this.injectionsByScope.get(targetScope) ?? [];
          if (!injections.includes(definition.scopeName)) {
            injections.push(definition.scopeName);
          }
          this.injectionsByScope.set(targetScope, injections);
        }
      }
    }

    this._revision += 1;
    this.isBuilt = true;
  }

  resolveFenceLanguage(info: string | undefined): string | undefined {
    this.ensureBuilt();
    const candidate = this.normalizeFenceInfo(info);
    if (!candidate) return undefined;
    return this.aliases.get(candidate) ?? (this.grammarsByLanguage.has(candidate) ? candidate : undefined);
  }

  getGrammarForLanguage(languageId: string): GrammarDefinition | undefined {
    this.ensureBuilt();
    return this.grammarsByLanguage.get(languageId);
  }

  getGrammarForScope(scopeName: string): GrammarDefinition | undefined {
    this.ensureBuilt();
    return this.grammarsByScope.get(scopeName);
  }

  getInjections(scopeName: string): string[] {
    this.ensureBuilt();
    const parts = scopeName.split('.');
    const injections: string[] = [];
    for (let index = 1; index <= parts.length; index++) {
      for (const injection of this.injectionsByScope.get(parts.slice(0, index).join('.')) ?? []) {
        if (!injections.includes(injection)) {
          injections.push(injection);
        }
      }
    }
    return injections;
  }

  getGrammarConfiguration(definition: GrammarDefinition): IGrammarConfiguration {
    this.ensureBuilt();
    const embeddedLanguages: IEmbeddedLanguagesMap = {
      ...(definition.configuration.embeddedLanguages ?? {}),
    };
    for (const injectionScope of this.injectionsByScope.get(definition.scopeName) ?? []) {
      const injection = this.grammarsByScope.get(injectionScope);
      Object.assign(embeddedLanguages, injection?.configuration.embeddedLanguages ?? {});
    }

    return {
      ...definition.configuration,
      embeddedLanguages,
    };
  }

  getLanguageNumber(languageId: string): number {
    this.ensureBuilt();
    return this.languageNumbers.get(languageId) ?? 0;
  }

  private ensureBuilt(): void {
    if (!this.isBuilt) {
      this.rebuild();
    }
  }

  private createGrammarConfiguration(grammar: GrammarContribution): IGrammarConfiguration {
    const embeddedLanguages: IEmbeddedLanguagesMap = {};
    for (const [scope, language] of this.objectEntries(grammar.embeddedLanguages)) {
      if (typeof language !== 'string') continue;
      const numericId = this.languageNumbers.get(language) ?? 0;
      if (numericId > 0) {
        embeddedLanguages[scope] = numericId;
      }
    }

    const tokenTypes: ITokenTypeMap = {};
    for (const [selector, tokenType] of this.objectEntries(grammar.tokenTypes)) {
      if (typeof tokenType !== 'string') continue;
      const normalized = TOKEN_TYPES[tokenType.toLowerCase()];
      if (typeof normalized === 'number') {
        tokenTypes[selector] = normalized;
      }
    }

    return {
      embeddedLanguages,
      tokenTypes,
      balancedBracketSelectors: this.stringArray(grammar.balancedBracketScopes),
      unbalancedBracketSelectors: this.stringArray(grammar.unbalancedBracketScopes),
    };
  }

  private normalizeFenceInfo(info: string | undefined): string | undefined {
    const first = info?.trim().split(/\s+/, 1)[0];
    if (!first) return undefined;

    return first
      .replace(/^\{\./, '')
      .replace(/\}$/, '')
      .replace(/^\./, '')
      .toLowerCase();
  }

  private registerAlias(alias: string, languageId: string): void {
    const normalized = alias.trim().toLowerCase();
    if (normalized && !this.aliases.has(normalized)) {
      this.aliases.set(normalized, languageId);
    }
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private objectEntries(value: unknown): [string, unknown][] {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value)
      : [];
  }

  private objectValues(value: unknown): unknown[] {
    return this.objectEntries(value).map(([, entry]) => entry);
  }
}
