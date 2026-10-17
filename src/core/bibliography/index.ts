/**
 * The bibliography as a whole: several .bib sources → one immutable index
 * (pure; the shell reads the files and decides how to report).
 *
 * Every lexical, syntactic, database and model problem of every source is
 * accumulated with its file and position (applicative validation), so a broken
 * bibliography fails the build ONCE with the complete list. Keys must be unique
 * across sources (case-insensitively, as within one file).
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { CitationKey } from '../domain/identifiers.ts';
import { parseCst } from './bibtex/cst.ts';
import { buildDatabase } from './bibtex/database.ts';
import { byPosition, error, formatPoint, isError, type Diagnostic } from './bibtex/source.ts';
import { toReference } from './model/from-entry.ts';
import type { Reference } from './model/reference.ts';

export type BibSource = { readonly name: string; readonly text: string };

export type LocatedDiagnostic = Diagnostic & { readonly source: string };

/** Read-only view of the parsed bibliography. */
export type BibliographyIndex = {
  /** Citation keys in source order. */
  readonly keys: readonly CitationKey[];
  readonly size: number;
  readonly has: (key: string) => boolean;
  readonly get: (key: string) => Reference | undefined;
  /** Non-fatal problems (unknown LaTeX commands kept verbatim…). */
  readonly warnings: readonly LocatedDiagnostic[];
};

const indexOf = (references: readonly Reference[], warnings: readonly LocatedDiagnostic[]): BibliographyIndex => {
  const byKey = new Map<string, Reference>(references.map((r) => [r.key, r]));
  return Object.freeze({
    keys: Object.freeze(references.map((r) => r.key)),
    size: byKey.size,
    has: (key: string) => byKey.has(key),
    get: (key: string) => byKey.get(key),
    warnings: Object.freeze([...warnings]),
  });
};

export const EMPTY_BIBLIOGRAPHY: BibliographyIndex = indexOf([], []);

/** Builds an index from in-memory references (tests, fixtures). */
export const indexReferences = (references: readonly Reference[]): BibliographyIndex => indexOf(references, []);

export const buildBibliography = (
  sources: readonly BibSource[],
): Result<BibliographyIndex, readonly LocatedDiagnostic[]> => {
  const problems: LocatedDiagnostic[] = [];
  const references: Reference[] = [];
  const seen = new Map<string, { readonly source: string; readonly diagnostic: Diagnostic['span'] }>();
  for (const source of sources) {
    const located = (d: Diagnostic): LocatedDiagnostic => ({ ...d, source: source.name });
    const { cst, diagnostics: syntax } = parseCst(source.text);
    const { database, diagnostics: semantic } = buildDatabase(cst);
    const local: Diagnostic[] = [...syntax, ...semantic];
    for (const entry of database.entries) {
      const folded = entry.key.toLowerCase();
      const first = seen.get(folded);
      if (first !== undefined) {
        local.push(
          error(
            'db:duplicate-key',
            `duplicate key "${entry.key}" (first defined in ${first.source}:${formatPoint(first.diagnostic.start)})`,
            entry.keySpan,
          ),
        );
        continue;
      }
      seen.set(folded, { source: source.name, diagnostic: entry.keySpan });
      const converted = toReference(entry);
      if (converted.ok) {
        references.push(converted.value.reference);
        local.push(...converted.value.warnings);
      } else {
        local.push(...converted.error);
      }
    }
    problems.push(...local.sort(byPosition).map(located));
  }
  return problems.some(isError) ? err(problems) : ok(indexOf(references, problems));
};

/** "bibliography/main.bib:12:5: error: … [model:missing-field]" — the conventional compiler format. */
export const formatDiagnostic = (d: LocatedDiagnostic): string =>
  `${d.source}:${formatPoint(d.span.start)}: ${d.severity}: ${d.message} [${d.code}]`;

// ---------------------------------------------------------------------------
// Public API for the other parts of the site (views, feeds, JSON-LD).
// ---------------------------------------------------------------------------

export type { Reference, CalendarDate } from './model/reference.ts';
export type { CitationStyle, CitationMode } from './style/style.ts';
export type { Inline } from './render/inline.ts';
export { toHtml, toPlainText } from './render/inline.ts';
export { abnt, abntStyle } from './style/abnt.ts';
export { apa } from './style/apa.ts';
export { STYLES, styleFor } from './style/styles.ts';
export {
  SITE_AUTHOR,
  citeSelf,
  type SelfCitation,
  type SelfCitationOptions,
  type SiteAuthor,
  type SiteWork,
} from './self.ts';
export { SCHEMA_CONTEXT, schemaCitations, toSchemaOrg, type JsonValue, type SchemaNode } from './schema-org.ts';
export { toBibtex, toBibtexFile } from './bibtex/encode.ts';
