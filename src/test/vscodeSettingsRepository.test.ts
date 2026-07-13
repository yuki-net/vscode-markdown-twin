import * as vscode from 'vscode';
import { VscodeSettingsRepository } from '../adapters/vscode/vscodeSettingsRepository';
import type { TranslationSettingsChange } from '../ports/settingsRepository';

describe('VscodeSettingsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps providerId to the contributed markdownTwin.provider setting', () => {
    let receivedChange: TranslationSettingsChange | undefined;
    const repository = new VscodeSettingsRepository();
    repository.onDidChange(change => {
      receivedChange = change;
    });
    const configurationListener = (vscode.workspace.onDidChangeConfiguration as jest.Mock)
      .mock.calls[0][0];

    configurationListener({
      affectsConfiguration: jest.fn((key: string) => key === 'markdownTwin.provider'),
    });

    expect(receivedChange?.affects('providerId')).toBe(true);
    expect(receivedChange?.affects('targetLanguage')).toBe(false);
  });
});
