import * as vscode from 'vscode';
import * as path from 'path';
import type { PreviewController } from './previewController';
import { createWebviewNonce, resolveMarkdownResourceUri } from './webviewResources';
import { getMarkdownPreviewBodyClasses, getMarkdownPreviewStyleVars, shouldScrollEditorWithPreview, shouldScrollPreviewWithEditor } from './markdownPreviewSettings';
import { buildPreviewWebviewHtml } from './webviewHtml';
import { buildSourceViewModel, emptySourceViewModel } from './sourceViewModel';
import type { TranslatedMarkdownResult } from '../../../domain/translationResult';
import { renderMarkdownPreview } from './previewRenderer';
import type { TextMateHighlightService } from './highlighting/textMateHighlightService';
import type { PreviewRegistry } from './previewRegistry';
import {
  isPreviewWebviewMessage,
  type ExtensionToPreviewMessage,
} from '../../../webview/protocol';

function normalizeSourcePosition(value: unknown): number {
  const line = Number(value);
  return Number.isFinite(line) && line >= 0 ? line : 0;
}

function normalizeSourceAnchorLine(value: unknown): number | undefined {
  const line = Number(value);
  return Number.isFinite(line) && line >= 0 ? Math.floor(line) : undefined;
}

export class PreviewPanel {
  public static readonly viewType = 'markdownTwinPreview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _editor: vscode.TextEditor | undefined;
  private readonly _document: vscode.TextDocument;
  private _isInitialized = false;
  private _isDisposed = false;
  private _renderGeneration = 0;
  private readonly _scriptNonce = createWebviewNonce();
  public readonly langCode: string;
  private _viewMode: 'preview' | 'source' = 'preview';
  private _scrollLeader: 'editor' | 'webview' | null = null;
  private _scrollLeaderUntil = 0;
  private _suppressEditorScrollUntil = 0;
  private _lastSyncedLine = 0;

  public get editorDocumentUri(): vscode.Uri {
    return this._document.uri;
  }

  public get editorDocument(): vscode.TextDocument {
    return this._document;
  }

  public get isActive(): boolean {
    return this._panel.active;
  }

  public get viewMode(): 'preview' | 'source' {
    return this._viewMode;
  }

  public reveal(column: vscode.ViewColumn): void {
    this._panel.reveal(column);
  }

  public setViewMode(mode: 'preview' | 'source'): void {
    this._viewMode = mode;
    this._postMessage({ type: 'setViewMode', mode });
    this.registry.syncActiveContexts();
    void this._update();
  }

  public constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    editor: vscode.TextEditor | undefined,
    private controller: PreviewController,
    private readonly highlightService: TextMateHighlightService,
    langCode: string,
    private readonly registry: PreviewRegistry
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._document = document;
    this._editor = editor;
    this._lastSyncedLine = editor?.visibleRanges[0]?.start.line ?? 0;
    this.langCode = langCode;

