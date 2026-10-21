/**
 * Build-time loader of the formula registry (imperative shell).
 *
 * Reads src/content/formulas/*.json with node:fs, hands the decoded values to
 * the pure core (parse → check references → index) and FAILS THE BUILD with
 * every error at once, never with a partial registry. The concepts and the
 * bibliography are the references a formula may point to.
 */
import { readdir, readFile } from 'node:fs/promises';
import {
  buildFormulaRegistry,
  type ConceptFacts,
  type FormulaRegistry,
  type RawFormula,
} from '../../core/formulas/index.ts';
import type { BibliographyIndex } from './load-bibliography.ts';
import type { ConceptIndex } from './load-concepts.ts';

/** Directory of the formula files, relative to the project root. */
export const FORMULAS_DIR = 'src/content/formulas/';

/** Reads every *.json file of a directory as a raw formula (id = file name without extension). */
export const readRawFormulas = async (dir: URL): Promise<readonly RawFormula[]> => {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(new URL(file, dir), 'utf8');
      try {
        return { id: file.slice(0, -'.json'.length), data: JSON.parse(text) as unknown };
      } catch (e: unknown) {
        throw new Error(`${FORMULAS_DIR}${file}: invalid JSON (${e instanceof Error ? e.message : String(e)})`, {
          cause: e,
        });
      }
    }),
  );
};

/** Stratum and domains of every concept, the facts a formula bound to a concept inherits. */
export const conceptFacts = (concepts: ConceptIndex): ReadonlyMap<string, ConceptFacts> =>
  new Map(
    concepts.ontology.graph.ids.flatMap((id) => {
      const c = concepts.ontology.graph.concepts.get(id);
      return c === undefined ? [] : [[id, { stratum: c.stratum, domains: c.domains }] as const];
    }),
  );

export const loadFormulas = async (
  root: URL,
  concepts: ConceptIndex,
  bibliography: BibliographyIndex,
): Promise<FormulaRegistry> => {
  const raw = await readRawFormulas(new URL(FORMULAS_DIR, root));
  const built = buildFormulaRegistry(raw, { concepts: conceptFacts(concepts), sources: bibliography });
  if (!built.ok) {
    throw new Error(
      `formulas: ${String(built.error.length)} error(s) in ${FORMULAS_DIR}\n  ${built.error.join('\n  ')}`,
    );
  }
  return built.value;
};
