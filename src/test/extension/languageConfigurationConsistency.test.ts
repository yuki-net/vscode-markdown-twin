import * as fs from 'fs';
import * as path from 'path';
import { SUPPORTED_LANGUAGES } from '../../languages';
import { repositoryRoot } from '../support/paths';

describe('language configuration consistency', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
  );

  it('registers every supported target language in settings, commands, menus, and icons', () => {
    const properties = packageJson.contributes.configuration.properties;
    const targetEnum: string[] = properties['markdownTwin.targetLanguage'].enum;
    const sourceEnum: string[] = properties['markdownTwin.sourceLanguage'].enum;
    const targetLabels: string[] = properties['markdownTwin.targetLanguage'].enumItemLabels;
    const sourceLabels: string[] = properties['markdownTwin.sourceLanguage'].enumItemLabels;
    const commands: Array<{ command: string; title: string }> = packageJson.contributes.commands;
    const editorTitleMenus: Array<{ command: string; when?: string }> = packageJson.contributes.menus['editor/title'];
    const commandPaletteMenus: Array<{ command: string; when?: string }> = packageJson.contributes.menus.commandPalette;

    expect(targetLabels).toHaveLength(targetEnum.length);
    expect(sourceLabels).toHaveLength(sourceEnum.length);

    for (const language of SUPPORTED_LANGUAGES) {
      expect(targetEnum).toContain(language.code);
      expect(sourceEnum).toContain(language.code);
      expect(targetLabels).toContain(language.label);
      expect(sourceLabels).toContain(language.label);
      const command = commands.find(command => command.command === `markdownTwin.toggleTranslation.${language.code}`);
      expect(command?.title).toBe(`%markdownTwin.commands.translateTo.${language.code}%`);
      expect(editorTitleMenus.some(menu => menu.command === `markdownTwin.toggleTranslation.${language.code}`)).toBe(true);
      expect(commandPaletteMenus.find(menu => menu.command === `markdownTwin.toggleTranslation.${language.code}`)?.when).toBe('false');
      expect(fs.existsSync(path.join(repositoryRoot, 'media', 'flags', `${language.code}.svg`))).toBe(true);
    }
  });

  it('scopes Twin preview title actions to the Twin preview context', () => {
    const editorTitleMenus: Array<{ command: string; when?: string }> = packageJson.contributes.menus['editor/title'];
    const previewOnlyCommands = [
      'markdownTwin.copyTranslatedMarkdown',
      'markdownTwin.exportTranslatedMarkdown',
      'markdownTwin.openTranslatedSource',
      'markdownTwin.openPreviewFromSource',
    ];

    for (const command of previewOnlyCommands) {
      const menu = editorTitleMenus.find(item => item.command === command);
      expect(menu?.when).toContain('markdownTwin.previewActive');
      expect(menu?.when).toContain("activeWebviewPanelId == 'markdownTwinPreview'");
    }

    expect(editorTitleMenus.find(item => item.command === 'markdownTwin.openPreviewFromSource')?.when)
      .toContain('markdownTwin.showingSource');
    expect(editorTitleMenus.find(item => item.command === 'markdownTwin.openTranslatedSource')?.when)
      .toContain('!markdownTwin.showingSource');
  });
});
