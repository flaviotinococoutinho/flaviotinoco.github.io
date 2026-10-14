/**
 * TSV tokenizer for the lexicon sources (pure, total).
 *
 * Why TSV and not YAML: YAML 1.1 implicit typing reads `no`, `yes`, `on`, `off`
 * as booleans and `1e3` as a number (the "Norway problem": the country code NO
 * becomes `false`). A dictionary of words cannot afford a format that silently
 * reinterprets words. In this TSV every field is a string; meaning is assigned
 * only by the explicit schema of each file (parse.ts).
 *
 * Grammar (one record per line, LF or CRLF):
 *   file    = *(blank / comment) header *(blank / comment / record)
 *   comment = "#" *char                ; only at column 1 — a '#' inside a field is data ("C#")
 *   blank   = empty line
 *   header  = name *(TAB name)          ; first non-comment, non-blank line
 *   record  = field *(TAB field)        ; same number of fields as the header
 * A leading U+FEFF (byte-order mark) is ignored. Fields are NOT trimmed:
 * stray whitespace is reported by the schema, never silently removed.
 */

export interface TsvField {
  readonly value: string;
  /** 1-based column (UTF-16 code units) where the field starts. */
  readonly column: number;
}

export interface TsvLine {
  /** 1-based line number. */
  readonly line: number;
  readonly fields: readonly TsvField[];
}

export interface TsvDocument {
  readonly header: TsvLine | undefined;
  readonly records: readonly TsvLine[];
}

const splitFields = (text: string): readonly TsvField[] => {
  const fields: TsvField[] = [];
  let column = 1;
  for (const value of text.split('\t')) {
    fields.push({ value, column });
    column += value.length + 1;
  }
  return fields;
};

export const tokenizeTsv = (source: string): TsvDocument => {
  const text = source.startsWith('\ufeff') ? source.slice(1) : source;
  const lines = text.split('\n');
  let header: TsvLine | undefined;
  const records: TsvLine[] = [];
  lines.forEach((raw, index) => {
    const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (content === '' || content.startsWith('#')) return;
    const line: TsvLine = { line: index + 1, fields: splitFields(content) };
    if (header === undefined) header = line;
    else records.push(line);
  });
  return { header, records };
};
