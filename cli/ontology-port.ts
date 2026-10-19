/**
 * The ONE place where `ft` meets the ontology (port + stand-in adapter).
 *
 * `ft ontology` and the concept check of `ft lint` consume only the
 * `OntologyView` below, obtained from `loadOntology(root, fs)`. The ontology
 * core (src/core/ontology/) is being rewritten on another branch (typed
 * relation topology, categories, tools as accidents); the base this CLI was
 * written on has no src/core/ontology/index.ts, so `loadOntology` is
 * implemented here against the concept files themselves
 * (src/content/concepts/*.json, schema of src/content.config.ts: prefLabel,
 * definition, stratum, broader, related), with small pure measures.
 *
 * REBINDING (integration): replace the body of `loadOntology` with
 *   readRawConcepts(dir)                       → raws        (src/adapters/unified/load-concepts.ts)
 *   buildOntology(raws)                        → Result<Ontology, OntologyError[]>   (describeError for messages)
 *   deriveHierarchy / findCycles / maxDepth    → cycles, depth
 *   intrinsicInformationContent(hierarchy)     → informationContent
 *   closestByLin(hierarchy, ic, id, n)         → closest
 *   ontologyStats(ontology).stratumEntropy     → stratumEntropy
 * keeping the OntologyView shape; nothing else in cli/ changes.
 *
 * Measures of the stand-in (all deterministic):
 *   depth(c)  longest chain of `broader` links from c to a top concept (top = 0);
 *   IC(c)     intrinsic information content, Seco, Veale & Hayes (2004):
 *             IC(c) = 1 − log(hypo(c) + 1) / log(N), hypo = number of descendants;
 *   sim(a,b)  Lin (1998): 2·IC(lcs) / (IC(a) + IC(b)), lcs = the common
 *             ancestor-or-self of maximal IC (0 when there is none);
 *   H(strata) Shannon entropy, in bits, of the distribution of concepts over the
 *             four strata (maximum log₂ 4 = 2 bits).
 */
import { join } from 'node:path';
import { err, ok, type Result } from '../src/core/algebra/result.ts';
import { show } from '../src/core/algebra/show.ts';
import { parseConceptId } from '../src/core/domain/identifiers.ts';
import { LOCALES, type Locale } from '../src/core/domain/locale.ts';
import { parseStratum, STRATA, type Stratum } from '../src/core/domain/strata.ts';
import type { Fs } from './io.ts';

export const CONCEPTS_DIR = join('src', 'content', 'concepts');

export interface ConceptView {
  readonly id: string;
  readonly prefLabel: Readonly<Record<Locale, string>>;
  readonly definition: Readonly<Record<Locale, string>>;
  readonly stratum: Stratum;
  readonly broader: readonly string[];
  readonly related: readonly string[];
}

export interface Neighbour {
  readonly id: string;
  readonly similarity: number;
}

export interface OntologyView {
  /** Concept ids in a stable (alphabetical) order. */
  readonly ids: readonly string[];
  readonly get: (id: string) => ConceptView | undefined;
  /** Derived inverse of broader (never stored: SKOS narrower). */
  readonly narrower: (id: string) => readonly string[];
  readonly depth: (id: string) => number;
  readonly maxDepth: number;
  readonly informationContent: (id: string) => number;
  readonly closest: (id: string, n: number) => readonly Neighbour[];
  readonly strata: Readonly<Record<Stratum, number>>;
  readonly stratumEntropy: number;
  readonly edges: { readonly broader: number; readonly related: number };
  /** Non-fatal observations (unknown keys kept for forward compatibility…). */
  readonly notes: readonly string[];
}

export interface OntologyProblem {
  readonly file: string;
  readonly message: string;
}

type Raw = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

const localized = (v: unknown): Record<Locale, string> | undefined => {
  if (!isRecord(v)) return undefined;
  const out: Partial<Record<Locale, string>> = {};
  for (const l of LOCALES) {
    const s = v[l];
    if (typeof s !== 'string' || s === '') return undefined;
    out[l] = s;
  }
  return out as Record<Locale, string>;
};

const idList = (v: unknown): readonly string[] | undefined =>
  v === undefined ? [] : Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as readonly string[]) : undefined;

