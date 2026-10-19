/**
 * Node-link codec — /ontology.graph.json, the plain graph for researchers and
 * the single payload format of the client-side explorer.
 *
 *   encode : Ontology × hrefs → GraphJson                        (build time)
 *   decode : unknown → Result<ClientModel, string>              (browser)
 *   law    : decode(encode(o)) rebuilds the same taxonomy and the same IC
 *            (tests/unit/ontology/graphjson.test.ts)
 *
 * The format follows the node-link convention of network tools (nodes with
 * attributes, typed edges as {source, target, type}); every measure the views
 * show (IC, betweenness, community) travels with the node. The browser
 * rebuilds the taxonomy with the SAME core functions as the build
 * (taxonomy from category + broader, intrinsicInformationContent), so the
 * "compare" tool and the concept pages can never disagree.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { parseConceptId, type ConceptId } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { isStratum, STRATA, type Stratum } from '../domain/strata.ts';
import type { Link } from './graph.ts';
import type { Hierarchy } from './hierarchy.ts';
import { intrinsicInformationContent, type InformationContent } from './measures.ts';
import type { Localized } from './model.ts';
import type { Ontology } from './ontology.ts';
import { CATEGORIES, isCategory, isRelationType, RELATION_TYPES, RELATIONS, type Category } from './vocabulary.ts';
import { buildTaxonomy, type TaxonId } from './taxonomy.ts';
import { searchKey } from './text.ts';

export const GRAPH_JSON_VERSION = 1;

export interface GraphJsonNode {
  readonly id: string;
  readonly stratum: Stratum;
  readonly category: Category;
  readonly domains: readonly string[];
  readonly label: Localized<string>;
  readonly alt: Localized<readonly string[]>;
  readonly definition: Localized<string>;
  readonly href: Localized<string>;
  /** Intrinsic information content on the extended taxonomy. */
  readonly ic: number;
  readonly degree: number;
  readonly betweenness: number;
  readonly crossStrataBetweenness: number;
  readonly bridge: boolean;
  readonly community: number;
}

