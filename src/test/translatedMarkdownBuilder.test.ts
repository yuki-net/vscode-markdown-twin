import MarkdownIt from 'markdown-it';
import { buildTranslatedMarkdown } from '../translatedMarkdownBuilder';
import { createMarkdownPreviewEngine } from '../preview/markdownEngine';

describe('buildTranslatedMarkdown', () => {
  it('keeps markdown table structure when translating cell contents', () => {
    const source = [
      '| 項目 | 内容 |',
      '|---|---|',
      '| コンセプト | 未定 |',
    ].join('\n');

    const translated = buildTranslatedMarkdown({
      source,
      langCode: 'ko',
      mode: 'translation-only',
      md: new MarkdownIt(),
      getTranslation: (content) => {
        const translations = new Map([
          ['項目', '항목'],
          ['内容', '내용'],
          ['コンセプト', '콘셉트'],
          ['未定', '미정'],
        ]);
        return translations.get(content) ?? null;
      },
    });

    const html = createMarkdownPreviewEngine().render(translated.text);

    expect(translated.text).toContain('| 항목 | 내용 |');
    expect(translated.text).toContain('| 콘셉트 | 미정 |');
    expect(html).toContain('<table');
    expect(html).toContain('<td');
  });

  it('sanitizes translated table cells that contain line breaks or pipes', () => {
    const source = [
      '| Key | Value |',
      '|---|---|',
      '| concept | pending |',
    ].join('\n');

    const translated = buildTranslatedMarkdown({
      source,
      langCode: 'ko',
      mode: 'translation-only',
      md: new MarkdownIt(),
      getTranslation: content => content === 'pending' ? 'line one\nline | two' : null,
    });

    const html = createMarkdownPreviewEngine().render(translated.text);

    expect(translated.text).toContain('| concept | line one line \\| two |');
    expect(html).toContain('<table');
    expect(html).toContain('<td>line one line | two</td>');
  });

  it('renders bilingual paragraphs with translation first and original as a secondary block', () => {
    const translated = buildTranslatedMarkdown({
      source: 'Original sentence.',
      langCode: 'ko',
      mode: 'bilingual',
      md: new MarkdownIt(),
      getTranslation: content => content === 'Original sentence.' ? 'Translated sentence.' : null,
    });

    const html = createMarkdownPreviewEngine().render(translated.text);

    expect(translated.text).toBe(
      'Translated sentence.\n\n<div class="mt-bilingual-original">Original sentence.</div>'
    );
    expect(html).toContain('Translated sentence.</p>');
    expect(html).toContain('<div class="mt-bilingual-original">Original sentence.</div>');
  });

  it('renders bilingual headings with the same heading level for the original text', () => {
    const translated = buildTranslatedMarkdown({
      source: '## Original heading',
      langCode: 'ko',
      mode: 'bilingual',
      md: new MarkdownIt(),
      getTranslation: content => content === 'Original heading' ? 'Translated heading' : null,
    });

    const html = createMarkdownPreviewEngine().render(translated.text);

    expect(translated.text).toBe(
      '## Translated heading\n\n<h2 class="mt-bilingual-original mt-bilingual-original-heading">Original heading</h2>'
    );
    expect(html).toContain('>Translated heading</h2>');
    expect(html).toContain('<h2 class="mt-bilingual-original mt-bilingual-original-heading">Original heading</h2>');
  });

  it('renders bilingual table cells with translation first and original as inline secondary text', () => {
    const translated = buildTranslatedMarkdown({
      source: '| Key | Value |\n|---|---|\n| concept | pending |',
      langCode: 'ko',
      mode: 'bilingual',
      md: new MarkdownIt(),
      getTranslation: content => content === 'pending' ? 'translated' : null,
    });

    const html = createMarkdownPreviewEngine().render(translated.text);

    expect(translated.text).toContain(
      '| concept | translated<span class="mt-bilingual-original-cell">pending</span> |'
    );
    expect(html).toContain('<td>translated<span class="mt-bilingual-original-cell">pending</span></td>');
  });
});
