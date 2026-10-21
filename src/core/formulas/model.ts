/**
 * Formula registry — model (data, not code).
 *
 * A formula is a display equation of the site together with its version in
 * words: a name, what it says (meaning), how it is read aloud (spoken) and
 * what each symbol stands for, in both locales. A numbered equation of the
 * content is bound to its formula by its `\label{eq:…}` (labels are per
 * locale, since each translation labels its own equations); the notation of a
 * concept is bound through `concept`.
 *
 * Why a registry and not prose next to each equation: the same formula
 * appears in several documents and languages, and the guarantee "every
 * formula has a version in words" must be checkable at build time
 * (docs/adr/0011-acervo-de-formulas.md). The version in words follows WCAG 2.2
 * SC 1.3.1 (information conveyed by notation is also available as text) and
 * the Dyslexia Style Guide of the British Dyslexia Association (2023), which
 * asks for plain-language versions of dense material.
 */
import type { Brand } from '../algebra/brand.ts';
import type { CitationKey, ConceptId, Label, Slug } from '../domain/identifiers.ts';
import type { Domain } from '../domain/facets.ts';
import type { Locale } from '../domain/locale.ts';
import type { Stratum } from '../domain/strata.ts';

/** One value per site locale (total: both locales are always present). */
export type Localized<T> = Readonly<Record<Locale, T>>;

/** Language-neutral, stable identifier of a formula: the file name of src/content/formulas/<id>.json. */
export type FormulaId = Brand<string, 'FormulaId'>;

/** One symbol of a formula and what it stands for. */
export interface FormulaSymbol {
  /** TeX of the symbol as it appears in the formula (rendered with the site macros). */
  readonly tex: string;
  readonly text: Localized<string>;
}

/** A formula as authored in src/content/formulas/<id>.json, parsed into refined types. */
export interface Formula {
  readonly id: FormulaId;
  readonly slug: Localized<Slug>;
  readonly name: Localized<string>;
  /** Canonical TeX of the formula (the documents may write it with other letters; the binding is by label). */
  readonly tex: string;
  /** Labels of the numbered equations bound to this formula, per locale (`eq:…`). */
  readonly labels: Localized<readonly Label[]>;
  /** The concept whose `notation` this formula is, if any (then stratum and domains are the concept's). */
  readonly concept: ConceptId | null;
  readonly stratum: Stratum;
  readonly domains: readonly Domain[];
  /** What the formula says, in one or two sentences. */
  readonly meaning: Localized<string>;
  /** How the formula is read aloud, symbol by symbol. */
  readonly spoken: Localized<string>;
  readonly symbols: readonly FormulaSymbol[];
  /** Related concepts of the ontology (besides `concept`). */
  readonly concepts: readonly ConceptId[];
  /** BibTeX keys of the sources where the formula is stated. */
  readonly sources: readonly CitationKey[];
}

/** One undecoded formula: its id (the file name without extension) and its decoded JSON value. */
export interface RawFormula {
  readonly id: string;
  readonly data: unknown;
}
