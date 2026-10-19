/**
 * The static sources of a project read through the injected Fs (shell):
 * lexicon/*.tsv and bibliography/*.bib, parsed by the pure parsers of the core
 * with the same file naming as the build loaders
 * (src/adapters/unified/load-lexicon.ts, load-bibliography.ts).
 */
import { join } from 'node:path';
import {
  buildBibliography,
  formatDiagnostic,
  type BibliographyIndex,
  type LocatedDiagnostic,
} from '../src/core/bibliography/index.ts';
import { err, ok, type Result } from '../src/core/algebra/result.ts';
import { parseLexicon, type LexiconSource } from '../src/core/lexicon/parse.ts';
import type { Lexicon, LexiconIssue } from '../src/core/lexicon/types.ts';
import type { Fs } from './io.ts';

export const LEXICON_DIR = 'lexicon';
export const BIBLIOGRAPHY_DIR = 'bibliography';

/** lexicon/*.tsv in name order. */
export const readLexiconSources = async (root: string, fs: Fs): Promise<readonly LexiconSource[]> => {
  const dir = join(root, LEXICON_DIR);
  const names = (await fs.list(dir)).filter((n) => n.endsWith('.tsv'));
  return Promise.all(names.map(async (name) => ({ name, text: await fs.readText(join(dir, name)) })));
};

export const loadLexicon = async (
  root: string,
  fs: Fs,
): Promise<{ readonly sources: readonly LexiconSource[]; readonly result: Result<Lexicon, readonly LexiconIssue[]> }> => {
  const sources = await readLexiconSources(root, fs);
  return { sources, result: parseLexicon(sources) };
};

export interface LoadedBibliography {
  readonly index: BibliographyIndex;
  readonly files: readonly string[];
  readonly warnings: readonly LocatedDiagnostic[];
}

/** bibliography/*.bib in name order; errors are rendered "file:line:column: severity: message [code]". */
export const loadBibliographySources = async (
  root: string,
  fs: Fs,
): Promise<Result<LoadedBibliography, readonly string[]>> => {
  const dir = join(root, BIBLIOGRAPHY_DIR);
  const names = (await fs.list(dir)).filter((n) => n.endsWith('.bib'));
  const sources = await Promise.all(
    names.map(async (name) => ({ name: `${BIBLIOGRAPHY_DIR}/${name}`, text: await fs.readText(join(dir, name)) })),
  );
  const built = buildBibliography(sources);
  if (!built.ok) return err(built.error.map(formatDiagnostic));
  return ok({ index: built.value, files: names.map((n) => join(dir, n)), warnings: built.value.warnings });
};
