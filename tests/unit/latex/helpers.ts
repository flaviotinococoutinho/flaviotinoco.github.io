/**
 * Test harness: the production stage order (pipeline.ts) on a plain unified
 * processor — remark-parse + gfm, then math, directive, latex, integrity,
 * remark-rehype, KaTeX, stringify — with Astro's frontmatter channel
 * (file.data.astro.frontmatter) set up the way Astro does it.
 */
import { readFileSync } from 'node:fs';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import type { Root } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { loadPipelineContext, type PipelineContext } from '../../../src/adapters/unified/context.ts';
import { createPipeline } from '../../../src/adapters/unified/pipeline.ts';
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

type SiteProcessor = Awaited<ReturnType<typeof createMarkdownProcessor>>;
let siteProcessor: Promise<SiteProcessor> | undefined;

/**
 * The site's own Markdown processor: Astro's (GFM, SmartyPants, remark-rehype, rehype-raw,
 * heading ids) with EVERY stage of createPipeline in its production order and the real
 * build context (lexicons from lexicon/*.tsv). What a content entry renders to.
 */
const siteMarkdown = (): Promise<SiteProcessor> =>
  (siteProcessor ??= loadPipelineContext(new URL('../../../', import.meta.url), '/').then((context) => {
    const pipeline = createPipeline(context);
    return createMarkdownProcessor({
      remarkPlugins: [...pipeline.remarkPlugins],
      rehypePlugins: [...pipeline.rehypePlugins],
      syntaxHighlight: false,
      gfm: true,
      smartypants: true,
    });
  }));

/** HTML and exported frontmatter of a document rendered by the full site pipeline (rejects on a build error). */
export const site = async (
  markdown: string,
  lang: Locale = 'pt-BR',
): Promise<{ readonly html: string; readonly frontmatter: Readonly<Record<string, unknown>> }> => {
  const rendered = await (await siteMarkdown()).render(markdown, { frontmatter: { lang } });
  return { html: rendered.code, frontmatter: rendered.metadata.frontmatter };
};

let siteTreeProcessor: Promise<SiteProcessor> | undefined;

/**
 * The mdast exactly as the site's latex stage receives it — Astro's parse with GFM and SmartyPants,
 * then remark-math and remark-directive — which is the input src/core/latex/export.ts expects.
 */
export const siteTree = async (markdown: string): Promise<Root> => {
  const capture = () => (tree: Root, file: VFile) => {
    const frontmatter = ((file.data.astro ??= {}).frontmatter ??= {}) as Record<string, unknown>;
    frontmatter['__tree'] = structuredClone(tree);
  };
  siteTreeProcessor ??= createMarkdownProcessor({
    remarkPlugins: [[remarkMath, { singleDollarTextMath: false }], remarkDirective, capture],
    syntaxHighlight: false,
    gfm: true,
    smartypants: true,
  });
  const { metadata } = await (await siteTreeProcessor).render(markdown, { frontmatter: {} });
  return metadata.frontmatter['__tree'] as Root;
};

let smartypantsProcessor: Promise<SiteProcessor> | undefined;

/** The text the site's SmartyPants (Astro: remark-smartypants, default options) makes of a one-line paragraph. */
export const smartypants = async (text: string): Promise<string> => {
  smartypantsProcessor ??= createMarkdownProcessor({ syntaxHighlight: false, gfm: true, smartypants: true });
  const { code } = await (await smartypantsProcessor).render(text);
  const inner = /^<p>([\s\S]*)<\/p>$/.exec(code.trim())?.[1];
  if (inner === undefined) throw new Error(`not a single paragraph: ${code}`);
  return inner
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
};

/** Every `id="…"` of an HTML string, in order. */
export const htmlIds = (html: string): readonly string[] =>
  [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? '');

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
