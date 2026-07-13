import * as vscode from 'vscode';
import { getLanguageDisplayCode, normalizeTargetLanguageCode } from './languages';
import { PROVIDER_DISPLAY_NAMES, normalizeProviderId } from './providers/ITranslationProvider';
import { t } from './i18n';

type TranslationMode = 'translation-only' | 'bilingual';

interface DocumentProgress {
  uri: vscode.Uri;
  label: string;
  providerName: string;
  done: number;
  total: number;
}

interface CompletedDocument {
  uri: vscode.Uri;
  mode: TranslationMode;
  providerName: string;
}

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private activeProviderId: string | null = null;
  private readonly progressByDocument = new Map<string, DocumentProgress>();
  private lastCompleted: CompletedDocument | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'markdownTwin.selectProvider';
  }

  setActiveProvider(providerId: string | null): void {
    this.activeProviderId = providerId;
  }

  private resolveProviderName(): string {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    if (this.activeProviderId) {
      const id = normalizeProviderId(this.activeProviderId);
      return PROVIDER_DISPLAY_NAMES[id];
    }

    const id = normalizeProviderId(config.get<string>('provider'));
    return PROVIDER_DISPLAY_NAMES[id];
  }

  showProgress(
    documentUri: vscode.Uri,
    providerName: string,
    done: number,
    total: number
  ): void {
    const uriStr = documentUri.toString();
    this.progressByDocument.set(uriStr, {
      uri: documentUri,
      label: this.documentLabel(documentUri),
      providerName,
      done,
      total,
    });
    if (this.lastCompleted?.uri.toString() === uriStr) {
      this.lastCompleted = undefined;
    }
    this.renderProgress();
  }

  showComplete(
    documentUri: vscode.Uri,
    mode: TranslationMode,
    providerName: string
  ): void {
    this.progressByDocument.delete(documentUri.toString());
    this.lastCompleted = {
      uri: documentUri,
      mode,
      providerName,
    };
    if (this.progressByDocument.size > 0) {
      this.renderProgress();
      return;
    }
    this.renderComplete(this.lastCompleted);
  }

  private renderComplete(completed: CompletedDocument): void {
    const { mode, providerName } = completed;
    const targetCode = this.selectedTargetCode();
    const icon = mode === 'bilingual' ? '$(split-horizontal)' : '$(globe)';
    this.item.text = `${icon} Twin ${providerName} (${targetCode})`;

    const modeLabel = mode === 'bilingual' ? t('bilingual') : t('translationOnly');
    this.item.tooltip = t('statusCompleteTooltip', modeLabel, providerName, targetCode);
    this.item.show();
  }

  showOffline(): void {
    this.progressByDocument.clear();
    this.lastCompleted = undefined;
    const targetCode = this.selectedTargetCode();
    const providerName = this.resolveProviderName();
    this.item.text = `$(globe) Twin: ${providerName} (${targetCode})`;
    this.item.tooltip = t('statusOfflineTooltip', providerName);
    this.item.show();
  }

  update(mode: TranslationMode): void {
    if (!this.lastCompleted || this.progressByDocument.size > 0) return;
    this.lastCompleted.mode = mode;
    this.renderComplete(this.lastCompleted);
  }

  showError(documentUri?: vscode.Uri): void {
    if (documentUri) {
      this.progressByDocument.delete(documentUri.toString());
      if (this.progressByDocument.size > 0) {
        this.renderProgress();
        return;
      }
    }
    const providerName = this.resolveProviderName();
    this.item.text = t('statusErrorText', providerName);
    this.item.tooltip = t('statusErrorTooltip');
    this.item.show();
  }

  removeDocument(documentUri: vscode.Uri): void {
    const uriStr = documentUri.toString();
    this.progressByDocument.delete(uriStr);
    if (this.lastCompleted?.uri.toString() === uriStr) {
      this.lastCompleted = undefined;
    }
    if (this.progressByDocument.size > 0) {
      this.renderProgress();
    }
  }

  private renderProgress(): void {
    const entries = Array.from(this.progressByDocument.values());
    if (entries.length === 0) return;
    const targetCode = this.selectedTargetCode();

    if (entries.length === 1) {
      const entry = entries[0];
      const pct = this.percentage(entry.done, entry.total);
      this.item.text = `$(sync~spin) Twin ${entry.providerName} ${pct}% (${targetCode})`;
      this.item.tooltip = t('translatingTooltip', entry.done, entry.total);
      this.item.show();
      return;
    }

    const done = entries.reduce((sum, entry) => sum + entry.done, 0);
    const total = entries.reduce((sum, entry) => sum + entry.total, 0);
    const pct = this.percentage(done, total);
    this.item.text = `$(sync~spin) ${t('translatingMultipleText', entries.length, pct)}`;
    this.item.tooltip = [
      t('translatingMultipleTooltip', done, total),
      ...entries.map(entry => t(
        'translatingFileTooltip',
        entry.label,
        entry.providerName,
        targetCode,
        this.percentage(entry.done, entry.total),
        entry.done,
        entry.total
      )),
    ].join('\n');
    this.item.show();
  }

  private percentage(done: number, total: number): number {
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  private selectedTargetCode(): string {
    const config = vscode.workspace.getConfiguration('markdownTwin');
    const targetLang = normalizeTargetLanguageCode(config.get<string>('targetLanguage'));
    return getLanguageDisplayCode(targetLang);
  }

  private documentLabel(uri: vscode.Uri): string {
    const path = uri.path || uri.fsPath || uri.toString();
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return slash >= 0 ? path.slice(slash + 1) : path;
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.progressByDocument.clear();
    this.item.dispose();
  }
}
