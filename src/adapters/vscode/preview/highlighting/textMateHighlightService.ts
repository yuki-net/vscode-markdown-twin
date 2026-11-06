import * as fs from 'fs';
import * as vscode from 'vscode';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import {
  Registry,
  parseRawGrammar,
  type IGrammar,
  type IRawGrammar,
} from 'vscode-textmate';
import { escapeHtml } from '../../../../utils/html';
import { LanguageGrammarCatalog } from './languageGrammarCatalog';
import { TextMateThemeResolver } from './textMateThemeResolver';
import { renderTokenizedHtml } from './tokenHtmlRenderer';
import type { HighlightResult } from './types';

const MAX_RENDER_CACHE_ENTRIES = 100;

export class TextMateHighlightService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly renderedCache = new Map<string, HighlightResult>();
  private readonly grammarCache = new Map<string, Promise<IGrammar | null>>();
  private registry: Registry | undefined;
  private onigReadyPromise: Promise<void> | undefined;
  private themeRevision = 0;

  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly catalog = new LanguageGrammarCatalog(),
    private readonly themeResolver = new TextMateThemeResolver(),
    watchForChanges = true
  ) {
    if (watchForChanges) {
      this.disposables.push(
        vscode.workspace.onDidChangeConfiguration(event => {
          if (
            event.affectsConfiguration('workbench.colorTheme')
            || event.affectsConfiguration('editor.tokenColorCustomizations')
            || event.affectsConfiguration('markdownTwin.syntaxTheme')
          ) {
            this.invalidateTheme();
            this.changeEmitter.fire();
          }
        })
      );

      const onDidChangeExtensions = vscode.extensions?.onDidChange;
      if (typeof onDidChangeExtensions === 'function') {
        this.disposables.push(onDidChangeExtensions(() => {
          this.catalog.rebuild();
          this.resetRegistry();
          this.changeEmitter.fire();
        }));
      }
    }
  }

  async highlightFence(source: string, fenceInfo: string | undefined): Promise<HighlightResult> {
    const languageId = this.catalog.resolveFenceLanguage(fenceInfo);
    if (!languageId) {
      return { kind: 'unsupported', html: escapeHtml(source) };
    }
    return this.highlightLanguage(source, languageId);
  }

  async highlightLanguage(source: string, languageId: string): Promise<HighlightResult> {
    const definition = this.catalog.getGrammarForLanguage(languageId);
    if (!definition) {
      return { kind: 'unsupported', html: escapeHtml(source), languageId };
    }

    const cacheKey = `${this.themeRevision}:${this.catalog.revision}:${definition.scopeName}:${source}`;
    const cached = this.renderedCache.get(cacheKey);
    if (cached) {
      this.renderedCache.delete(cacheKey);
      this.renderedCache.set(cacheKey, cached);
      return cached;
    }

    try {
      const registry = await this.ensureRegistry();
      let grammarPromise = this.grammarCache.get(definition.scopeName);
      if (!grammarPromise) {
        grammarPromise = registry.loadGrammarWithConfiguration(
          definition.scopeName,
          this.catalog.getLanguageNumber(languageId),
          this.catalog.getGrammarConfiguration(definition)
        );
        this.grammarCache.set(definition.scopeName, grammarPromise);
      }

      const grammar = await grammarPromise;
      if (!grammar) {
        const unsupported: HighlightResult = { kind: 'unsupported', html: escapeHtml(source), languageId };
        this.cacheResult(cacheKey, unsupported);
        return unsupported;
      }

      const result: HighlightResult = {
        kind: 'highlighted',
        html: renderTokenizedHtml(grammar, source, registry.getColorMap()),
        languageId,
      };
      this.cacheResult(cacheKey, result);
      return result;
    } catch (error: unknown) {
      const result: HighlightResult = {
        kind: 'failed',
        html: escapeHtml(source),
        languageId,
        error: error instanceof Error ? error : new Error(String(error)),
      };
      this.cacheResult(cacheKey, result);
      return result;
    }
  }

  invalidateTheme(): void {
    this.themeRevision += 1;
    this.resetRegistry();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.changeEmitter.dispose();
    this.resetRegistry();
  }

  private async ensureRegistry(): Promise<Registry> {
    if (this.registry) return this.registry;

    await this.ensureOnigWasmLoaded();
    const resolvedTheme = this.themeResolver.resolveActiveTheme();
    this.registry = new Registry({
      onigLib: Promise.resolve({
        createOnigScanner: patterns => new OnigScanner(patterns),
        createOnigString: source => new OnigString(source),
      }),
      theme: resolvedTheme.theme,
      loadGrammar: async scopeName => this.loadRawGrammar(scopeName),
      getInjections: scopeName => this.catalog.getInjections(scopeName),
    });
    return this.registry;
  }

  private async ensureOnigWasmLoaded(): Promise<void> {
    if (!this.onigReadyPromise) {
      this.onigReadyPromise = (async () => {
        const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
        const wasmFile = fs.readFileSync(wasmPath);
        const wasmBytes = wasmFile.buffer.slice(
          wasmFile.byteOffset,
          wasmFile.byteOffset + wasmFile.byteLength
        );
        await loadWASM(wasmBytes);
      })();
    }
    await this.onigReadyPromise;
  }

  private async loadRawGrammar(scopeName: string): Promise<IRawGrammar | null> {
    const definition = this.catalog.getGrammarForScope(scopeName);
    if (!definition || !fs.existsSync(definition.path)) return null;
    return parseRawGrammar(fs.readFileSync(definition.path, 'utf8'), definition.path);
  }

  private cacheResult(key: string, result: HighlightResult): void {
    this.renderedCache.set(key, result);
    while (this.renderedCache.size > MAX_RENDER_CACHE_ENTRIES) {
      const oldest = this.renderedCache.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.renderedCache.delete(oldest);
    }
  }

  private resetRegistry(): void {
    this.registry?.dispose();
    this.registry = undefined;
    this.grammarCache.clear();
    this.renderedCache.clear();
  }
}
