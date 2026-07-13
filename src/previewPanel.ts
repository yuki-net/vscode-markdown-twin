import * as vscode from 'vscode';
import * as path from 'path';
import { TranslationCoordinator } from './application/translationCoordinator';
import { createWebviewNonce, resolveMarkdownResourceUri } from './preview/webviewResources';
import { getMarkdownPreviewBodyClasses, getMarkdownPreviewStyleVars, shouldScrollEditorWithPreview, shouldScrollPreviewWithEditor } from './preview/markdownPreviewSettings';
import { buildPreviewWebviewHtml } from './preview/webviewHtml';
import { buildSourceViewModel, emptySourceViewModel } from './preview/sourceViewModel';
import type { TranslatedMarkdownResult } from './translatedMarkdownBuilder';
import { renderMarkdownPreview } from './preview/markdownPreviewRenderer';
import type { TextMateHighlightService } from './preview/highlighting/textMateHighlightService';
import type { PreviewRegistry } from './previewRegistry';

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
    this._panel.webview.postMessage({ type: 'setViewMode', mode });
    this.registry.syncActiveContexts();
    void this._update();
  }

  public constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    editor: vscode.TextEditor | undefined,
    private coordinator: TranslationCoordinator,
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
    this._registerWorkspaceListeners();
    this._registerEditorScrollSync();
    this._registerTranslationUpdates();
  }

  private _registerPanelLifecycle(): void {
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.onDidChangeViewState(
      () => {
        this.registry.syncActiveContexts();
        if (!this._panel.active) return;
        this.registry.setCurrentPanel(this);
        if (this.coordinator.isActive()) {
          void this.coordinator.run(this._document);
        } else {
          void this._update();
        }
      },
      null,
      this._disposables
    );
  }

  private _registerWebviewMessages(): void {
    this._panel.webview.onDidReceiveMessage(
      message => {
        if (message.command !== 'scroll') return;
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

  private _registerWorkspaceListeners(): void {
    vscode.workspace.onDidChangeTextDocument(
      e => {
        if (e.document.uri.toString() === this._document.uri.toString() && this._isSameDocAsActive) {
          void this._update();
        }
      },
      null,
      this._disposables
    );

    vscode.workspace.onDidChangeConfiguration(
      e => {
        if (e.affectsConfiguration('markdown.preview') && this._isSameDocAsActive) {
          this._isInitialized = false;
          void this._update();
        }
      },
      null,
      this._disposables
    );

    this.highlightService.onDidChange(
      () => {
        if (this._isSameDocAsActive) {
          void this._update();
        }
      },
      null,
      this._disposables
    );
  }

  private _registerEditorScrollSync(): void {
    vscode.window.onDidChangeTextEditorVisibleRanges(
      e => {
        if (!this._isEditorForDocument(e.textEditor) || e.visibleRanges.length === 0) return;
        if (!shouldScrollPreviewWithEditor()) return;
        if (Date.now() < this._suppressEditorScrollUntil || this._hasActiveScrollLeader('webview')) return;

        const topLine = e.visibleRanges[0].start.line;
        this._editor = e.textEditor;
        this._lastSyncedLine = topLine;
        this._setScrollLeader('editor', 180);
        void this._panel.webview.postMessage({ type: 'scroll', line: topLine, origin: 'editor' });
      },
      null,
      this._disposables
    );
  }

  private _registerTranslationUpdates(): void {
    this._disposables.push(
      this.coordinator.onDidChange((updatedUri) => {
        const docUriStr = this._document.uri.toString();
        if (!updatedUri || updatedUri.toString() === docUriStr) {
          void this._update();
        }
      })
    );
  }

  private get _isSameDocAsActive(): boolean {
    return this.registry.isCurrentDocument(this._document.uri.toString());
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
      this.coordinator.logError(message, error, false);
    });
  }

  private async _update() {
    const renderGeneration = ++this._renderGeneration;
    const webview = this._panel.webview;
    const document = this._document;
    const shouldRenderPreview = this._viewMode === 'preview' || !this._isInitialized;
    const shouldRenderSource = this._viewMode === 'source';
    const previewTranslated = this.coordinator.generateTranslatedMarkdown(document, this.langCode);
    const sourceTranslated = shouldRenderSource
      ? this.coordinator.generateTranslatedMarkdown(document, this.langCode, 'translation-only')
      : previewTranslated;
    const [renderedHtml, sourceView] = await Promise.all([
      shouldRenderPreview ? this.renderPreviewHtml(previewTranslated) : Promise.resolve(undefined),
      shouldRenderSource
        ? buildSourceViewModel(sourceTranslated, this.highlightService, (message, err) => {
        this.coordinator.logError(message, err, false);
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
        bodyClasses: getMarkdownPreviewBodyClasses(),
        htmlStyleVars: getMarkdownPreviewStyleVars(),
        cspSource: webview.cspSource,
        scriptNonce: this._scriptNonce,
        viewMode: this._viewMode
      });
      this._isInitialized = true;
    } else {
      webview.postMessage({
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

    const remaining = this.registry.unregister(this);
    if (!remaining.hasDocument) {
      this.coordinator.stopDocument(this._document.uri);
    }

    if (!remaining.hasPanels) {
      this.coordinator.stop();
      vscode.commands.executeCommand('setContext', 'markdownTwin.previewActive', false);
      vscode.commands.executeCommand('setContext', 'markdownTwin.showingSource', false);
      vscode.commands.executeCommand('setContext', 'markdownTwin.translationActive', false);
    }

    if (this._disposables.length) {
      while (this._disposables.length) {
        const x = this._disposables.pop();
        if (x) x.dispose();
      }
    }
  }
}
