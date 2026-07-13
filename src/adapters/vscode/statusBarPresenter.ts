import * as vscode from 'vscode';
import { getLanguageDisplayCode, normalizeTargetLanguageCode } from '../../languages';
import { normalizeProviderId } from '../../domain/provider';
import { PROVIDER_DEFINITIONS } from '../providers/providerRegistry';
import { t } from '../../i18n';
import type { TranslationSettingsRepository } from '../../ports/settingsRepository';

type TranslationMode = 'translation-only' | 'bilingual';

interface DocumentProgress {
  kind: 'progress';
  documentId: string;
  label: string;
  providerName: string;
  done: number;
  total: number;
  targetLanguages: readonly string[];
}

interface CompletedDocument {
  kind: 'complete';
  documentId: string;
  mode: TranslationMode;
  providerName: string;
  order: number;
  targetLanguages: readonly string[];
}

interface DocumentError {
  kind: 'error';
  documentId: string;
  providerName: string;
  order: number;
}

type DocumentStatus = DocumentProgress | CompletedDocument | DocumentError;

export class StatusBarPresenter implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private activeProviderId: string | null = null;
  private readonly statusByDocument = new Map<string, DocumentStatus>();
  private nextOrder = 0;

  constructor(private readonly settings: TranslationSettingsRepository) {
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
    if (this.activeProviderId) {
      const id = normalizeProviderId(this.activeProviderId);
      return this.providerName(id);
    }

    const id = normalizeProviderId(this.settings.get().providerId);
    return this.providerName(id);
  }

  showProgress(
    documentUri: string | vscode.Uri,
    providerName: string,
    done: number,
    total: number,
    targetLanguages: readonly string[] = [this.settings.get().targetLanguage]
  ): void {
    const uriStr = documentUri.toString();
    this.statusByDocument.set(uriStr, {
      kind: 'progress',
      documentId: uriStr,
      label: this.documentLabel(uriStr),
      providerName,
      done,
      total,
      targetLanguages,
    });
    this.render();
  }

  showComplete(
    documentUri: string | vscode.Uri,
    mode: TranslationMode,
    providerName: string,
    targetLanguages: readonly string[] = [this.settings.get().targetLanguage]
  ): void {
    this.statusByDocument.set(documentUri.toString(), {
      kind: 'complete',
      documentId: documentUri.toString(),
      mode,
      providerName,
      order: this.nextOrder++,
      targetLanguages,
    });
    this.render();
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
    this.statusByDocument.clear();
    this.renderOffline();
  }

  private renderOffline(): void {
    const targetCode = this.selectedTargetCode();
    const providerName = this.resolveProviderName();
    this.item.text = `$(globe) Twin: ${providerName} (${targetCode})`;
    this.item.tooltip = t('statusOfflineTooltip', providerName);
    this.item.show();
  }

  update(mode: TranslationMode): void {
    for (const status of this.statusByDocument.values()) {
      if (status.kind === 'complete') status.mode = mode;
    }
    this.render();
  }

  showError(documentUri: string | vscode.Uri, providerName: string): void {
    this.statusByDocument.set(documentUri.toString(), {
      kind: 'error',
      documentId: documentUri.toString(),
      providerName,
      order: this.nextOrder++,
    });
    this.render();
  }

  removeDocument(documentUri: string | vscode.Uri): void {
    const uriStr = documentUri.toString();
    this.statusByDocument.delete(uriStr);
    this.render();
  }

  private render(): void {
    const statuses = Array.from(this.statusByDocument.values());
    const progress = statuses.filter((status): status is DocumentProgress => status.kind === 'progress');
    if (progress.length > 0) {
      this.renderProgress(progress);
      return;
    }

    const documentErrors = statuses.filter((status): status is DocumentError => status.kind === 'error');
    const latestDocumentError = this.latestByOrder(documentErrors);
    if (latestDocumentError) {
      this.item.text = t('statusErrorText', latestDocumentError.providerName);
      this.item.tooltip = t('statusErrorTooltip');
      this.item.show();
      return;
    }

    const completed = statuses.filter((status): status is CompletedDocument => status.kind === 'complete');
    const latestCompleted = this.latestByOrder(completed);
    if (latestCompleted) {
      this.renderComplete(latestCompleted);
      return;
    }

    this.renderOffline();
  }

  private renderProgress(entries: DocumentProgress[]): void {
    if (entries.length === 1) {
      const entry = entries[0];
      const targetCode = this.selectedTargetCode();
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
        this.targetCodes(entry.targetLanguages),
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

  private latestByOrder<T extends { order: number }>(entries: T[]): T | undefined {
    return entries.reduce<T | undefined>(
      (latest, entry) => !latest || entry.order > latest.order ? entry : latest,
      undefined
    );
  }

  private selectedTargetCode(): string {
    const targetLang = normalizeTargetLanguageCode(this.settings.get().targetLanguage);
    return getLanguageDisplayCode(targetLang);
  }

  private targetCodes(languages: readonly string[]): string {
    return languages.map(language => getLanguageDisplayCode(language)).join(', ');
  }

  private providerName(providerId: string): string {
    return PROVIDER_DEFINITIONS.find(provider => provider.id === providerId)?.displayName ?? providerId;
  }

  private documentLabel(documentId: string): string {
    const path = documentId;
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return slash >= 0 ? path.slice(slash + 1) : path;
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.statusByDocument.clear();
    this.item.dispose();
  }
}
