import MarkdownIt from 'markdown-it';
import { githubSlugifier } from './vscodeSlugify';

type MarkdownToken = {
  type: string;
  map: [number, number] | null;
  content: string;
  children: MarkdownToken[] | null;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
  attrJoin(name: string, value: string): void;
};

type RenderEnv = {
  markdownTwinSlugBuilder?: ReturnType<typeof githubSlugifier.createBuilder>;
};

export interface MarkdownPreviewEngineOptions {
  breaks?: boolean;
  highlightCode?: (code: string, language: string | undefined) => string;
  mapSourceLine?: (line: number) => number;
  linkify?: boolean;
  resolveResourceUri?: (href: string) => string;
  typographer?: boolean;
  uriScheme?: string;
}

export function createMarkdownPreviewEngine(options: MarkdownPreviewEngineOptions = {}): MarkdownIt {
  let md!: MarkdownIt;
  md = new MarkdownIt({
    html: true,
    breaks: options.breaks,
    highlight: (str, lang) => options.highlightCode?.(str, lang) ?? md.utils.escapeHtml(str),
    linkify: options.linkify,
    typographer: options.typographer,
  });

  addFrontmatterRenderer(md);
  addImageRenderer(md, options);
  addNamedHeaders(md);
  addLinkNormalizer(md, options);
  addLinkValidator(md);
  addLinkDataHref(md);
  addSourceMapAttributes(md, options);

  return md;
}

function addFrontmatterRenderer(md: MarkdownIt): void {
  md.block.ruler.before('hr', 'markdown_twin_frontmatter', (state, startLine, _endLine, silent): boolean => {
    if (startLine !== 0 || state.src.charCodeAt(0) !== 0x2d /* - */) {
      return false;
    }

    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.slice(start, max).trim() !== '---') {
      return false;
    }

    let nextLine = startLine + 1;
    while (nextLine < state.lineMax) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      if (state.src.slice(lineStart, lineEnd).trim() === '---') {
        break;
      }
      nextLine++;
    }

    if (nextLine >= state.lineMax) {
      return false;
    }

    if (silent) {
      return true;
    }

    const contentStart = state.eMarks[startLine] + 1;
    const contentEnd = state.bMarks[nextLine];
    const content = state.src.slice(contentStart, contentEnd).replace(/\r?\n$/, '');
    const token = state.push('html_block', '', 0) as MarkdownToken;
    token.map = [startLine, nextLine + 1];
    token.content = renderFrontmatterTable(content, md);

    state.line = nextLine + 1;
    return true;
  }, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}

function renderFrontmatterTable(content: string, md: MarkdownIt): string {
  const entries = parseFrontmatterEntries(content);
  const escape = md.utils.escapeHtml;

  if (!entries.length) {
    return `<pre class="frontmatter">${escape(content)}</pre>\n`;
  }

  const rows = entries.map(entry =>
    `<tr><th>${escape(entry.key)}</th><td>${renderFrontmatterValue(entry.value, escape)}</td></tr>`
  );
  return `<table class="frontmatter"><tbody>${rows.join('')}</tbody></table>\n`;
}

function parseFrontmatterEntries(content: string): { key: string; value: string | string[] }[] {
  const entries: { key: string; value: string | string[] }[] = [];
  let activeList: string[] | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const listItem = /^-\s+(.*)$/.exec(line);
    if (listItem && activeList) {
      activeList.push(unquoteFrontmatterValue(listItem[1]));
      continue;
    }

    const pair = /^([^:]+):\s*(.*)$/.exec(line);
    if (!pair) {
      activeList = undefined;
      continue;
    }

    const key = pair[1].trim();
    const rawValue = pair[2].trim();
    if (!rawValue) {
      activeList = [];
      entries.push({ key, value: activeList });
    } else {
      activeList = undefined;
      entries.push({ key, value: parseInlineFrontmatterValue(rawValue) });
    }
  }

  return entries;
}

function parseInlineFrontmatterValue(rawValue: string): string | string[] {
  const list = /^\[(.*)\]$/.exec(rawValue);
  if (list) {
    return list[1]
      .split(',')
      .map(item => unquoteFrontmatterValue(item.trim()))
      .filter(Boolean);
  }
  return unquoteFrontmatterValue(rawValue);
}

