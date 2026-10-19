/**
 * Build-time data of the ontology views (imperative shell).
 *
 * Reads the concepts collection (the same JSON files the Markdown stage reads
 * with node:fs, parsed by the same core parser, so both agree) and the works
 * (essays and labs, the application layer), and computes once, memoised for the
 * whole build: the ontology with its measures, the works per locale, their
 * backlinks and the formal concept lattice of each locale.
 */
import { pathToFileURL } from 'node:url';
import { getCollection } from 'astro:content';
import type { BibliographyIndex } from '../../core/bibliography/index.ts';
import type { ConceptId } from '../../core/domain/identifiers.ts';
import { LOCALES, type Locale } from '../../core/domain/locale.ts';
import {
  backlinks,
  buildOntology,
  conceptLattice,
  contextOf,
  describeError,
  shortTitleOf,
  type ConceptLattice,
  type Ontology,
  type Work,
} from '../../core/ontology/index.ts';
import { essays, labs, routeOfConcept, routeOfEssay, routeOfLab, type Concept } from '../../adapters/astro/content.ts';
import { href } from '../../adapters/astro/i18n.ts';
import { loadBibliography } from '../../adapters/unified/load-bibliography.ts';

export interface SiteOntology {
  readonly ontology: Ontology;
  /** The site bibliography (bibliography/*.bib), for the sources of the concepts. */
  readonly bibliography: BibliographyIndex;
  readonly entries: ReadonlyMap<ConceptId, Concept>;
  readonly works: Readonly<Record<Locale, readonly Work[]>>;
  readonly backlinks: Readonly<Record<Locale, ReadonlyMap<ConceptId, readonly Work[]>>>;
  /** Formal context works × concepts of each locale and its lattice (objects are work keys). */
  readonly lattice: Readonly<Record<Locale, ConceptLattice<string, ConceptId>>>;
  readonly conceptHref: (id: ConceptId, locale: Locale) => string;
  readonly workByKey: (key: string, locale: Locale) => Work | undefined;
  /** The work of a content entry (collection + entry id, e.g. 'essays' + 'pt/amostrar-e-decidir'). */
  readonly workOfEntry: (collection: 'essays' | 'labs', id: string) => Work | undefined;
}

/** Drops keys whose value is undefined (zod output of optional fields) so the core parser sees the authored shape. */
const authored = (data: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

const load = async (): Promise<SiteOntology> => {
  const collection = await getCollection('concepts');
  const built = buildOntology(collection.map((c) => ({ id: c.id, data: authored(c.data) })));
  if (!built.ok) throw new Error(`ontology: ${built.error.map(describeError).join('; ')}`);
  const ontology = built.value;
  // Astro resolves the content loaders against the working directory (the project root); so does this.
  const bibliography = await loadBibliography(pathToFileURL(`${process.cwd()}/`));
  const unknownSources = ontology.graph.ids.flatMap((id) =>
    (ontology.graph.concepts.get(id)?.sources ?? []).filter((k) => !bibliography.has(k)).map((k) => `${id}: ${k}`),
  );
  if (unknownSources.length > 0) {
    throw new Error(`ontology: concept sources missing from bibliography/*.bib: ${unknownSources.join(', ')}`);
  }
  const entries = new Map(collection.map((c) => [c.id as ConceptId, c] as const));
  const conceptHref = (id: ConceptId, locale: Locale): string => {
    const c = entries.get(id);
    return c === undefined ? href({ kind: 'ontology' }, locale) : href(routeOfConcept(c, locale), locale);
  };

  const [allEssays, allLabs] = await Promise.all([essays(), labs()]);
  const known = (ids: readonly string[]): readonly ConceptId[] =>
    ids.filter((id): id is ConceptId => ontology.graph.concepts.has(id as ConceptId));
  const byEntry = new Map<string, Work>();
  const register = (collection: 'essays' | 'labs', id: string, w: Work): Work => {
    byEntry.set(`${collection}/${id}`, w);
    return w;
  };
  const allWorks: Work[] = [
    ...allEssays.map((e): Work =>
      register('essays', e.id, {
        key: `essay:${e.data.translationKey}`,
        kind: 'essay',
        locale: e.data.lang,
        title: e.data.title,
        shortTitle: shortTitleOf(e.data.title),
        stratum: e.data.stratum,
        href: href(routeOfEssay(e), e.data.lang),
        concepts: known(e.data.concepts),
      }),
    ),
    ...allLabs.map((l): Work =>
      register('labs', l.id, {
        key: `lab:${l.data.translationKey}`,
        kind: 'lab',
        locale: l.data.lang,
        title: l.data.title,
        shortTitle: shortTitleOf(l.data.title),
        stratum: l.data.stratum,
        href: href(routeOfLab(l), l.data.lang),
        concepts: known(l.data.concepts),
      }),
    ),
  ];
  const per = <T>(f: (l: Locale) => T): Record<Locale, T> =>
    Object.fromEntries(LOCALES.map((l) => [l, f(l)])) as Record<Locale, T>;
  const works = per((l) =>
    allWorks.filter((w) => w.locale === l).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  );
  return {
    ontology,
    bibliography,
    entries,
    works,
    backlinks: per((l) => backlinks(works[l])),
    lattice: per((l) => conceptLattice(contextOf(works[l].map((w) => [w.key, w.concepts] as const)))),
    conceptHref,
    workByKey: (key, locale) => works[locale].find((w) => w.key === key),
    workOfEntry: (collection, id) => byEntry.get(`${collection}/${id}`),
  };
};

let cache: Promise<SiteOntology> | undefined;

/** The site's ontology and works, computed once per build. */
export const siteOntology = (): Promise<SiteOntology> => (cache ??= load());
