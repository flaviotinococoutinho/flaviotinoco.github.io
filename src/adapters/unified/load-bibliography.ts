/**
 * Loads the bibliography for the Markdown pipeline (imperative shell).
 *
 * Reads every `bibliography/*.bib` under the project root (sorted by name, so
 * the result does not depend on directory order), parses them with the pure
 * parser of the core and returns its immutable index. Any error in any file
 * fails the build with the COMPLETE list of problems ("file:line:column:
 * severity: message [code]"), never with a partially loaded bibliography.
 * Warnings (e.g. an unknown LaTeX command kept verbatim) are printed once.
 */
import { readdir, readFile } from 'node:fs/promises';
import {
  EMPTY_BIBLIOGRAPHY,
  buildBibliography,
  formatDiagnostic,
  type BibliographyIndex,
} from '../../core/bibliography/index.ts';

export type { BibliographyIndex } from '../../core/bibliography/index.ts';

const isMissing = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { readonly code: unknown }).code === 'ENOENT';

export const loadBibliography = async (root: URL): Promise<BibliographyIndex> => {
  const dir = new URL('bibliography/', root);
  let names: readonly string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.bib')).sort();
  } catch (e: unknown) {
    if (isMissing(e)) return EMPTY_BIBLIOGRAPHY;
    throw e;
  }
  const sources = await Promise.all(
    names.map(async (name) => ({ name: `bibliography/${name}`, text: await readFile(new URL(name, dir), 'utf8') })),
  );
  const result = buildBibliography(sources);
  if (!result.ok) {
    const lines = result.error.map(formatDiagnostic);
    const errors = result.error.filter((d) => d.severity === 'error').length;
    throw new Error(`bibliography: ${errors} error(s) in ${names.join(', ')}\n${lines.join('\n')}`);
  }
  for (const warning of result.value.warnings) console.warn(formatDiagnostic(warning));
  return result.value;
};
