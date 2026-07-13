import { createMarkdownPreviewEngine } from '../adapters/vscode/preview/markdownEngine';

describe('createMarkdownPreviewEngine', () => {
  it('adds VS Code compatible heading ids and keeps duplicate headings unique', () => {
    const md = createMarkdownPreviewEngine();

    const html = md.render('# Hello World\n\n# Hello World');

    expect(html).toContain('id="hello-world"');
    expect(html).toContain('id="hello-world-1"');
  });

  it('adds source line metadata to block tokens', () => {
    const md = createMarkdownPreviewEngine();

    const html = md.render('# Title\n\nBody');

    expect(html).toContain('data-line="0"');
    expect(html).toContain('data-line="2"');
    expect(html).toContain('dir="auto"');
  });

  it('maps rendered markdown lines back to original source lines', () => {
    const md = createMarkdownPreviewEngine({
      mapSourceLine: line => [4, 4, 10][line] ?? line,
    });

    const html = md.render('# Translated\n\nBody');

    expect(html).toContain('data-line="4"');
    expect(html).toContain('data-line="10"');
    expect(html).not.toContain('data-line="2"');
  });

  it('keeps fenced code blocks escaped until the asynchronous preview renderer highlights them', () => {
    const md = createMarkdownPreviewEngine();

    const html = md.render('```ts\nconst value = "<unsafe>";\n```');

    expect(html).toContain('<pre><code');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).not.toContain('hljs');
  });

  it('preserves the original link target in data-href', () => {
    const md = createMarkdownPreviewEngine();

    const html = md.render('[Docs](./docs/readme.md#intro)');

    expect(html).toContain('href="./docs/readme.md#intro"');
    expect(html).toContain('data-href="./docs/readme.md#intro"');
  });

  it('rewrites image sources for the webview and keeps the original source in data-src', () => {
    const md = createMarkdownPreviewEngine({
      resolveResourceUri: href => `vscode-resource:${href}`,
    });

    const html = md.render('![Alt](./images/sample.png)');

    expect(html).toContain('src="vscode-resource:./images/sample.png"');
    expect(html).toContain('data-src="./images/sample.png"');
  });

  it('allows VS Code command links and data image links', () => {
    const md = createMarkdownPreviewEngine();

    const html = md.render('[Command](vscode://file/test.md)\n\n![Inline](data:image/png;base64,abc)');

    expect(html).toContain('href="vscode://file/test.md"');
    expect(html).toContain('src="data:image/png;base64,abc"');
  });

  it('normalizes vscode links to the current VS Code uri scheme', () => {
    const md = createMarkdownPreviewEngine({ uriScheme: 'cursor' });

    const html = md.render('[Command](vscode://file/test.md)');

    expect(html).toContain('href="cursor://file/test.md"');
    expect(html).toContain('data-href="cursor://file/test.md"');
  });

  it('renders yaml frontmatter as a frontmatter table', () => {
    const md = createMarkdownPreviewEngine();

    const html = md.render('---\ntitle: Hello\ntags: [one, two]\n---\n\n# Body');

    expect(html).toContain('<table class="frontmatter">');
    expect(html).toContain('<th>title</th><td>Hello</td>');
    expect(html).toContain('<th>tags</th><td><ul><li>one</li><li>two</li></ul></td>');
    expect(html).toContain('id="body"');
  });

  it('applies markdown preview settings to the markdown-it engine', () => {
    const md = createMarkdownPreviewEngine({
      breaks: true,
      linkify: true,
      typographer: true,
    });

    const html = md.render('first\nsecond\n\nhttps://example.com\n\n"quoted"');

    expect(html).toContain('first<br>');
    expect(html).toContain('<a href="https://example.com" data-href="https://example.com">https://example.com</a>');
    expect(html).toContain('“quoted”');
  });
});
