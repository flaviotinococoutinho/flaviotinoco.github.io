/**
 * Frontmatter of a Markdown file, read exactly as Astro reads it.
 *
 * Astro 7 (@astrojs/internal-helpers 0.12, frontmatter.js and yaml.js) finds
 * the block with one regular expression and parses it with the `yaml` package:
 * parseDocument(text, { customTags: ['timestamp'], merge: true, schema: 'core' }),
 * i.e. YAML 1.2 with the core schema (true/True/TRUE are booleans, yes/no/on/off
 * are strings — no "Norway problem"), merge keys, and timestamps as dates.
 * The guardrails use the same extraction, the same parser and the same options,
 * so a field is never read differently from the build: `draft: True` is a
 * draft, a plain scalar continued on the next line is one string, and a
 * duplicated key is the same error Astro raises.
 *
 * What the parser returns is untyped data; fields are read through stringField
 * and booleanField, which tell an absent key from a value of the wrong type
 * ("unsupported form"), so a checker never mistakes a list or a date for a
 * missing field.
 */
import { parseDocument, type DocumentOptions, type ParseOptions, type SchemaOptions } from 'yaml';
import { err, ok, type Result } from '../../src/core/algebra/result.ts';

export type Frontmatter = Readonly<Record<string, unknown>>;

/** @astrojs/internal-helpers/frontmatter `frontmatterRE` (YAML "---" or TOML "+++" fences). */
const BLOCK = /(?:^\uFEFF?|^\s*\n)(?:---|\+\+\+)([\s\S]*?\n)(?:---|\+\+\+)/;
const TOML = /(?:^\uFEFF?|^\s*\n)\+\+\+/;

/** The YAML options of @astrojs/internal-helpers/yaml `parseYaml`. */
export const ASTRO_YAML_OPTIONS: Readonly<ParseOptions & DocumentOptions & SchemaOptions> = {
  customTags: ['timestamp'],
  merge: true,
  schema: 'core',
};

const isMapping = (v: unknown): v is Frontmatter => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Extracts and parses the frontmatter. Errors name the file line of the YAML
 * problem. An empty block is an empty mapping (as in Astro).
 */
export const readFrontmatter = (source: string): Result<Frontmatter, string> => {
  const m = BLOCK.exec(source);
  if (m === null) return err('missing frontmatter (the file must start with a "---" block closed by "---")');
  if (TOML.test(source)) return err('TOML frontmatter ("+++") is not read by the guardrails; use YAML ("---")');
  const yaml = m[1] ?? '';
  const doc = parseDocument(yaml, ASTRO_YAML_OPTIONS);
  const first = doc.errors[0];
  if (first !== undefined) {
    // The YAML text starts right after the opening fence, on the fence's own line.
    const start = m.index + m[0].length - 3 - yaml.length;
    const line = source.slice(0, start).split('\n').length - 1 + (first.linePos?.[0].line ?? 1);
    return err(`invalid YAML in frontmatter (line ${line}): ${first.message.split('\n')[0] ?? first.code}`);
  }
  const value: unknown = doc.contents === null ? null : doc.toJS();
  if (value === null || value === undefined) return ok({});
  return isMapping(value) ? ok(value) : err('frontmatter must be a YAML mapping of keys to values');
};

/** A field read for a checker: absent, a value of the expected type, or a value of another type. */
export type Field<T> =
  | { readonly kind: 'absent' }
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'unsupported'; readonly found: string };

/** What a YAML value is, for messages ("a sequence", "a number (3)", "a timestamp"…). */
export const describeValue = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a sequence';
  if (v instanceof Date) return 'a timestamp';
  if (typeof v === 'object') return 'a mapping';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return `a ${typeof v} (${JSON.stringify(v)})`;
  return `a ${typeof v}`;
};

const field =
  <T>(accept: (v: unknown) => v is T) =>
  (fm: Frontmatter, key: string): Field<T> => {
    if (!Object.hasOwn(fm, key)) return { kind: 'absent' };
    const v = fm[key];
    return accept(v) ? { kind: 'value', value: v } : { kind: 'unsupported', found: describeValue(v) };
  };

export const stringField = field((v): v is string => typeof v === 'string');
export const booleanField = field((v): v is boolean => typeof v === 'boolean');