export interface GraphJsonEdge {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

export interface GraphJson {
  readonly version: number;
  readonly locales: readonly Locale[];
  readonly strata: readonly Stratum[];
  readonly categories: readonly Category[];
  readonly relations: readonly {
    readonly type: string;
    readonly symmetric: boolean;
    readonly transitive: boolean;
    readonly acyclic: boolean;
    readonly inverse: string | null;
    readonly stratum: string;
    readonly weight: number;
  }[];
  readonly nodes: readonly GraphJsonNode[];
  readonly edges: readonly GraphJsonEdge[];
  readonly stats: {
    readonly concepts: number;
    readonly links: number;
    readonly communities: number;
    readonly modularity: number;
    readonly nmiDomains: number;
    readonly stratumEntropy: number;
    readonly degreeEntropy: number;
  };
}

const round = (v: number, digits = 6): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export const encodeGraphJson = (o: Ontology, href: (id: ConceptId, locale: Locale) => string): GraphJson => {
  const g = o.graph;
  const bridges = new Set(o.bridges);
  return {
    version: GRAPH_JSON_VERSION,
    locales: LOCALES,
    strata: STRATA,
    categories: CATEGORIES,
    relations: RELATION_TYPES.map((t) => {
      const s = RELATIONS[t];
      return {
        type: t,
        symmetric: s.symmetric,
        transitive: s.transitive,
        acyclic: s.acyclic,
        inverse: s.inverse,
        stratum: s.stratum,
        weight: s.weight,
      };
    }),
    nodes: g.ids.flatMap((id) => {
      const e = g.concepts.get(id);
      if (e === undefined) return [];
      return [
        {
          id,
          stratum: e.stratum,
          category: e.category,
          domains: e.domains,
          label: e.prefLabel,
          alt: e.altLabel,
          definition: e.definition,
          href: { 'pt-BR': href(id, 'pt-BR'), en: href(id, 'en') },
          ic: round(o.ic.get(id) ?? 0),
          degree: g.neighbours.get(id)?.length ?? 0,
          betweenness: round(o.centrality.betweenness.get(id) ?? 0),
          crossStrataBetweenness: round(o.centrality.crossStrata.get(id) ?? 0),
          bridge: bridges.has(id),
          community: o.communities.of.get(id) ?? -1,
        },
      ];
    }),
    edges: g.links.map((l) => ({ source: l.source, target: l.target, type: l.type })),
    stats: {
      concepts: o.stats.concepts,
      links: o.stats.links,
      communities: o.stats.communities.count,
      modularity: round(o.stats.communities.modularity),
      nmiDomains: round(o.stats.communities.nmiDomains),
      stratumEntropy: round(o.stats.strata.bits),
      degreeEntropy: round(o.stats.degree.entropy),
    },
  };
};

/**
 * Serialises a payload for a static file or an inline data block. "<" is
 * escaped as < so the data can never close a script element (HTML
 * §4.12.1.3); JSON.parse restores it exactly.
 */
export const serializeGraphJson = (payload: GraphJson): string => jsonForScript(payload);

/** JSON for a <script type="application/ld+json"> data block or a static file, with "<" escaped (see above). */
export const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

// ─── Client model ───────────────────────────────────────────────────────────

export interface ClientConcept {
  readonly id: ConceptId;
  readonly stratum: Stratum;
  readonly category: Category;
  readonly label: string;
  readonly alt: readonly string[];
  readonly definition: string;
  readonly href: string;
  readonly ic: number;
  readonly bridge: boolean;
  readonly community: number;
  /** Accent- and case-insensitive keys of the label and alt labels (search). */
  readonly keys: readonly string[];
}

export interface ClientModel {
  readonly locale: Locale;
  readonly ids: readonly ConceptId[];
  readonly concepts: ReadonlyMap<ConceptId, ClientConcept>;
  readonly links: readonly Link[];
  readonly taxonomy: Hierarchy<TaxonId>;
  readonly ic: InformationContent<TaxonId>;
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const localizedString = (v: unknown, locale: Locale): string | null =>
  isRecord(v) && typeof v[locale] === 'string' ? v[locale] : null;
const localizedStrings = (v: unknown, locale: Locale): readonly string[] | null => {
  if (!isRecord(v)) return null;
  const xs = v[locale];
  return Array.isArray(xs) && xs.every((x) => typeof x === 'string') ? xs : null;
};

/** Decodes /ontology.graph.json for one locale and rebuilds the taxonomy and IC with the core functions. */
export const decodeGraphJson = (raw: unknown, locale: Locale): Result<ClientModel, string> => {
  if (
    !isRecord(raw) ||
    raw['version'] !== GRAPH_JSON_VERSION ||
    !Array.isArray(raw['nodes']) ||
    !Array.isArray(raw['edges'])
  ) {
    return err('malformed ontology graph payload');
  }
  const concepts = new Map<ConceptId, ClientConcept>();
  for (const n of raw['nodes'] as readonly unknown[]) {
    if (!isRecord(n)) return err('malformed node');
    const id = parseConceptId(n['id']);
    const label = localizedString(n['label'], locale);
    const definition = localizedString(n['definition'], locale);
    const href = localizedString(n['href'], locale);
    const alt = localizedStrings(n['alt'], locale);
    const { stratum, category, ic, bridge, community } = n;
    if (
      !id.ok ||
      label === null ||
      definition === null ||
      href === null ||
      alt === null ||
      !isStratum(stratum) ||
      !isCategory(category) ||
      typeof ic !== 'number' ||
      typeof bridge !== 'boolean' ||
      typeof community !== 'number'
    ) {
      return err(`malformed node ${show(n['id'])}`);
    }
    concepts.set(id.value, {
      id: id.value,
      stratum,
      category,
      label,
      alt,
      definition,
      href,
      ic,
      bridge,
      community,
      keys: [label, ...alt].map((s) => searchKey(s, locale)),
    });
  }
  const links: Link[] = [];
  for (const e of raw['edges'] as readonly unknown[]) {
    if (!isRecord(e)) return err('malformed edge');
    const source = parseConceptId(e['source']);
    const target = parseConceptId(e['target']);
    const type = e['type'];
    if (
      !source.ok ||
      !target.ok ||
      !isRelationType(type) ||
      !concepts.has(source.value) ||
      !concepts.has(target.value)
    ) {
      return err(`malformed edge ${show(e)}`);
    }
    links.push({ type, source: source.value, target: target.value });
  }
  const ids = [...concepts.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const broaderOf = new Map<ConceptId, ConceptId[]>();
  for (const l of links)
    if (l.type === 'broader') broaderOf.set(l.source, [...(broaderOf.get(l.source) ?? []), l.target]);
  const taxonomy = buildTaxonomy(
    ids,
    (id) => broaderOf.get(id) ?? [],
    (id) => concepts.get(id)?.category,
  );
  return ok({ locale, ids, concepts, links, taxonomy, ic: intrinsicInformationContent(taxonomy) });
};

/** Concepts whose label or alt label contains the query (accent- and case-insensitive), in id order. */
export const searchConcepts = (model: ClientModel, query: string): readonly ConceptId[] => {
  const q = searchKey(query, model.locale);
  if (q.length === 0) return [];
  return model.ids.filter((id) => model.concepts.get(id)?.keys.some((k) => k.includes(q)) === true);
};
