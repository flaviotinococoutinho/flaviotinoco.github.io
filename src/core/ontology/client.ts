/**
 * Client payload codec — the compact, single-locale view of the ontology that
 * the explorer islands receive as an inert JSON data block.
 *
 *   encode : ConceptGraph × Locale × href → ClientOntology       (build time)
 *   decode : unknown → Result<ClientModel, string>              (browser)
 *
 * The browser rebuilds the hierarchy and the intrinsic IC with the SAME core
 * functions as the build (deriveHierarchy, intrinsicInformationContent), so the
 * "compare" tool and the concept pages can never disagree. Law (tested): the
 * hierarchy and IC decoded on the client equal those of the build.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { parseConceptId, type ConceptId } from '../domain/identifiers.ts';
import { isLocale, type Locale } from '../domain/locale.ts';
import { isStratum, type Stratum } from '../domain/strata.ts';
import type { ConceptGraph } from './graph.ts';
import { deriveHierarchy, type Hierarchy } from './hierarchy.ts';
import { intrinsicInformationContent, type InformationContent } from './measures.ts';
import { searchKey } from './text.ts';

export interface ClientConcept {
  readonly id: string;
  readonly label: string;
  readonly alt: readonly string[];
  readonly definition: string;
  readonly stratum: Stratum;
  readonly broader: readonly string[];
  readonly related: readonly string[];
  readonly href: string;
}

export interface ClientOntology {
  readonly locale: Locale;
  readonly concepts: readonly ClientConcept[];
}

export interface ClientConceptModel extends Omit<ClientConcept, 'id' | 'broader' | 'related'> {
  readonly id: ConceptId;
  readonly broader: readonly ConceptId[];
  readonly related: readonly ConceptId[];
  /** Accent- and case-insensitive keys of the label and alt labels (search). */
  readonly keys: readonly string[];
}

export interface ClientModel {
  readonly locale: Locale;
  readonly concepts: ReadonlyMap<ConceptId, ClientConceptModel>;
  readonly hierarchy: Hierarchy<ConceptId>;
  readonly ic: InformationContent<ConceptId>;
}

export const encodeClientOntology = (graph: ConceptGraph, locale: Locale, href: (id: ConceptId) => string): ClientOntology => ({
  locale,
  concepts: graph.ids.flatMap((id) => {
    const e = graph.concepts.get(id);
    if (e === undefined) return [];
    return [
      {
        id,
        label: e.prefLabel[locale],
        alt: e.altLabel[locale],
        definition: e.definition[locale],
        stratum: e.stratum,
        broader: graph.hierarchy.broader.get(id) ?? [],
        related: graph.related.get(id) ?? [],
        href: href(id),
      },
    ];
  }),
});

/**
 * Serialises a payload for embedding in <script type="application/json">.
 * "<" is escaped as < so the data can never close the script element
 * (HTML §4.12.1.3 restrictions for contents of script elements); JSON.parse
 * restores it exactly.
 */
export const serializeClientOntology = (payload: ClientOntology): string => JSON.stringify(payload).replace(/</g, '\\u003c');

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export const decodeClientOntology = (raw: unknown): Result<ClientModel, string> => {
  if (!isRecord(raw) || !isLocale(raw['locale']) || !Array.isArray(raw['concepts'])) return err('malformed ontology payload');
  const locale = raw['locale'];
  const concepts = new Map<ConceptId, ClientConceptModel>();
  for (const c of raw['concepts'] as readonly unknown[]) {
    if (!isRecord(c)) return err('malformed concept');
    const id = parseConceptId(c['id']);
    const { label, definition, href, stratum, alt, broader, related } = c;
    if (!id.ok || typeof label !== 'string' || typeof definition !== 'string' || typeof href !== 'string' || !isStratum(stratum)) {
      return err(`malformed concept ${JSON.stringify(c['id'])}`);
    }
    if (!isStringArray(alt) || !isStringArray(broader) || !isStringArray(related)) return err(`malformed relations of ${id.value}`);
    const ids = (xs: readonly string[]): readonly ConceptId[] =>
      xs.flatMap((x) => {
        const r = parseConceptId(x);
        return r.ok ? [r.value] : [];
      });
    concepts.set(id.value, {
      id: id.value,
      label,
      alt,
      definition,
      stratum,
      href,
      broader: ids(broader),
      related: ids(related),
      keys: [label, ...alt].map((s) => searchKey(s, locale)),
    });
  }
  const hierarchy = deriveHierarchy([...concepts.keys()], (id) => concepts.get(id)?.broader ?? []);
  return ok({ locale, concepts, hierarchy, ic: intrinsicInformationContent(hierarchy) });
};

/** Concepts whose label or alt label contains the query (accent- and case-insensitive), in id order. */
export const searchConcepts = (model: ClientModel, query: string): readonly ConceptId[] => {
  const q = searchKey(query, model.locale);
  if (q.length === 0) return [];
  return [...model.concepts.values()].filter((c) => c.keys.some((k) => k.includes(q))).map((c) => c.id);
};
