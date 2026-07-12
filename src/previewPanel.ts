import * as vscode from 'vscode';
import * as path from 'path';
import { TranslationManager } from './translationManager';
import { getTargetLanguageCode } from './languages';
import { t } from './i18n';
import { isCursor } from './utils';
import { createLocalResourceRoots, createWebviewNonce, resolveMarkdownResourceUri } from './preview/webviewResources';
import { getMarkdownPreviewBodyClasses, getMarkdownPreviewStyleVars, shouldScrollEditorWithPreview, shouldScrollPreviewWithEditor } from './preview/markdownPreviewSettings';
import { buildPreviewWebviewHtml } from './preview/webviewHtml';
import { buildSourceViewModel, emptySourceViewModel } from './preview/sourceViewModel';
import { runTranslationForDocument } from './translationRunner';
import type { TranslatedMarkdownResult } from './translatedMarkdownBuilder';
import { renderMarkdownPreview } from './preview/markdownPreviewRenderer';
import type { TextMateHighlightService } from './preview/highlighting/textMateHighlightService';

function normalizeSourcePosition(value: unknown): number {
  const line = Number(value);
  return Number.isFinite(line) && line >= 0 ? line : 0;
}

function normalizeSourceAnchorLine(value: unknown): number | undefined {
  const line = Number(value);
  return Number.isFinite(line) && line >= 0 ? Math.floor(line) : undefined;
}

export class PreviewPanel {
  public static currentPanel: PreviewPanel | undefined;
  public static readonly allPanels = new Map<string, PreviewPanel>();
  public static readonly viewType = 'markdownTwinPreview';
  private static highlightService: TextMateHighlightService | undefined;

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

  public static configureHighlightService(highlightService: TextMateHighlightService): void {
    PreviewPanel.highlightService = highlightService;
  }

  public static getActivePanel(): PreviewPanel | undefined {
    if (PreviewPanel.currentPanel?._panel.active) {
      PreviewPanel.syncActiveContexts();
      return PreviewPanel.currentPanel;
    }

    const active = Array.from(PreviewPanel.allPanels.values()).find(panel => panel._panel.active);
    if (active) {
      PreviewPanel.currentPanel = active;
      PreviewPanel.syncActiveContexts();
      return active;
    }

    PreviewPanel.syncActiveContexts();
    return PreviewPanel.currentPanel;
  }

  private static syncActiveContexts(): void {
    const active = Array.from(PreviewPanel.allPanels.values()).find(panel => panel._panel.active);
    if (active) {
      PreviewPanel.currentPanel = active;
    }

    void vscode.commands.executeCommand('setContext', 'markdownTwin.previewActive', !!active);
    void vscode.commands.executeCommand('setContext', 'markdownTwin.showingSource', active?._viewMode === 'source');
  }

  public setViewMode(mode: 'preview' | 'source'): void {
    this._viewMode = mode;
    this._panel.webview.postMessage({ type: 'setViewMode', mode });
    PreviewPanel.syncActiveContexts();
    void this._update();
  }

  private static async resolveEditorForDocument(
    document: vscode.TextDocument,
    openIfNeeded = true
  ): Promise<vscode.TextEditor | undefined> {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.uri.toString() === document.uri.toString()) {
      return activeEditor;
    }

    const visibleEditor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === document.uri.toString()
    );
    if (visibleEditor) {
      return visibleEditor;
    }

    if (!openIfNeeded) {
      return undefined;
    }

    try {
      return await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: true
      });
    } catch {
      return undefined;
    }
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    translationManager: TranslationManager,
    document?: vscode.TextDocument,
    options: { avoidOpeningSource?: boolean } = {}
  ): Promise<boolean> {
    const editor = document
      ? await PreviewPanel.resolveEditorForDocument(document, !options.avoidOpeningSource)
      : vscode.window.activeTextEditor;
    const previewDocument = document ?? editor?.document;
    if (!previewDocument || previewDocument.languageId !== 'markdown') {
      vscode.window.showErrorMessage(t('noActiveEditor'));
      return false;
    }

    const code = getTargetLanguageCode();
    const uriStr = previewDocument.uri.toString();
    const panelKey = `${uriStr}@${code}`;
    const column = editor?.viewColumn ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
    const targetColumn = column ? column + 1 : vscode.ViewColumn.Two;

    const existing = PreviewPanel.allPanels.get(panelKey);
    if (existing) {
      PreviewPanel.currentPanel = existing;
      PreviewPanel.syncActiveContexts();
      if (!isCursor()) {
        existing._panel.reveal(targetColumn);
      }
      return true;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      t('previewTitle', path.basename(previewDocument.fileName)),
      targetColumn,
      {
        enableScripts: true,
        localResourceRoots: createLocalResourceRoots(extensionUri, previewDocument),
        retainContextWhenHidden: true
      }
    );

    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'flags', `${code}.svg`);

    if (!PreviewPanel.highlightService) {
      throw new Error('Preview highlighting service has not been configured');
    }

    const newPanel = new PreviewPanel(
      panel,
      extensionUri,
      previewDocument,
      editor,
      translationManager,
      PreviewPanel.highlightService,
      code
    );
    PreviewPanel.currentPanel = newPanel;
    PreviewPanel.allPanels.set(panelKey, newPanel);
    PreviewPanel.syncActiveContexts();
    return true;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    editor: vscode.TextEditor | undefined,
    private translationManager: TranslationManager,
    private readonly highlightService: TextMateHighlightService,
    langCode: string
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
        PreviewPanel.syncActiveContexts();
        if (!this._panel.active) return;
        PreviewPanel.currentPanel = this;
        if (this.translationManager.isActive()) {
          void runTranslationForDocument(this.translationManager, this._document);
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
      this.translationManager.onTranslationUpdated((updatedUri) => {
        const docUriStr = this._document.uri.toString();
        if (!updatedUri || updatedUri.toString() === docUriStr) {
          void this._update();
        }
      })
    );
  }

  private get _isSameDocAsActive(): boolean {
    return !!(
      PreviewPanel.currentPanel &&
      PreviewPanel.currentPanel.editorDocumentUri.toString() === this._document.uri.toString()
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
      this.translationManager.logError(message, error, false);
    });
  }

  private async _update() {
    const renderGeneration = ++this._renderGeneration;
    const webview = this._panel.webview;
    const document = this._document;
    const shouldRenderPreview = this._viewMode === 'preview' || !this._isInitialized;
    const shouldRenderSource = this._viewMode === 'source';
    const previewTranslated = this.translationManager.generateTranslatedMarkdown(document, this.langCode);
    const sourceTranslated = shouldRenderSource
      ? this.translationManager.generateTranslatedMarkdown(document, this.langCode, 'translation-only')
      : previewTranslated;
    const [renderedHtml, sourceView] = await Promise.all([
      shouldRenderPreview ? this.renderPreviewHtml(previewTranslated) : Promise.resolve(undefined),
      shouldRenderSource
        ? buildSourceViewModel(sourceTranslated, this.highlightService, (message, err) => {
        this.translationManager.logError(message, err, false);
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

    const uriStr = this._document.uri.toString();
    const panelKey = `${uriStr}@${this.langCode}`;
    PreviewPanel.allPanels.delete(panelKey);

    if (PreviewPanel.currentPanel === this) {
      const remaining = Array.from(PreviewPanel.allPanels.values());
      PreviewPanel.currentPanel = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
    }
    PreviewPanel.syncActiveContexts();

    if (PreviewPanel.allPanels.size === 0) {
      this.translationManager.stopTranslation();
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
