export interface TranslationType {
  // menus / Quick Pick
  selectSetting: string;
  provider: string;
  targetLanguage: string;
  mode: string;
  bilingual: string;
  translationOnly: string;
  back: string;
  setOrChangeApiKey: string;
  deleteApiKey: string;
  selectProvider: string;
  chooseProvider: string;
  chooseTargetLanguage: string;
  outputLanguage: string;
  apiKey: string;
  apiKeyConfigured: string;
  apiKeyNotConfigured: string;
  azureRegion: string;
  azureRegionPrompt: string;
  azureRegionPlaceHolder: string;
  azureRegionSaved: (region: string) => string;
  noSavedKeys: string;
  delete: string;
  deleteApiKeyConfirm: (provider: string) => string;
  apiKeyDeleted: (provider: string) => string;

  // API Key Manager
  apiKeyAlreadyConfigured: string;
  apiKeyPaste: string;
  apiKeyEnter: (provider: string) => string;
  apiKeyAlreadyConfiguredPapago: string;
  apiKeyFormatPapago: string;
  apiKeyEnterPapago: string;

  // Notifications / Messages
  apiKeyNotSet: string;
  apiKeySetButton: string;
  noActiveEditor: string;
  previewTitle: (filename: string) => string;
  translatingWaiting: string;
  apiKeyNotSetForProvider: (provider: string) => string;
  azureRegionError: (region: string) => string;
  openSettings: string;
  rateLimitReached: string;
  translationFailed: (provider: string, lang: string) => string;
  showOutputHint: string;
  copiedToClipboard: string;
  exportedSuccessfully: (filename: string) => string;

  // Status Bar
  translatingTooltip: (done: number, total: number) => string;
  translatingMultipleText: (files: number, percent: number) => string;
  translatingMultipleTooltip: (done: number, total: number) => string;
  translatingFileTooltip: (file: string, provider: string, targets: string, percent: number, done: number, total: number) => string;
  statusCompleteTooltip: (mode: string, provider: string, target: string) => string;
  statusOfflineTooltip: (provider: string) => string;
  statusErrorText: (provider: string) => string;
  statusErrorTooltip: string;
}
