/**
 * The formula block the latex stage puts around a numbered equation bound to
 * the formula registry: the equation (unchanged: id, data-tex, scroll box) and,
 * under it, its version in words as a closed disclosure whose summary shows the
 * formula's name — so the name is visible without interaction and the
 * description is one key press away, with or without JavaScript.
 *
 * In a document the block carries the meaning, the reading aloud and the link
 * to the formula's page; the symbol list stays on that page (and on the concept
 * page). Each symbol is a KaTeX rendering of ≈ 0.7 KiB, and an essay with five
 * numbered equations must stay within its HTML budget (ADR 0011 §budget).
 *
 * Markup contract: src/core/formulas/words.ts (FORMULA_CLASS); the Astro
 * component FormulaWords.astro renders the same structure on concept and
 * formula pages. The disclosure is marked `readingGenerated`, so the words are
 * not counted as the author's prose (reading time), and the equation gets
 * `aria-describedby` pointing at the meaning (WCAG 2.2 SC 1.3.1).
 */
import type { Link, Paragraph, PhrasingContent } from 'mdast';
import { FORMULA_CLASS, formulaPartId, type FormulaWords } from '../formulas/words.ts';
import { GENERATED } from '../fold/tree.ts';
import { latexBlock, latexInline, text, type LatexBlock } from './nodes.ts';

const generated = (block: LatexBlock): LatexBlock => ({ ...block, data: { ...block.data, [GENERATED]: true } });

const paragraph = (className: string, children: readonly PhrasingContent[], id?: string): Paragraph => ({
  type: 'paragraph',
  data: { hProperties: { className: [className], ...(id === undefined ? {} : { id }) } },
  children: [...children],
});

const link = (url: string, label: string): Link => ({ type: 'link', url, children: [text(label)] });

/** The disclosure with the version in words of one equation. */
export const formulaWordsBlock = (words: FormulaWords, equationId: string): LatexBlock => {
  const summary = latexBlock('formula-summary', 'summary', { className: [FORMULA_CLASS.summary] }, [
    latexInline('formula-summary-label', { className: [FORMULA_CLASS.summaryLabel] }, [text(words.summary)]),
    text(' '),
    latexInline('formula-name', { className: [FORMULA_CLASS.name] }, [text(words.name)]),
  ]);
  const meaning = paragraph(FORMULA_CLASS.meaning, [text(words.meaning)], formulaPartId(equationId, 'meaning'));
  const spoken = paragraph(FORMULA_CLASS.spoken, [
    latexInline('formula-label', { className: [FORMULA_CLASS.label] }, [text(words.spokenLabel)]),
    text(' '),
    text(words.spoken),
  ]);
  const more = paragraph(FORMULA_CLASS.more, [link(words.href, words.moreLabel)]);
  return generated(
    latexBlock(
      'formula-words',
      'details',
      { className: [FORMULA_CLASS.words], id: formulaPartId(equationId, 'words') },
      [summary, meaning, spoken, more],
    ),
  );
};

/** The block holding the equation and its words. */
export const formulaBlock = (equation: LatexBlock, words: LatexBlock, formulaId: string): LatexBlock =>
  latexBlock('formula', 'div', { className: [FORMULA_CLASS.block], dataFormula: formulaId }, [equation, words]);
