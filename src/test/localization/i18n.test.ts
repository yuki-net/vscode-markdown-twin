import * as vscode from 'vscode';
import { getLocale, t } from '../../i18n';

describe('i18n', () => {
  const setLanguage = (language: string) => {
    (vscode.env as any).language = language;
  };

  afterEach(() => {
    setLanguage('en');
  });

  it('resolves supported VS Code locales and falls back to English', () => {
    setLanguage('ja-jp');
    expect(getLocale()).toBe('ja');

    setLanguage('ko-kr');
    expect(getLocale()).toBe('ko');

    setLanguage('zh-cn');
    expect(getLocale()).toBe('zh-Hans');

    setLanguage('zh-tw');
    expect(getLocale()).toBe('zh-Hant');

    setLanguage('fr');
    expect(getLocale()).toBe('en');
  });

  it('uses localized UI strings for Simplified and Traditional Chinese', () => {
    setLanguage('zh-cn');
    expect(t('provider')).toBe('翻译提供商');

    setLanguage('zh-tw');
    expect(t('provider')).toBe('翻譯提供者');
  });
});
