/**
 * Build-time context for the Markdown pipeline (imperative shell).
 *
 * Reads the static sources once — bibliography (.bib), lexicons (.tsv),
 * concept index (.json) — parses them with the pure parsers of the core and
 * hands immutable, pre-compiled structures to the remark/rehype stages.
 * Parsing errors abort the build with every problem listed (applicative
 * validation), never with a partially-built site.
 */
import { loadBibliography } from './load-bibliography.ts';
import { loadLexicon } from './load-lexicon.ts';
import { loadConcepts } from './load-concepts.ts';

export type PipelineContext = {
  /** Site base path ending with "/", e.g. "/flaviotinoco.github.io/". */
  readonly base: string;
  readonly bibliography: Awaited<ReturnType<typeof loadBibliography>>;
  readonly lexicon: Awaited<ReturnType<typeof loadLexicon>>;
  readonly concepts: Awaited<ReturnType<typeof loadConcepts>>;
};

export const loadPipelineContext = async (root: URL, base: string): Promise<PipelineContext> => {
  const [bibliography, lexicon, concepts] = await Promise.all([
    loadBibliography(root),
    loadLexicon(root),
    loadConcepts(root),
  ]);
  return { base, bibliography, lexicon, concepts };
};
