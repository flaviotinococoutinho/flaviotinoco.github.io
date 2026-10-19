/**
 * `ft lexicon add` — a new dictionary row, appended without touching the
 * existing lines (pure).
 *
 * The row follows the header of its file (LEXICON_COLUMNS of the core parser);
 * the file keeps its line ending (LF or CRLF) and its final newline; rows added
 * by the CLI go under one comment section at the end, so the author can move
 * them into the thematic section later. Validation is NOT done here: the
 * command re-parses every dictionary with the new text through parseLexicon
 * (the build's parser) and writes only if that succeeds.
 */
import { LEXICON_COLUMNS, LEXICON_FILES } from '../../src/core/lexicon/parse.ts';
import type { EntryKind } from '../../src/core/lexicon/types.ts';

export type AddableKind = Exclude<EntryKind, 'homograph'>;
export const ADDABLE_KINDS: readonly AddableKind[] = ['foreign', 'latin', 'proper', 'acronym'];

/** The dictionary file of each kind (inverse of LEXICON_FILES). */
export const fileOfKind = (kind: EntryKind): string =>
  Object.entries(LEXICON_FILES).find(([, k]) => k === kind)?.[0] ?? `${kind}.tsv`;

export interface NewRow {
  readonly kind: AddableKind;
  readonly term: string;
  readonly lang: string;
  readonly casePolicy: string;
  readonly variants: readonly string[];
  readonly vernacularIn: readonly string[];
  readonly note: string;
  readonly category: string;
  readonly expansionPt: string;
  readonly expansionEn: string;
  readonly expansionLang: string;
}

/** A field that would break the TSV structure (tab, line break) — rejected before anything is built. */
export const breaksTsv = (value: string): boolean => /[\t\r\n]/u.test(value);

/** The row's fields in the column order of its file. */
export const rowFields = (row: NewRow): readonly string[] => {
  const value: Readonly<Record<string, string>> = {
    term: row.term.normalize('NFC'),
    lang: row.lang,
    case: row.casePolicy,
    variants: row.variants.join('|'),
    vernacular_in: row.vernacularIn.join(' '),
    note: row.note,
    category: row.category,
    expansion_pt: row.expansionPt,
    expansion_en: row.expansionEn,
    lang_of_expansion: row.expansionLang,
  };
  return LEXICON_COLUMNS[row.kind].map((c) => value[c] ?? '');
};

/** The comment line that opens the CLI's section at the end of a dictionary file. */
export const SECTION = '# --- acrescentados por `ft lexicon add` (revisar e mover para a seção temática) ---';

/** The new file text and the 1-based line number of the new row. */
export const appendRow = (text: string, fields: readonly string[]): { readonly text: string; readonly line: number } => {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = text === '' || text.endsWith('\n') ? text : `${text}${eol}`;
  const lines = out.split(/\r?\n/u);
  if (!lines.some((l) => l === SECTION)) out += `${SECTION}${eol}`;
  out += `${fields.join('\t')}${eol}`;
  const line = out.split(/\r?\n/u).length - 1;
  return { text: out, line };
};