function unquoteFrontmatterValue(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

function renderFrontmatterValue(value: string | string[], escape: (text: string) => string): string {
  if (Array.isArray(value)) {
    return `<ul>${value.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  }
  return escape(value);
}

function addImageRenderer(md: MarkdownIt, engineOptions: MarkdownPreviewEngineOptions): void {
  const original = md.renderer.rules.image;

  md.renderer.rules.image = (tokens: MarkdownToken[], idx: number, options: unknown, env: unknown, self: any) => {
    const token = tokens[idx];
    const src = token.attrGet('src');

    if (src && !token.attrGet('data-src')) {
      token.attrSet('src', engineOptions.resolveResourceUri?.(src) ?? src);
      token.attrSet('data-src', src);
    }

    return original
      ? original(tokens as any, idx, options as any, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

function addNamedHeaders(md: MarkdownIt): void {
  const original = md.renderer.rules.heading_open;

  md.renderer.rules.heading_open = (tokens: MarkdownToken[], idx: number, options: unknown, env: RenderEnv, self: any) => {
    const title = tokenToPlainText(tokens[idx + 1]);
    const slugBuilder = env.markdownTwinSlugBuilder ??= githubSlugifier.createBuilder();
    tokens[idx].attrSet('id', slugBuilder.add(title).value);

    return original
      ? original(tokens as any, idx, options as any, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

function tokenToPlainText(token: MarkdownToken | undefined): string {
  if (!token) {
    return '';
  }

  if (token.children) {
    return token.children.map(child => tokenToPlainText(child)).join('');
  }

  switch (token.type) {
    case 'text':
    case 'emoji':
    case 'code_inline':
      return token.content;
    default:
      return '';
  }
}

function addLinkDataHref(md: MarkdownIt): void {
  const original = md.renderer.rules.link_open;

  md.renderer.rules.link_open = (tokens: MarkdownToken[], idx: number, options: unknown, env: unknown, self: any) => {
    const href = tokens[idx].attrGet('href');
    if (typeof href === 'string') {
      tokens[idx].attrSet('data-href', href);
    }

    return original
      ? original(tokens as any, idx, options as any, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

function addLinkNormalizer(md: MarkdownIt, engineOptions: MarkdownPreviewEngineOptions): void {
  const normalizeLink = md.normalizeLink;

  md.normalizeLink = (link: string): string => {
    try {
      if (engineOptions.uriScheme && /^vscode(?:-insiders)?:/i.test(link)) {
        return normalizeLink(link.replace(/^vscode(?:-insiders)?/i, engineOptions.uriScheme));
      }
    } catch {
      // Fall back to markdown-it's normalizer below.
    }

    return normalizeLink(link);
  };
}

function addLinkValidator(md: MarkdownIt): void {
  const validateLink = md.validateLink;

  md.validateLink = (link: string): boolean => {
    return validateLink(link)
      || /^vscode(?:-insiders)?:/i.test(link)
      || /^data:image\/.*?;/i.test(link);
  };
}

function addSourceMapAttributes(md: MarkdownIt, engineOptions: MarkdownPreviewEngineOptions): void {
  const mapLine = (line: number): number => engineOptions.mapSourceLine?.(line) ?? line;

  md.core.ruler.push('markdown_twin_source_map_data_attribute', (state: any): void => {
    for (const token of state.tokens as MarkdownToken[]) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-line', String(mapLine(token.map[0])));
        token.attrJoin('dir', 'auto');
      }
    }
  });

  const originalHtmlBlockRenderer = md.renderer.rules.html_block;
  if (originalHtmlBlockRenderer) {
    md.renderer.rules.html_block = (tokens: MarkdownToken[], idx: number, options: unknown, env: unknown, self: any) => {
      const line = typeof tokens[idx].map?.[0] === 'number'
        ? mapLine(tokens[idx].map[0])
        : undefined;
      const marker = typeof line === 'number' ? `<div data-line="${line}" dir="auto"></div>\n` : '';
      return marker + originalHtmlBlockRenderer(tokens as any, idx, options as any, env, self);
    };
  }
}