    void this._update();
    this._registerPanelLifecycle();
    this._registerWebviewMessages();
    this._registerTranslationUpdates();
  }

  private _registerPanelLifecycle(): void {
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.onDidChangeViewState(
      () => {
        this.registry.syncActiveContexts();
        if (!this._panel.active) return;
        this.controller.panelActivated(this);
      },
      null,
      this._disposables
    );
  }

  private _registerWebviewMessages(): void {
    this._panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (!isPreviewWebviewMessage(message)) return;
        if (!shouldScrollEditorWithPreview()) return;

        this._lastSyncedLine = normalizeSourcePosition(message.line);
        const revealLine = message.mode === 'source'
          ? normalizeSourceAnchorLine(message.anchorLine) ?? this._lastSyncedLine
          : this._lastSyncedLine;
        this._setScrollLeader('webview');
        this._suppressEditorScrollUntil = Date.now() + 220;
        this._handleScrollMessage(revealLine, message.mode === 'source');
      },
      null,
      this._disposables
    );
  }

  private _registerTranslationUpdates(): void {
    this._disposables.push(
      this.controller.onDidChange((updatedUri) => {
        const docUriStr = this._document.uri.toString();
        if (!updatedUri || updatedUri.toString() === docUriStr) {
          void this._update();
        }
      })
    );
  }

  private _setScrollLeader(leader: 'editor' | 'webview', durationMs = 220): void {
    this._scrollLeader = leader;
    this._scrollLeaderUntil = Date.now() + durationMs;
  }

  private _hasActiveScrollLeader(leader: 'editor' | 'webview'): boolean {
    return this._scrollLeader === leader && Date.now() < this._scrollLeaderUntil;
  }

  private _isEditorForDocument(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
    return !!editor && editor.document.uri.toString() === this._document.uri.toString();
  }

  private _handleScrollMessage(line: number, revealLogicalLine = false) {
    const visibleEditor = vscode.window.visibleTextEditors.find(editor => this._isEditorForDocument(editor));
    if (visibleEditor) {
      this._editor = visibleEditor;
    }
    const range = revealLogicalLine ? this._toLogicalLineRevealRange(line) : this._toRevealRange(line);
    this._editor?.revealRange(range, vscode.TextEditorRevealType.AtTop);
  }

  private _toLogicalLineRevealRange(line: number): vscode.Range {
    const lineCount = this._document.lineCount;
    const sourceLine = Math.max(0, Math.min(Math.floor(line), lineCount - 1));
    return new vscode.Range(sourceLine, 0, sourceLine, 0);
  }

  private _toRevealRange(line: number): vscode.Range {
    const lineCount = this._document.lineCount;
    const sourceLine = Math.max(0, Math.min(Math.floor(line), lineCount - 1));
    const lineText = this._document.lineAt(sourceLine).text;
    const fraction = Math.max(0, Math.min(1, line - sourceLine));
    const startCharacter = Math.floor(fraction * lineText.length);
    const endLine = Math.min(sourceLine + 1, lineCount - 1);
    const endCharacter = endLine === sourceLine ? lineText.length : 0;

    return new vscode.Range(sourceLine, startCharacter, endLine, endCharacter);
  }

  private async renderPreviewHtml(translated: TranslatedMarkdownResult): Promise<string> {
    const webview = this._panel.webview;
    const document = this._document;
    const previewConfig = vscode.workspace.getConfiguration('markdown.preview');
    return renderMarkdownPreview(translated, {
      breaks: previewConfig.get<boolean>('breaks'),
      linkify: previewConfig.get<boolean>('linkify'),
      mapSourceLine: line => translated.lineOrigins[line] ?? line,
      resolveResourceUri: href => resolveMarkdownResourceUri(href, document, webview),
      typographer: previewConfig.get<boolean>('typographer'),
      uriScheme: vscode.env.uriScheme,
    }, this.highlightService, (message, error) => {
      this.controller.logError(message, error, false);
    });
  }

  private async _update() {
    const renderGeneration = ++this._renderGeneration;
    const webview = this._panel.webview;
    const document = this._document;
    const shouldRenderPreview = this._viewMode === 'preview' || !this._isInitialized;
    const shouldRenderSource = this._viewMode === 'source';
    const previewTranslated = this.controller.generate(document, this.langCode);
    const sourceTranslated = shouldRenderSource
      ? this.controller.generate(document, this.langCode, 'translation-only')
      : previewTranslated;
    const [renderedHtml, sourceView] = await Promise.all([
      shouldRenderPreview ? this.renderPreviewHtml(previewTranslated) : Promise.resolve(undefined),
      shouldRenderSource
        ? buildSourceViewModel(sourceTranslated, this.highlightService, (message, err) => {
        this.controller.logError(message, err, false);
      })
        : Promise.resolve(emptySourceViewModel(sourceTranslated)),
    ]);

    if (this._isDisposed || renderGeneration !== this._renderGeneration) {
      return;
    }

    const sourceHighlightError = sourceView.sourceHighlightError;

    if (!this._isInitialized) {
      const twinCssUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(this._extensionUri.fsPath, 'media', 'markdown-twin.css'))
      );
      const markdownCssUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(this._extensionUri.fsPath, 'media', 'markdown.css'))
      );
      const webviewScriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(this._extensionUri.fsPath, 'dist', 'webview.js'))
      );
      webview.html = buildPreviewWebviewHtml({
        previewHeaderTitle: `Twin Preview ${path.basename(document.fileName)}`,
        renderedHtml: renderedHtml ?? '',
        highlightedSource: sourceView.highlightedSource,
        sourceText: sourceView.sourceText,
        sourceLineCount: sourceView.sourceLineCount,
        sourceLineOrigins: sourceView.sourceLineOrigins,
        sourceLineHeight: sourceView.sourceLineHeight,
        initialScrollLine: this._lastSyncedLine,
        sourceHighlightError,
        markdownCssUri,
        twinCssUri,
        webviewScriptUri,
        bodyClasses: getMarkdownPreviewBodyClasses(),
        htmlStyleVars: getMarkdownPreviewStyleVars(),
        cspSource: webview.cspSource,
        scriptNonce: this._scriptNonce,
        viewMode: this._viewMode
      });
      this._isInitialized = true;
    } else {
      this._postMessage({
        type: 'update',
        html: renderedHtml,
        sourceHtml: shouldRenderSource ? sourceView.highlightedSource : undefined,
        sourceText: shouldRenderSource ? sourceView.sourceText : undefined,
        sourceLineCount: shouldRenderSource ? sourceView.sourceLineCount : undefined,
        sourceLineOrigins: shouldRenderSource ? sourceView.sourceLineOrigins : undefined,
        sourceLineHeight: shouldRenderSource ? sourceView.sourceLineHeight : undefined,
        scrollLine: this._lastSyncedLine,
        sourceHighlightError
      });
    }
  }

  public dispose() {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this.controller.panelDisposed(this);

    if (this._disposables.length) {
      while (this._disposables.length) {
        const x = this._disposables.pop();
        if (x) x.dispose();
      }
    }
  }

  public refresh(): void {
    void this._update();
  }

  public resetRender(): void {
    this._isInitialized = false;
    void this._update();
  }

  public syncEditorScroll(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (!this._isEditorForDocument(event.textEditor) || event.visibleRanges.length === 0) return;
    if (!shouldScrollPreviewWithEditor()) return;
    if (Date.now() < this._suppressEditorScrollUntil || this._hasActiveScrollLeader('webview')) return;

    const topLine = event.visibleRanges[0].start.line;
    this._editor = event.textEditor;
    this._lastSyncedLine = topLine;
    this._setScrollLeader('editor', 180);
    this._postMessage({ type: 'scroll', line: topLine, origin: 'editor' });
  }

  private _postMessage(message: ExtensionToPreviewMessage): void {
    void this._panel.webview.postMessage(message);
  }
}
