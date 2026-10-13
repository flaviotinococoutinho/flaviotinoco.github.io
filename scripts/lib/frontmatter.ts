/**
 * Reader for the top-level SCALAR fields of a Markdown file's YAML frontmatter.
 *
 * The guardrails need only identity fields (lang, translationKey, slug,
 * stratum, draft) and the lockfile offers no YAML parser at the root, so this
 * reads the subset of YAML 1.2 those fields use: `key: value` at column 0 with
 * a plain, 'single-quoted' or "double-quoted" scalar (YAML 1.2 §7.3). Anything
 * else (nested maps, sequences, block scalars) is reported as non-scalar
 * instead of guessed, so a field the checker needs is never silently
 * misread. Content schemas themselves are enforced by Astro (zod) at build time.
 */
import { err, ok, type Result } from '../../src/core/algebra/result.ts';

export type FrontmatterValue = { readonly kind: 'scalar'; readonly value: string } | { readonly kind: 'complex' };

export type Frontmatter = ReadonlyMap<string, FrontmatterValue>;

const KEY_LINE = /^([A-Za-z_][\w-]*)[ \t]*:(?:[ \t]+(.*?))?[ \t]*$/;

/** Unquotes one YAML flow scalar; `undefined` when it is not a scalar (e.g. "[a, b]", "{…}", "|"). */
export const parseScalar = (raw: string): string | undefined => {
  const value = raw.trim();
  if (value.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"(?:\s+#.*)?$/.test(value)) return undefined;
    const quoted = value.slice(0, value.lastIndexOf('"') + 1);
    try {
      const parsed: unknown = JSON.parse(quoted);
      return typeof parsed === 'string' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (value.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(value);
    return m ? (m[1] ?? '').replace(/''/g, "'") : undefined;
  }
  if (value === '' || /^[[{|>&*!%@`]/.test(value)) return undefined;
  return value.replace(/\s+#.*$/, '');
};

/** Extracts the frontmatter block and its top-level scalar fields. */
export const readFrontmatter = (source: string): Result<Frontmatter, string> => {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) return err('missing frontmatter (the file must start with "---")');
  const end = text.slice(4).search(/^(?:---|\.\.\.)[ \t]*$/m);
  if (end === -1) return err('unterminated frontmatter (no closing "---")');
  const fields = new Map<string, FrontmatterValue>();
  for (const line of text.slice(4, 4 + end).split('\n')) {
    const m = KEY_LINE.exec(line);
    if (m === null) continue;
    const key = m[1] ?? '';
    const scalar = m[2] === undefined ? undefined : parseScalar(m[2]);
    if (!fields.has(key)) fields.set(key, scalar === undefined ? { kind: 'complex' } : { kind: 'scalar', value: scalar });
  }
  return ok(fields);
};

/** A scalar field as a string, or undefined when absent or not a scalar. */
export const scalar = (fm: Frontmatter, key: string): string | undefined => {
  const v = fm.get(key);
  return v?.kind === 'scalar' ? v.value : undefined;
};
