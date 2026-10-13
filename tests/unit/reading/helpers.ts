/**
 * Test harness for the reading workstream: runs Markdown through the SAME
 * processor Astro uses (@astrojs/markdown-remark: GFM, SmartyPants, remark
 * plugins, remark-rehype, rehype-raw, heading ids), with the stages that
 * matter here — math, directives, reading, meta, integrity.
 */
import { readFileSync } from 'node:fs';
import { createMarkdownProcessor, type RemarkPlugins } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';
import { VFile } from 'vfile';
import type { PipelineContext } from '../../../src/adapters/unified/context.ts';
import { remarkReading } from '../../../src/adapters/unified/remark-reading.ts';
import { remarkMeta } from '../../../src/adapters/unified/remark-meta.ts';
import { remarkIntegrity } from '../../../src/adapters/unified/remark-integrity.ts';
import type { Locale } from '../../../src/core/domain/locale.ts';
import type { MdNode } from '../../../src/core/fold/tree.ts';

export const context = { base: '/' } as PipelineContext;

export const fixture = (name: string): string =>
  readFileSync(new URL(`../../fixtures/reading/${name}`, import.meta.url), 'utf8');

const processors = new Map<string, Awaited<ReturnType<typeof createMarkdownProcessor>>>();
const processor = async (withMeta: boolean) => {
  const key = String(withMeta);
  const cached = processors.get(key);
  if (cached !== undefined) return cached;
  const meta: RemarkPlugins = withMeta ? [[remarkMeta, { context }]] : [];
  const p = await createMarkdownProcessor({
    remarkPlugins: [
      [remarkMath, { singleDollarTextMath: false }],
      remarkDirective,
      [remarkReading, { context }],
      ...meta,
      [remarkIntegrity, { context }],
    ],
    syntaxHighlight: false,
    gfm: true,
    smartypants: true,
  });
  processors.set(key, p);
  return p;
};

export interface Rendered {
  readonly html: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/** Renders Markdown to HTML exactly as an Astro content entry would be (minus the other teams' stages). */
export const render = async (md: string, lang: Locale = 'pt-BR'): Promise<Rendered> => {
  const r = await (await processor(true)).render(md, { frontmatter: { lang } });
  return { html: r.code, frontmatter: r.metadata.frontmatter };
};

/** Parses Markdown into mdast with the parse-time extensions of the pipeline (GFM, math, directives). */
export const parse = (md: string): MdNode => {
  const p = unified().use(remarkParse).use(remarkGfm).use(remarkMath, { singleDollarTextMath: false }).use(remarkDirective);
  return p.parse(new VFile(md)) as unknown as MdNode;
};

export type { Root };
