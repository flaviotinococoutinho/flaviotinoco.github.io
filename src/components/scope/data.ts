/**
 * Build-time data of the scope pages and of the home page (imperative shell).
 *
 * Reads the works of a locale and the concepts, and measures them with the pure
 * scope model (src/core/domain/scope.ts): the same classification gives the
 * coverage matrix, the list of each discipline and the share the build checks,
 * so what the pages say about the scope is what the corpus holds.
 */
import type { CoreDomain, Domain } from '../../core/domain/facets.ts';
import type { Locale } from '../../core/domain/locale.ts';
import { coreShare, coverage, listing, type Coverage, type ScopedWork } from '../../core/domain/scope.ts';
import type { Stratum } from '../../core/domain/strata.ts';
import { concepts, essays, labs, routeOfConcept, routeOfEssay, routeOfLab } from '../../adapters/astro/content.ts';
import { href } from '../../adapters/astro/i18n.ts';

export interface ScopeWork {
  readonly id: string;
  readonly form: 'essay' | 'lab';
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly stratum: Stratum;
  readonly domains: readonly Domain[];
  readonly published: Date;
}

export interface ScopeConcept {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly stratum: Stratum;
  readonly domains: readonly Domain[];
}

export interface SiteScope {
  /** Essays and labs of the locale, most recent first. */
  readonly works: readonly ScopeWork[];
  /** Concepts, sorted by label in the locale. */
  readonly concepts: readonly ScopeConcept[];
  readonly workCoverage: Coverage;
  readonly conceptCoverage: Coverage;
  readonly share: { readonly core: number; readonly total: number; readonly value: number };
  /** Works that declare the discipline. */
  readonly worksOf: (discipline: CoreDomain) => readonly ScopeWork[];
  /** Foundation-only works listed under the discipline. */
  readonly supportingWorksOf: (discipline: CoreDomain) => readonly ScopeWork[];
  readonly conceptsOf: (discipline: CoreDomain) => readonly ScopeConcept[];
}

const cache = new Map<Locale, Promise<SiteScope>>();

const build = async (locale: Locale): Promise<SiteScope> => {
  const [allEssays, allLabs, allConcepts] = await Promise.all([essays(locale), labs(locale), concepts()]);
  const works: readonly ScopeWork[] = [
    ...allEssays.map((e): ScopeWork => ({
      id: e.id,
      form: 'essay',
      title: e.data.title,
      description: e.data.description,
      href: href(routeOfEssay(e), locale),
      stratum: e.data.stratum,
      domains: e.data.domains,
      published: e.data.published,
    })),
    ...allLabs.map((l): ScopeWork => ({
      id: l.id,
      form: 'lab',
      title: l.data.title,
      description: l.data.description,
      href: href(routeOfLab(l), locale),
      stratum: l.data.stratum,
      domains: l.data.domains,
      published: l.data.published,
    })),
  ].sort((a, b) => b.published.getTime() - a.published.getTime() || a.title.localeCompare(b.title, locale));

  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const scopeConcepts: readonly ScopeConcept[] = allConcepts
    .map((c): ScopeConcept => ({
      id: c.id,
      label: c.data.prefLabel[locale],
      href: href(routeOfConcept(c, locale), locale),
      stratum: c.data.stratum,
      domains: c.data.domains,
    }))
    .sort((a, b) => collator.compare(a.label, b.label));

  const scoped: readonly ScopedWork[] = works.map((w) => ({ id: w.id, form: w.form, domains: w.domains }));
  const value = coreShare(scoped);
  const listed =
    (role: 'direct' | 'supporting', discipline: CoreDomain) => (w: { readonly domains: readonly Domain[] }) => {
      const l = listing(w.domains);
      return l.role === role && l.disciplines.includes(discipline);
    };

  return {
    works,
    concepts: scopeConcepts,
    workCoverage: coverage(works),
    conceptCoverage: coverage(scopeConcepts),
    share: { core: Math.round(value * works.length), total: works.length, value },
    worksOf: (d) => works.filter(listed('direct', d)),
    supportingWorksOf: (d) => works.filter(listed('supporting', d)),
    conceptsOf: (d) => scopeConcepts.filter(listed('direct', d)),
  };
};

/** The measured scope of a locale, computed once per build. */
export const siteScope = (locale: Locale): Promise<SiteScope> => {
  const hit = cache.get(locale);
  if (hit !== undefined) return hit;
  const fresh = build(locale);
  cache.set(locale, fresh);
  return fresh;
};
