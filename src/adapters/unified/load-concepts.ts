/**
 * Build-time loader of the concept scheme (imperative shell).
 *
 * Reads src/content/concepts/*.json with node:fs, hands the decoded values to
 * the pure core (parse → validate → derive → measure) and FAILS THE BUILD with
 * every validation error at once (applicative validation), never with a
 * partially valid scheme. Topological warnings (redundant broader edges,
 * excessive polyhierarchy) are printed but do not stop the build.
 *
 * The result is the index the Markdown stage needs: the full ontology (for
 * concept maps), a summary per concept (slug per locale, labels, definition,
 * stratum, category) and the label lookup used by `:concept[label]` without
 * an id (NFC, case-insensitive, per locale; see src/core/ontology/labels.ts).
 */
import { readdir, readFile } from 'node:fs/promises';
import type { ConceptId, Slug } from '../../core/domain/identifiers.ts';
import type { Locale } from '../../core/domain/locale.ts';
import type { Stratum } from '../../core/domain/strata.ts';
import {
  buildOntology,
  describeError,
  describeWarning,
  lookupLabel,
  type Category,
  type LabelLookup,
  type Localized,
  type Ontology,
  type RawConcept,
} from '../../core/ontology/index.ts';

export interface ConceptSummary {
  readonly id: ConceptId;
  readonly slug: Localized<Slug>;
  readonly prefLabel: Localized<string>;
  readonly altLabel: Localized<readonly string[]>;
  readonly definition: Localized<string>;
  readonly stratum: Stratum;
  readonly category: Category;
}

export interface ConceptIndex {
  readonly ontology: Ontology;
  readonly entries: ReadonlyMap<ConceptId, ConceptSummary>;
  /** Resolves a label (prefLabel or altLabel) in a locale: found, unknown (with suggestions) or ambiguous. */
  readonly lookup: (label: string, locale: Locale) => LabelLookup;
}

/** Directory of the concept files, relative to the project root. */
export const CONCEPTS_DIR = 'src/content/concepts/';

/** Reads every *.json file of a directory as a raw concept (id = file name without extension). */
export const readRawConcepts = async (dir: URL): Promise<readonly RawConcept[]> => {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(new URL(file, dir), 'utf8');
      try {
        return { id: file.slice(0, -'.json'.length), data: JSON.parse(text) as unknown };
      } catch (e: unknown) {
        throw new Error(`concepts: ${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
};

/** Builds the index from raw concepts, throwing one error that lists every problem. */
export const indexConcepts = (raws: readonly RawConcept[], warn: (message: string) => void = console.warn): ConceptIndex => {
  const built = buildOntology(raws);
  if (!built.ok) {
    const lines = built.error.map((e) => `  - ${describeError(e)}`);
    throw new Error(`concepts: ${String(built.error.length)} problem(s) in ${CONCEPTS_DIR}\n${lines.join('\n')}`);
  }
  const ontology = built.value;
  for (const w of ontology.graph.warnings) warn(`[concepts] ${describeWarning(w)}`);
  const entries = new Map<ConceptId, ConceptSummary>(
    ontology.graph.ids.flatMap((id) => {
      const e = ontology.graph.concepts.get(id);
      return e === undefined
        ? []
        : [
            [
              id,
              {
                id,
                slug: e.slug,
                prefLabel: e.prefLabel,
                altLabel: e.altLabel,
                definition: e.definition,
                stratum: e.stratum,
                category: e.category,
              },
            ] as const,
          ];
    }),
  );
  return { ontology, entries, lookup: (label, locale) => lookupLabel(ontology.labels, label, locale) };
};

/** Loads and validates src/content/concepts/*.json relative to the project root. */
export const loadConcepts = async (root: URL): Promise<ConceptIndex> =>
  indexConcepts(await readRawConcepts(new URL(CONCEPTS_DIR, root)));
