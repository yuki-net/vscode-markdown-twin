import type { IGrammarConfiguration, IRawTheme } from 'vscode-textmate';

export type GrammarDefinition = {
  scopeName: string;
  path: string;
  languageId?: string;
  injectTo: string[];
  configuration: IGrammarConfiguration;
};

export type HighlightResult =
  | {
      kind: 'highlighted';
      html: string;
      languageId: string;
    }
  | {
      kind: 'unsupported';
      html: string;
      languageId?: string;
    }
  | {
      kind: 'failed';
      html: string;
      languageId?: string;
      error: Error;
    };

export type ResolvedTextMateTheme = {
  id: string;
  theme: IRawTheme;
};
