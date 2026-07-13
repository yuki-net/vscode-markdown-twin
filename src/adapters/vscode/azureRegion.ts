import * as vscode from 'vscode';
import { t } from '../../i18n';
import type { TranslationSettingsRepository } from '../../ports/settingsRepository';

export const DEFAULT_AZURE_REGION = 'global';

export function getAzureRegion(settings: TranslationSettingsRepository): string {
  return settings.get().azureRegion.trim() || DEFAULT_AZURE_REGION;
}

export async function promptAzureRegion(
  settings: TranslationSettingsRepository
): Promise<string | undefined> {
  const currentRegion = getAzureRegion(settings);

  const region = await vscode.window.showInputBox({
    prompt: t('azureRegionPrompt'),
    placeHolder: t('azureRegionPlaceHolder'),
    value: currentRegion,
    ignoreFocusOut: true,
  });

  if (region === undefined) {
    return undefined;
  }

  const trimmed = region.trim();
  if (!trimmed) {
    return currentRegion;
  }

  await settings.update({ azureRegion: trimmed });
  vscode.window.showInformationMessage(t('azureRegionSaved', trimmed));
  return trimmed;
}