/** Keys of the base schema, plus the fields the typed ontology adds (read, not required). */
const KNOWN_KEYS = new Set([
  'slug',
  'prefLabel',
  'altLabel',
  'definition',
  'notation',
  'stratum',
  'domains',
  'broader',
  'related',
  'exactMatch',
  'sources',
  'category',
  'relations',
]);

/** Parses one concept file (applicative: every problem of the file). */
export const parseConcept = (id: string, data: unknown): Result<ConceptView, readonly string[]> => {
  const problems: string[] = [];
  if (!parseConceptId(id).ok) problems.push(`invalid concept id "${id}" (file name)`);
  if (!isRecord(data)) return err([...problems, 'a concept file must hold a JSON object']);
  const prefLabel = localized(data['prefLabel']);
  if (prefLabel === undefined) problems.push('prefLabel must give a non-empty label for pt-BR and en');
  const definition = localized(data['definition']);
  if (definition === undefined) problems.push('definition must give a non-empty text for pt-BR and en');
  const stratum = parseStratum(data['stratum']);
  if (!stratum.ok) problems.push(stratum.error);
  const broader = idList(data['broader']);
  if (broader === undefined) problems.push('broader must be a list of concept ids');
  const relatedRaw = idList(data['related']);
  if (relatedRaw === undefined) problems.push('related must be a list of concept ids');
  const relations = data['relations'];
  const typedTargets =
    Array.isArray(relations) && relations.every((r) => isRecord(r) && typeof r['target'] === 'string')
      ? (relations as readonly Raw[]).map((r) => r['target'] as string)
      : relations === undefined
        ? []
        : undefined;
  if (typedTargets === undefined) problems.push('relations must be a list of {type, target}');
  if (problems.length > 0 || prefLabel === undefined || definition === undefined || !stratum.ok) return err(problems);
  return ok({
    id,
    prefLabel,
    definition,
    stratum: stratum.value,
    broader: broader ?? [],
    related: [...(relatedRaw ?? []), ...(typedTargets ?? [])],
  });
};

/** Every cycle of the broader relation (each as the list of ids along it), by depth-first search. */
export const broaderCycles = (concepts: ReadonlyMap<string, ConceptView>): readonly (readonly string[])[] => {
  const state = new Map<string, 'open' | 'done'>();
  const cycles: string[][] = [];
  const stack: string[] = [];
  const visit = (id: string): void => {
    state.set(id, 'open');
    stack.push(id);
    for (const b of concepts.get(id)?.broader ?? []) {
      if (!concepts.has(b)) continue;
      const s = state.get(b);
      if (s === 'open') cycles.push([...stack.slice(stack.indexOf(b)), b]);
      else if (s === undefined) visit(b);
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const id of [...concepts.keys()].sort()) if (!state.has(id)) visit(id);
  return cycles;
};

const log2 = (x: number): number => Math.log(x) / Math.LN2;

/** Builds the view from parsed concepts (pure; assumes no cycle and no unknown reference). */
export const ontologyView = (concepts: ReadonlyMap<string, ConceptView>, notes: readonly string[]): OntologyView => {
  const ids = [...concepts.keys()].sort();
  const narrowerMap = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const id of ids) for (const b of concepts.get(id)?.broader ?? []) narrowerMap.get(b)?.push(id);
  const depthMemo = new Map<string, number>();
  const depth = (id: string): number => {
    const hit = depthMemo.get(id);
    if (hit !== undefined) return hit;
    const parents = (concepts.get(id)?.broader ?? []).filter((b) => concepts.has(b));
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth));
    depthMemo.set(id, d);
    return d;
  };
  const ancestorsMemo = new Map<string, ReadonlySet<string>>();
  const ancestors = (id: string): ReadonlySet<string> => {
    const hit = ancestorsMemo.get(id);
    if (hit !== undefined) return hit;
    const out = new Set<string>([id]);
    for (const b of concepts.get(id)?.broader ?? []) if (concepts.has(b)) for (const a of ancestors(b)) out.add(a);
    ancestorsMemo.set(id, out);
    return out;
  };
  const descendants = (id: string): number => {
    const seen = new Set<string>();
    const go = (x: string): void => {
      for (const c of narrowerMap.get(x) ?? []) {
        if (!seen.has(c)) {
          seen.add(c);
          go(c);
        }
      }
    };
    go(id);
    return seen.size;
  };
  const n = ids.length;
  const ic = new Map<string, number>(
    ids.map((id) => [id, n <= 1 ? 1 : 1 - Math.log(descendants(id) + 1) / Math.log(n)]),
  );
  const icOf = (id: string): number => ic.get(id) ?? 0;
  const lin = (a: string, b: string): number => {
    const common = [...ancestors(a)].filter((x) => ancestors(b).has(x));
    if (common.length === 0) return 0;
    const lcs = Math.max(...common.map(icOf));
    const denominator = icOf(a) + icOf(b);
    return denominator === 0 ? (a === b ? 1 : 0) : (2 * lcs) / denominator;
  };
  const strata = Object.fromEntries(STRATA.map((s) => [s, 0])) as Record<Stratum, number>;
  for (const id of ids) {
    const c = concepts.get(id);
    if (c !== undefined) strata[c.stratum] += 1;
  }
  const entropy =
    n === 0
      ? 0
      : -STRATA.map((s) => strata[s] / n)
          .filter((p) => p > 0)
          .reduce((acc, p) => acc + p * log2(p), 0);
  let broaderEdges = 0;
  let relatedEdges = 0;
  for (const id of ids) {
    broaderEdges += concepts.get(id)?.broader.length ?? 0;
    relatedEdges += concepts.get(id)?.related.length ?? 0;
  }
  return {
    ids,
    get: (id) => concepts.get(id),
    narrower: (id) => narrowerMap.get(id) ?? [],
    depth,
    maxDepth: ids.length === 0 ? 0 : Math.max(...ids.map(depth)),
    informationContent: icOf,
    closest: (id, k) =>
      ids
        .filter((other) => other !== id)
        .map((other) => ({ id: other, similarity: lin(id, other) }))
        .filter((x) => x.similarity > 0)
        .sort((x, y) => y.similarity - x.similarity || (x.id < y.id ? -1 : 1))
        .slice(0, k),
    strata,
    stratumEntropy: entropy,
    edges: { broader: broaderEdges, related: relatedEdges },
    notes,
  };
};

