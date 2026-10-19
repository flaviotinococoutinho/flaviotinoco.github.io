/**
 * A content file read exactly as Astro's content layer reads it (shell).
 *
 * Astro 7 (astro/dist/vite-plugin-markdown/content-entry-type.js and the glob
 * loader) parses the frontmatter with @astrojs/internal-helpers'
 * parseFrontmatter(contents, { frontmatter: 'empty-with-spaces' }) — YAML 1.2
 * core schema, merge keys, timestamps as dates — and hands the Markdown
 * processor `content.trim()` as the body and the RAW frontmatter object (not
 * the schema's output) as `file.data.astro.frontmatter`. The same function,
 * re-exported by @astrojs/markdown-remark, is used here, so `ft lint` sees the
 * very input of the build. Positions of the body are converted to file
 * coordinates with the line offset of src/adapters/unified/source-lines.ts.
 */
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { LineCounter, parseDocument, type Document } from 'yaml';
import { err, ok, type Result } from '../../src/core/algebra/result.ts';
import { lineOffset } from '../../src/adapters/unified/source-lines.ts';

/** The YAML options of @astrojs/internal-helpers/yaml (parseYaml). */
const ASTRO_YAML = { customTags: ['timestamp'], merge: true, schema: 'core' } as const;

export interface ContentDocument {
  readonly path: string;
  readonly raw: string;
  /** The untyped frontmatter mapping (what the pipeline stages receive). */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** The Markdown body as the processor receives it (frontmatter removed, trimmed). */
  readonly body: string;
  /** Lines of the file that precede the body (body line + offset = file line). */
  readonly bodyLineOffset: number;
  /** File line of the value at a frontmatter path (or of its nearest present ancestor); 1 when unknown. */
  readonly lineOf: (path: readonly PropertyKey[]) => number;
}

export interface FrontmatterProblem {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Line (1-based) of the opening fence: blank lines may precede it (frontmatterRE allows `^\s*\n`). */
const fenceLine = (raw: string): number => {
  const at = raw.search(/^(?:---|\+\+\+)/m);
  if (at < 0) return 1;
  let lines = 1;
  for (let i = 0; i < at; i += 1) if (raw.charCodeAt(i) === 10) lines += 1;
  return lines;
};

const locator = (yamlText: string, firstLine: number): ((path: readonly PropertyKey[]) => number) => {
  const counter = new LineCounter();
  const doc: Document = parseDocument(yamlText, { ...ASTRO_YAML, lineCounter: counter, keepSourceTokens: false });
  return (path) => {
    for (let n = path.length; n > 0; n -= 1) {
      const node: unknown = doc.getIn(path.slice(0, n), true);
      const range = isRecord(node) && Array.isArray(node['range']) ? (node['range'] as readonly number[]) : undefined;
      const start = range?.[0];
      if (typeof start === 'number') return firstLine - 1 + counter.linePos(start).line;
    }
    return firstLine;
  };
};

/** Reads a content file; a YAML error is reported at its file line. */
export const readContentDocument = (path: string, raw: string): Result<ContentDocument, FrontmatterProblem> => {
  let parsed: { readonly frontmatter: Record<string, unknown>; readonly rawFrontmatter: string; readonly content: string };
  try {
    parsed = parseFrontmatter(raw, { frontmatter: 'empty-with-spaces' });
  } catch (e: unknown) {
    const pos = isRecord(e) && Array.isArray(e['linePos']) ? (e['linePos'] as readonly unknown[])[0] : undefined;
    const line = isRecord(pos) && typeof pos['line'] === 'number' ? pos['line'] : 1;
    const column = isRecord(pos) && typeof pos['col'] === 'number' ? pos['col'] : 1;
    const message = e instanceof Error ? (e.message.split('\n')[0] ?? e.message) : String(e);
    return err({ line: fenceLine(raw) - 1 + line, column, message });
  }
  const body = parsed.content.trim();
  const first = fenceLine(raw);
  return ok({
    path,
    raw,
    frontmatter: isRecord(parsed.frontmatter) ? parsed.frontmatter : {},
    body,
    bodyLineOffset: lineOffset(raw, body),
    lineOf: parsed.rawFrontmatter === '' ? () => 1 : locator(parsed.rawFrontmatter, first),
  });
};
