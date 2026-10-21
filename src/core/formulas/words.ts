/**
 * The version in words of a formula (formatter: model × locale → reader-facing
 * strings), and the markup contract shared by its two renderers — the latex
 * stage, which emits it as mdast under every bound equation
 * (src/core/latex/transform.ts), and the Astro component that renders it on
 * concept and formula pages (src/components/formulas/FormulaWords.astro).
 * Both produce the same elements and classes, so one stylesheet serves both.
 *
 *   <details class="formula__words" id="<eq>__words">
 *     <summary class="formula__summary"><span class="formula__summary-label">Em palavras</span> <span class="formula__name">…</span></summary>
 *     <p class="formula__meaning" id="<eq>__meaning">…</p>
 *     <p class="formula__spoken"><span class="formula__label">Como se lê:</span> …</p>
 *     <dl class="formula__symbols"><dt class="formula__symbol">TeX</dt><dd class="formula__symbol-text">…</dd>…</dl>
 *     <p class="formula__more"><a href="…">Ficha no acervo</a></p>
 *   </details>
 */
import type { Locale } from '../domain/locale.ts';
import messages from '../i18n/catalogs/formulas.ts';
import { translator } from '../i18n/messages.ts';
import type { Formula, FormulaId } from './model.ts';

export const FORMULA_CLASS = {
  block: 'formula',
  words: 'formula__words',
  summary: 'formula__summary',
  summaryLabel: 'formula__summary-label',
  name: 'formula__name',
  meaning: 'formula__meaning',
  spoken: 'formula__spoken',
  label: 'formula__label',
  symbols: 'formula__symbols',
  symbol: 'formula__symbol',
  symbolText: 'formula__symbol-text',
  more: 'formula__more',
} as const;

/** Ids of the parts of the words block of an equation (the `__` keeps them apart from label-derived ids). */
export const formulaPartId = (equationId: string, part: 'words' | 'meaning'): string => `${equationId}__${part}`;

export interface FormulaWordsSymbol {
  readonly tex: string;
  readonly text: string;
}

export interface FormulaWords {
  readonly id: FormulaId;
  readonly name: string;
  readonly summary: string;
  readonly meaning: string;
  readonly spokenLabel: string;
  readonly spoken: string;
  readonly symbolsLabel: string;
  readonly symbols: readonly FormulaWordsSymbol[];
  readonly moreLabel: string;
  /** Where the formula's own page is (the shell computes it with the base path). */
  readonly href: string;
}

export const formulaWords = (formula: Formula, locale: Locale, href: string): FormulaWords => {
  const t = translator(messages, locale);
  return {
    id: formula.id,
    name: formula.name[locale],
    summary: t('words.summary'),
    meaning: formula.meaning[locale],
    spokenLabel: t('words.spoken'),
    spoken: formula.spoken[locale],
    symbolsLabel: t('words.symbols'),
    symbols: formula.symbols.map((s) => ({ tex: s.tex, text: s.text[locale] })),
    moreLabel: t('words.more'),
    href,
  };
};
