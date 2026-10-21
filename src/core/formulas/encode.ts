/**
 * /formulas.json — the registry as open data (one document, both locales),
 * the counterpart of /ontology.graph.json for the formulas.
 */
import { LOCALES, type Locale } from '../domain/locale.ts';
import type { Formula } from './model.ts';
import type { FormulaRegistry } from './registry.ts';

export const FORMULAS_JSON_VERSION = 1;

export const encodeFormulasJson = (
  registry: FormulaRegistry,
  url: (formula: Formula, locale: Locale) => string,
): string =>
  `${JSON.stringify(
    {
      version: FORMULAS_JSON_VERSION,
      formulas: registry.formulas.map((f, index) => ({
        id: f.id,
        ordinal: index + 1,
        name: f.name,
        tex: f.tex,
        labels: f.labels,
        concept: f.concept,
        stratum: f.stratum,
        domains: f.domains,
        meaning: f.meaning,
        spoken: f.spoken,
        symbols: f.symbols,
        concepts: f.concepts,
        sources: f.sources,
        url: Object.fromEntries(LOCALES.map((locale) => [locale, url(f, locale)])),
      })),
    },
    null,
    2,
  )}\n`;
