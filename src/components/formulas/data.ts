/**
 * Build-time data of the formula pages (imperative shell).
 *
 * Reads the formulas collection (the same JSON files the latex stage reads
 * with node:fs, parsed by the same core builder, so both agree), checks it
 * against the ontology and the bibliography, and computes once, memoised for
 * the whole build, where every formula appears: the numbered equations of the
 * essays and labs of each locale, found through the label table the latex
 * stage exports (frontmatter.crossrefs).
 */
import { getCollection, render } from 'astro:content';
import type { ConceptId, Label } from '../../core/domain/identifiers.ts';
import { LOCALES, type Locale } from '../../core/domain/locale.ts';
import { buildFormulaRegistry, type Formula, type FormulaRegistry } from '../../core/formulas/index.ts';
import { refText } from '../../core/latex/format.ts';
import { essays, labs, routeOfEssay, routeOfLab } from '../../adapters/astro/content.ts';
import { href } from '../../adapters/astro/i18n.ts';
import { siteOntology } from '../ontology/data.ts';

/** One numbered equation of a work bound to a formula. */
export interface FormulaUse {
  readonly form: 'essay' | 'lab';
  readonly title: string;
  /** URL of the equation (page + fragment). */
  readonly href: string;
  readonly label: Label;
  /** "Equação (2)" / "Equation (2)" in the locale of the work. */
  readonly equation: string;
}

export interface SiteFormulas {
  readonly registry: FormulaRegistry;
  readonly formulaHref: (formula: Formula, locale: Locale) => string;
  /** Where a formula appears in the works of a locale, in the order of the works. */
  readonly usesOf: (formula: Formula, locale: Locale) => readonly FormulaUse[];
}

/** Drops keys whose value is undefined (zod output of optional fields) so the core parser sees the authored shape. */
const authored = (data: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

interface Crossref {
  readonly label: string;
  readonly id: string;
  readonly type: string;
  readonly number?: string;
}

const isCrossref = (v: unknown): v is Crossref =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Crossref).label === 'string' &&
  typeof (v as Crossref).id === 'string';

const load = async (): Promise<SiteFormulas> => {
  const [collection, site] = await Promise.all([getCollection('formulas'), siteOntology()]);
  const concepts = new Map(
    site.ontology.graph.ids.flatMap((id) => {
      const c = site.ontology.graph.concepts.get(id);
      return c === undefined ? [] : [[id, { stratum: c.stratum, domains: c.domains }] as const];
    }),
  );
  const built = buildFormulaRegistry(
    collection.map((f) => ({ id: f.id, data: authored(f.data) })),
    { concepts, sources: site.bibliography },
  );
  if (!built.ok) throw new Error(`formulas: ${built.error.join('; ')}`);
  const registry = built.value;

  // label → uses, per locale, from the numbered equations of every work.
  const uses = Object.fromEntries(LOCALES.map((l) => [l, new Map<Label, FormulaUse[]>()])) as Readonly<
    Record<Locale, Map<Label, FormulaUse[]>>
  >;
  for (const locale of LOCALES) {
    const works = [
      ...(await essays(locale)).map((e) => ({ form: 'essay' as const, entry: e, route: routeOfEssay(e) })),
      ...(await labs(locale)).map((e) => ({ form: 'lab' as const, entry: e, route: routeOfLab(e) })),
    ];
    for (const work of works) {
      const { remarkPluginFrontmatter } = await render(work.entry);
      const crossrefs: unknown = remarkPluginFrontmatter['crossrefs'];
      if (!Array.isArray(crossrefs)) continue;
      for (const ref of crossrefs) {
        if (!isCrossref(ref) || ref.type !== 'equation' || ref.number === undefined) continue;
        const label = ref.label as Label;
        const list = uses[locale].get(label) ?? [];
        list.push({
          form: work.form,
          title: work.entry.data.title,
          href: `${href(work.route, locale)}#${ref.id}`,
          label,
          equation: refText(locale, { type: 'equation', number: ref.number }) ?? ref.number,
        });
        uses[locale].set(label, list);
      }
    }
  }
  return {
    registry,
    formulaHref: (formula, locale) => href({ kind: 'formula', slug: formula.slug[locale] }, locale),
    usesOf: (formula, locale) => formula.labels[locale].flatMap((label) => uses[locale].get(label) ?? []),
  };
};

let cached: Promise<SiteFormulas> | undefined;

export const siteFormulas = (): Promise<SiteFormulas> => (cached ??= load());

/** The formula bound to a concept's notation, if any. */
export const formulaOfConcept = async (id: ConceptId): Promise<Formula | undefined> =>
  (await siteFormulas()).registry.byConcept.get(id);
