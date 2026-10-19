/**
 * The Markdown pipeline (imperative shell → functional core).
 *
 * Every custom stage below is a thin adapter around a pure transform in
 * src/core/**. Stages are ordered; the order is part of the contract:
 *
 *   remark (mdast)                                     [Astro runs gfm + smartypants first]
 *     1. remark-math     $$…$$ → inlineMath / math nodes. Single-dollar math is
 *                        DISABLED: in pt-BR "R$ 5,00 e R$ 10,00" would be parsed as
 *                        a formula. The grammar must not be ambiguous with prose.
 *     2. remark-directive  :::env / ::leaf / :text directives
 *     3. latex           theorem-like environments, counters, \label/\ref/\eqref,
 *                        figures and tables with ABNT captions
 *     4. citations       [@key, p. 12] → NBR 10520 / APA citations + reference list
 *     5. reading         stretchtext, sidenotes, marginnotes, scrollytelling,
 *                        horizontal tracks, epigraphs, heading attributes {#id .kind}
 *     6. concepts        :concept[…] links with definition popovers, ::concept-map
 *     7. embeds          ::lab{widget=…} → lazily-upgraded custom elements
 *     8. abnt            lexicon-driven marking: <i lang> for foreign terms, proper
 *                        names, acronyms (<abbr>), typographic spacing rules
 *     9. meta            folds: word count, reading time, argument graph → frontmatter
 *    10. integrity       restores the exact source of every directive no stage
 *                        claimed (remark-directive would turn "10:30" into "10"),
 *                        and fails the build on fatal messages of earlier stages
 *   rehype (hast)
 *    11. katex           TeX → HTML + MathML with per-file isolated macros
 *                        (shared defaults from src/core/latex/macros.ts)
 *    12. footnotes-i18n  localises the GFM footnote heading and back-reference labels
 *    13. heading-anchors permalink (§) at the end of every h2–h4 with an id, labelled
 *                        in the document language; adds elements only, text untouched
 *
 * Invariant (docs/arquitetura.md §Preservação): every stage is injective on the
 * text it touches — the source text is recoverable from the output (plain text
 * is preserved, or the original is kept in a data-* attribute).
 */
import type { RehypePlugins, RemarkPlugins } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import type { PipelineContext } from './context.ts';
import { remarkLatex } from './remark-latex.ts';
import { remarkCitations } from './remark-citations.ts';
import { remarkReading } from './remark-reading.ts';
import { remarkConcepts } from './remark-concepts.ts';
import { remarkEmbeds } from './remark-embeds.ts';
import { remarkAbnt } from './remark-abnt.ts';
import { remarkMeta } from './remark-meta.ts';
import { remarkIntegrity } from './remark-integrity.ts';
import { rehypeKatexIsolated } from './rehype-katex-isolated.ts';
import { rehypeFootnotesI18n } from './rehype-footnotes-i18n.ts';
import { rehypeHeadingAnchors } from './rehype-heading-anchors.ts';

export interface Pipeline {
  readonly remarkPlugins: RemarkPlugins;
  readonly rehypePlugins: RehypePlugins;
}

export const createPipeline = (context: PipelineContext): Pipeline => ({
  remarkPlugins: [
    [remarkMath, { singleDollarTextMath: false }],
    remarkDirective,
    [remarkLatex, { context }],
    [remarkCitations, { context }],
    [remarkReading, { context }],
    [remarkConcepts, { context }],
    [remarkEmbeds, { context }],
    [remarkAbnt, { context }],
    [remarkMeta, { context }],
    [remarkIntegrity, { context }],
  ],
  rehypePlugins: [rehypeKatexIsolated, rehypeFootnotesI18n, rehypeHeadingAnchors],
});
