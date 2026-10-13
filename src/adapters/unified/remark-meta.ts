/**
 * Remark stage "meta" (see pipeline.ts for its place in the pipeline).
 *
 * Runs after every stage that claims or marks text (reading, concepts, embeds,
 * abnt) and before integrity:
 *   1. fills the ::toc placeholder left by the reading stage with a nested list
 *      of the document's headings (src/core/reading/toc.ts) — late, so the
 *      entries carry the foreign-language and abbreviation marking of abnt;
 *   2. folds the tree into document metadata (src/core/fold/meta.ts) and
 *      exports it on file.data.astro.frontmatter, which Astro hands to the
 *      page as `remarkPluginFrontmatter`:
 *        wordCount, readingMinutes, expandableWordCount, outline, argument,
 *        embeds, hasEmbeds, hasMath, sidenoteCount, marginnoteCount.
 * Views decode it with parseDocumentMeta (src/core/fold/meta.ts).
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type {} from '@astrojs/markdown-remark';
import type { PipelineContext } from './context.ts';
import { foldDocument } from '../../core/fold/meta.ts';
import type { MdNode } from '../../core/fold/tree.ts';
import { fillToc } from '../../core/reading/toc.ts';
import { documentLocale } from './remark-reading.ts';

export interface RemarkMetaOptions {
  readonly context: PipelineContext;
}

export function remarkMeta(_options: RemarkMetaOptions) {
  return (tree: Root, file: VFile): Root => {
    const locale = documentLocale(file, 'meta');
    const source = String(file.value);
    const filled = fillToc(tree as unknown as MdNode, source);
    const meta = foldDocument(filled, { locale, source });
    const astro = (file.data.astro ??= {});
    const frontmatter: Readonly<Record<string, unknown>> = astro.frontmatter ?? {};
    // An earlier stage (latex) may also have flagged math; keep the disjunction.
    astro.frontmatter = { ...frontmatter, ...meta, hasMath: frontmatter['hasMath'] === true || meta.hasMath };
    return filled as unknown as Root;
  };
}
