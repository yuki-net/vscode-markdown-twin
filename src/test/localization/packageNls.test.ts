import * as fs from 'fs';
import * as path from 'path';
import { repositoryRoot } from '../support/paths';

describe('package.nls localization files', () => {
  const root = repositoryRoot;
  const base = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const localizedFiles = [
    'package.nls.ja.json',
    'package.nls.ko.json',
    'package.nls.zh-cn.json',
    'package.nls.zh-tw.json',
  ];
  const allNlsFiles = ['package.nls.json', ...localizedFiles];
  const targetLanguages: string[] =
    packageJson.contributes.configuration.properties['markdownTwin.targetLanguage'].enum;

  it('keeps localized manifest keys aligned with the default manifest strings', () => {
    const baseKeys = Object.keys(base).sort();

    for (const file of localizedFiles) {
      const localized = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      expect(Object.keys(localized).sort()).toEqual(baseKeys);
    }
  });

  it('provides concise, distinct hover labels for every target language', () => {
    const translationKeys = targetLanguages.map(code => `markdownTwin.commands.translateTo.${code}`);

    for (const file of allNlsFiles) {
      const localized = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      const labels = translationKeys.map(key => localized[key]);

      expect(labels).toHaveLength(targetLanguages.length);
      expect(new Set(labels).size).toBe(targetLanguages.length);
      for (const label of labels) {
        expect(typeof label).toBe('string');
        expect(label).toMatch(/^Markdown Twin: /);
        expect(label).not.toMatch(/%[^%]+%/);
        expect(label.length).toBeLessThanOrEqual(60);
      }
    }
  });
});