/**
 * Loads and validates the concept scheme of a project. `undefined` when the
 * project has no concept directory (the ontology is not part of it yet).
 */
export const loadOntology = async (
  root: string,
  fs: Fs,
): Promise<Result<OntologyView, readonly OntologyProblem[]> | undefined> => {
  const dir = join(root, CONCEPTS_DIR);
  if (!(await fs.isDirectory(dir))) return undefined;
  const problems: OntologyProblem[] = [];
  const notes: string[] = [];
  const concepts = new Map<string, ConceptView>();
  for (const name of await fs.list(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = join(CONCEPTS_DIR, name).split('\\').join('/');
    const id = name.slice(0, -'.json'.length);
    let data: unknown;
    try {
      data = JSON.parse(await fs.readText(join(dir, name)));
    } catch (e: unknown) {
      problems.push({ file, message: `invalid JSON: ${e instanceof Error ? e.message : show(e)}` });
      continue;
    }
    if (isRecord(data)) {
      const extra = Object.keys(data).filter((k) => !KNOWN_KEYS.has(k));
      if (extra.length > 0) notes.push(`${file}: unknown field(s) ${extra.join(', ')}`);
    }
    const parsed = parseConcept(id, data);
    if (parsed.ok) concepts.set(id, parsed.value);
    else for (const message of parsed.error) problems.push({ file, message });
  }
  for (const c of concepts.values()) {
    const file = join(CONCEPTS_DIR, `${c.id}.json`).split('\\').join('/');
    for (const b of c.broader) if (!concepts.has(b)) problems.push({ file, message: `broader: unknown concept "${b}"` });
    for (const r of c.related) if (!concepts.has(r)) problems.push({ file, message: `related: unknown concept "${r}"` });
    if (c.broader.includes(c.id)) problems.push({ file, message: 'a concept cannot be broader than itself' });
  }
  for (const cycle of broaderCycles(concepts)) {
    if (cycle.length > 2) {
      problems.push({
        file: join(CONCEPTS_DIR, `${cycle[0] ?? ''}.json`).split('\\').join('/'),
        message: `cycle in broader: ${cycle.join(' → ')}`,
      });
    }
  }
  return problems.length > 0 ? err(problems) : ok(ontologyView(concepts, notes));
};
