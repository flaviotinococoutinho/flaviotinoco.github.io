/**
 * Test harness: the production stage order (pipeline.ts) on a plain unified
 * processor — remark-parse + gfm, then math, directive, latex, integrity,
 * remark-rehype, KaTeX, stringify — with Astro's frontmatter channel
 * (file.data.astro.frontmatter) set up the way Astro does it.
 */
import { readFileSync } from 'node:fs';
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
import { rehypeKatexIsolated } from '../../../src/adapters/unified/rehype-katex-isolated.ts';
import { remarkIntegrity } from '../../../src/adapters/unified/remark-integrity.ts';
import { remarkLatex } from '../../../src/adapters/unified/remark-latex.ts';
import type { Locale } from '../../../src/core/domain/locale.ts';

const context = {} as PipelineContext;

export const fixture = (name: string): string =>
  readFileSync(new URL(`../../fixtures/latex/${name}`, import.meta.url), 'utf8');

/** `lang: null` = frontmatter without a lang field (a default parameter would swallow `undefined`). */
export type Lang = Locale | null;

const vfile = (markdown: string, lang: Lang): VFile =>
  new VFile({ value: markdown, data: { astro: { frontmatter: lang === null ? {} : { lang } } } });

/** Parses Markdown exactly as the site does before the custom stages (the input of src/core/latex). */
export const parse = (markdown: string): Root => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective);
  return processor.runSync(processor.parse(markdown)) as Root;
};

/** mdast after the latex (and integrity) stage, plus the file for messages/frontmatter. */
export const mdast = (markdown: string, lang: Lang = 'pt-BR'): { tree: Root; file: VFile } => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective)
    .use(remarkLatex, { context })
    .use(remarkIntegrity, { context });
  const file = vfile(markdown, lang);
  const tree = processor.runSync(processor.parse(file), file) as Root;
  return { tree, file };
};

/** Full HTML, optionally without KaTeX (to inspect the TeX handed to it). */
export const html = (
  markdown: string,
  lang: Lang = 'pt-BR',
  options: { readonly katex?: boolean } = {},
): { html: string; file: VFile } => {
  const base = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective)
    .use(remarkLatex, { context })
    .use(remarkIntegrity, { context })
    .use(remarkRehype);
  const processor =
    options.katex === false ? base.use(rehypeStringify) : base.use(rehypeKatexIsolated).use(rehypeStringify);
  const file = vfile(markdown, lang);
  const out = processor.processSync(file);
  return { html: String(out), file: out };
};

/** Frontmatter exported by the stages. */
export const frontmatter = (file: VFile): Record<string, unknown> => file.data.astro?.frontmatter ?? {};

export const NBSP = ' ';

/** The message of the error a build step throws ('' when it does not throw). */
export const failure = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return '';
};
