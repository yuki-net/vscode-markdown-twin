// VSCode mock for Jest tests

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const QuickPickItemKind = {
  Separator: -1,
};

class MockStatusBarItem {
  text = '';
  tooltip = '';
  command = '';
  show = jest.fn();
  hide = jest.fn();
  dispose = jest.fn();
}

export const window = {
  createStatusBarItem: jest.fn(() => new MockStatusBarItem()),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  })),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  activeTextEditor: undefined as any,
  visibleTextEditors: [] as any[],
  onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
  onDidChangeTextEditorVisibleRanges: jest.fn(() => ({ dispose: jest.fn() })),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'provider') return 'google-cloud';
    if (key === 'sourceLanguage') return 'auto';
    if (key === 'targetLanguage') return 'ko';
    if (key === 'batchSize') return 10;
    if (key === 'defaultMode') return 'Translation Only';
    return undefined;
  }),
  update: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => mockConfig),
  onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
  onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
  onDidCloseTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
  onDidOpenTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
  textDocuments: [] as any[],
};

export const commands = {
  registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
  executeCommand: jest.fn(),
};

export const env = {
  language: 'en',
  clipboard: {
    writeText: jest.fn(),
  },
};

export class Disposable {
  static from(..._disposables: { dispose(): any }[]): Disposable {
    return new Disposable();
  }
  dispose() {}
}

export class EventEmitter<T = any> {
  event = jest.fn();
  fire = jest.fn((_event?: T) => undefined);
  dispose = jest.fn();
}

export const Uri = {
  parse: jest.fn((val: string) => ({
    toString: () => val,
    fsPath: val,
    scheme: 'file',
  })),
  file: jest.fn((val: string) => ({
    toString: () => `file://${val}`,
    fsPath: val,
    scheme: 'file',
  })),
  joinPath: jest.fn((base: any, ...paths: string[]) => {
    const basePath = base?.fsPath ?? '';
    const joined = [basePath, ...paths].join('/');
    return {
      toString: () => `file://${joined}`,
      fsPath: joined,
      scheme: 'file',
    };
  }),
};
