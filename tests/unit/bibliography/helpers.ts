/**
 * Test helpers: the fixture bibliography and a unified pipeline that runs the
 * citations stage the way Astro does (remark-parse → gfm → math → directive →
 * citations → remark-rehype → rehype-stringify).
 */
import { readFileSync } from 'node:fs';
import type { Root as HastRoot } from 'hast';
import type { Root } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import type { PipelineContext } from '../../../src/adapters/unified/context.ts';
import { remarkCitations } from '../../../src/adapters/unified/remark-citations.ts';
import { buildBibliography, type BibliographyIndex } from '../../../src/core/bibliography/index.ts';
import type { Reference } from '../../../src/core/bibliography/model/reference.ts';

export const FIXTURE_PATH = new URL('../../fixtures/bibliography/fixture.bib', import.meta.url);
export const MAIN_BIB_PATH = new URL('../../../bibliography/main.bib', import.meta.url);

export const loadIndex = (url: URL, name = 'fixture.bib'): BibliographyIndex => {
  const result = buildBibliography([{ name, text: readFileSync(url, 'utf8') }]);
  if (!result.ok)
    throw new Error(result.error.map((d) => `${d.span.start.line}:${d.span.start.column} ${d.message}`).join('\n'));
  return result.value;
};

export const fixture: BibliographyIndex = loadIndex(FIXTURE_PATH);

export const ref = (key: string, index: BibliographyIndex = fixture): Reference => {
  const r = index.get(key);
  if (r === undefined) throw new Error(`no fixture entry ${key}`);
  return r;
};

/** Replaces no-break spaces by spaces, so golden strings stay readable. */
export const spaces = (s: string): string => s.replace(/[\u00A0\u202F]/gu, ' ');

const context = (bibliography: BibliographyIndex): PipelineContext =>
  ({ base: '/', bibliography }) as Partial<PipelineContext> as PipelineContext;

const processor = (bibliography: BibliographyIndex) =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective)
    .use(remarkCitations, { context: context(bibliography) });

const asRoot = (node: { readonly type: string }): Root => {
  if (node.type !== 'root') throw new Error(`expected an mdast root, got ${node.type}`);
  return node as Root;
};

export type Rendered = {
  readonly html: string;
  readonly mdast: Root;
  readonly hast: HastRoot;
  readonly file: VFile;
  readonly frontmatter: Record<string, unknown>;
};

/** Runs the stage on `markdown` as a document in `lang`, returning mdast, hast, HTML and the exported frontmatter. */
export const render = (
  markdown: string,
  lang: 'pt-BR' | 'en' = 'pt-BR',
  bibliography: BibliographyIndex = fixture,
): Rendered => {
  const file = new VFile({ value: markdown, data: { astro: { frontmatter: { lang } } } });
  const p = processor(bibliography);
  const mdast = asRoot(p.runSync(p.parse(file), file));
  const toHast = unified().use(remarkRehype);
  const hast: HastRoot = toHast.runSync(mdast, file);
  const html = unified().use(rehypeStringify).stringify(hast);
  const data = file.data as { astro?: { frontmatter?: Record<string, unknown> } };
  return { html, mdast, hast, file, frontmatter: data.astro?.frontmatter ?? {} };
};
