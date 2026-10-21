/**
 * Formula registry — every formula of the site, indexed for the three
 * consumers: the latex stage (by equation label, per locale), the concept
 * pages (by concept) and the collection pages (in bridge order, by slug).
 *
 *   build  : buildFormulaRegistry : RawFormula[] × context → Result<FormulaRegistry, string[]>
 *   lookup : lookupFormula : registry × locale × label → Formula | undefined
 *
 * The builder accumulates every error of every file (applicative validation):
 * parse errors, unknown concepts and sources, a concept with two notations, a
 * label or slug used twice in one locale. A stratum and the domains of a
 * formula bound to a concept are the concept's own, so they cannot disagree.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { Domain } from '../domain/facets.ts';
import type { ConceptId, Label, Slug } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { compareStrata, type Stratum } from '../domain/strata.ts';
import type { Formula, FormulaId, Localized, RawFormula } from './model.ts';
import { parseFormula } from './parse.ts';

/** What the registry needs to know about a concept of the ontology. */
export interface ConceptFacts {
  readonly stratum: Stratum;
  readonly domains: readonly Domain[];
}

/** The references a registry is checked against. */
export interface RegistryContext {
  /** Concepts of the ontology, by id. */
  readonly concepts: ReadonlyMap<string, ConceptFacts>;
  /** Citation keys of the bibliography (anything with `has`, e.g. a BibliographyIndex). */
  readonly sources: Pick<ReadonlySet<string>, 'has'>;
}

export interface FormulaRegistry {
  /** Bridge order (stratum ordinal), then by id: the order of the collection page and of the ordinals F1, F2… */
  readonly formulas: readonly Formula[];
  readonly byId: ReadonlyMap<FormulaId, Formula>;
  readonly byLabel: Localized<ReadonlyMap<Label, Formula>>;
  readonly bySlug: Localized<ReadonlyMap<Slug, Formula>>;
  readonly byConcept: ReadonlyMap<ConceptId, Formula>;
}

const localizedMaps = <K, V>(): Localized<Map<K, V>> =>
  Object.fromEntries(LOCALES.map((locale) => [locale, new Map<K, V>()])) as unknown as Localized<Map<K, V>>;

export const EMPTY_FORMULA_REGISTRY: FormulaRegistry = {
  formulas: [],
  byId: new Map(),
  byLabel: localizedMaps(),
  bySlug: localizedMaps(),
  byConcept: new Map(),
};

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const buildFormulaRegistry = (
  raw: readonly RawFormula[],
  context: RegistryContext,
): Result<FormulaRegistry, readonly string[]> => {
  const errors: string[] = [];
  const formulas: Formula[] = [];
  const ids = new Set<string>();
  for (const file of raw) {
    const parsed = parseFormula(file);
    if (!parsed.ok) {
      errors.push(...parsed.error);
      continue;
    }
    const p = parsed.value;
    const fail = (message: string): void => {
      errors.push(`formula "${p.id}": ${message}`);
    };
    if (ids.has(p.id)) fail('duplicate id');
    ids.add(p.id);
    let stratum = p.stratum;
    let domains = p.domains;
    if (p.concept !== null) {
      const facts = context.concepts.get(p.concept);
      if (facts === undefined) fail(`concept: unknown concept "${p.concept}"`);
      else {
        stratum = facts.stratum;
        domains = facts.domains;
      }
    }
    for (const c of p.concepts) if (!context.concepts.has(c)) fail(`concepts: unknown concept "${c}"`);
    for (const s of p.sources) if (!context.sources.has(s)) fail(`sources: unknown citation key "${s}"`);
    if (stratum === null || domains === null) continue; // reported above or by the parser
    formulas.push({ ...p, stratum, domains });
  }

  const byConcept = new Map<ConceptId, Formula>();
  const byLabel = localizedMaps<Label, Formula>();
  const bySlug = localizedMaps<Slug, Formula>();
  for (const f of formulas) {
    if (f.concept !== null) {
      const previous = byConcept.get(f.concept);
      if (previous !== undefined) {
        errors.push(`formula "${f.id}": concept "${f.concept}" is already the notation of "${previous.id}"`);
      } else byConcept.set(f.concept, f);
    }
    for (const locale of LOCALES) {
      for (const label of f.labels[locale]) {
        const previous = byLabel[locale].get(label);
        if (previous !== undefined) {
          errors.push(`formula "${f.id}": label "${label}" (${locale}) already belongs to "${previous.id}"`);
        } else byLabel[locale].set(label, f);
      }
      const previous = bySlug[locale].get(f.slug[locale]);
      if (previous !== undefined) {
        errors.push(`formula "${f.id}": slug "${f.slug[locale]}" (${locale}) already belongs to "${previous.id}"`);
      } else bySlug[locale].set(f.slug[locale], f);
    }
  }
  if (errors.length > 0) return err(errors);
  const sorted = [...formulas].sort((a, b) => compareStrata(a.stratum, b.stratum) || compareIds(a.id, b.id));
  return ok({
    formulas: sorted,
    byId: new Map(sorted.map((f) => [f.id, f])),
    byLabel,
    bySlug,
    byConcept,
  });
};

/** The formula a numbered equation of a document in `locale` is bound to, by its label. */
export const lookupFormula = (registry: FormulaRegistry, locale: Locale, label: Label): Formula | undefined =>
  registry.byLabel[locale].get(label);

/** 1-based position in bridge order (the "F3" of the collection), or 0 when unknown. */
export const formulaOrdinal = (registry: FormulaRegistry, id: FormulaId): number =>
  registry.formulas.findIndex((f) => f.id === id) + 1;
