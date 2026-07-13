import * as vscode from 'vscode';
import { t } from '../../i18n';
import type { TranslationDiagnostic, TranslationDiagnostics } from '../../ports/translationDiagnostics';

export class VscodeTranslationDiagnostics implements TranslationDiagnostics, vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel('Markdown Twin');

  info(message: string): void {
    this.write('INFO', message);
  }

  warning(message: string): void {
    this.write('WARN', message);
  }

  async report(diagnostic: TranslationDiagnostic): Promise<void> {
    switch (diagnostic.kind) {
      case 'missing-credentials':
        this.showError(t('apiKeyNotSetForProvider', diagnostic.providerName), undefined, false);
        return;
      case 'azure-region': {
        this.write('ERROR', `Azure translation region error: ${diagnostic.region}`);
        const action = await vscode.window.showErrorMessage(
          t('azureRegionError', diagnostic.region),
          t('openSettings')
        );
        if (action === t('openSettings')) {
          void vscode.commands.executeCommand('workbench.action.openSettings', 'markdownTwin.azureRegion');
        }
        return;
      }
      case 'rate-limit':
        this.warning(t('rateLimitReached'));
        return;
      case 'translation-failed':
        this.showError(
          t('translationFailed', diagnostic.providerName, diagnostic.targetLanguage),
          diagnostic.error,
          true
        );
        return;
      case 'unexpected':
        this.showError(diagnostic.message, diagnostic.error, diagnostic.showOutputHint);
    }
  }

  dispose(): void {
    this.output.dispose();
  }

  private showError(message: string, error: unknown, showOutputHint: boolean): void {
    this.write('ERROR', message, error);
    const suffix = showOutputHint ? t('showOutputHint') : '';
    void vscode.window.showErrorMessage(`Markdown Twin: ${message}${suffix}`);
    this.output.show(true);
  }

  private write(level: 'INFO' | 'WARN' | 'ERROR', message: string, error?: unknown): void {
    const timestamp = new Date().toLocaleTimeString();
    this.output.appendLine(`[${timestamp}] [${level.padEnd(5)}] ${message}`);
    if (error) {
      this.output.appendLine(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  }
}
