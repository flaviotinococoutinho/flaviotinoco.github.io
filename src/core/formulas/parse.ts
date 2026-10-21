/**
 * Parser of one formula file (parse, don't validate): `unknown` → refined
 * types, every problem reported at once (applicative validation).
 *
 * The shape is closed: an unknown key is an error, so a typo in a field name
 * cannot silently drop a description. References to concepts and sources are
 * checked later by the registry builder, which knows the ontology and the
 * bibliography (registry.ts).
 */
import { unsafeBrand } from '../algebra/brand.ts';
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { parseDomain, type Domain } from '../domain/facets.ts';
import { parseCitationKey, parseConceptId, parseLabel, parseSlug, type Label } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { parseStratum, type Stratum } from '../domain/strata.ts';
import type { Formula, FormulaId, FormulaSymbol, Localized, RawFormula } from './model.ts';

/** A formula before the registry resolves what it derives from its concept. */
export interface ParsedFormula extends Omit<Formula, 'stratum' | 'domains'> {
  /** As authored: required when the formula is not a concept's notation, forbidden when it is. */
  readonly stratum: Stratum | null;
  readonly domains: readonly Domain[] | null;
}

const KEYS = [
  'slug',
  'name',
  'tex',
  'labels',
  'concept',
  'stratum',
  'domains',
  'meaning',
  'spoken',
  'symbols',
  'concepts',
  'sources',
] as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const parseFormulaId = (v: unknown): Result<FormulaId, string> =>
  typeof v === 'string' && SLUG.test(v)
    ? ok(unsafeBrand<string, 'FormulaId'>(v))
    : err(`invalid formula id "${show(v)}"`);

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Collects errors; each `field` call returns the parsed value or null after reporting. */
interface Collector {
  readonly errors: string[];
  readonly fail: (message: string) => null;
}

const nonEmptyText = (c: Collector, field: string, v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : c.fail(`${field}: expected a non-empty string, got ${show(v)}`);

const localized = <T>(
  c: Collector,
  field: string,
  v: unknown,
  parse: (field: string, item: unknown) => T | null,
): Localized<T> | null => {
  if (!isRecord(v)) return c.fail(`${field}: expected an object with keys ${LOCALES.join(', ')}, got ${show(v)}`);
  for (const key of Object.keys(v)) {
    if (!(LOCALES as readonly string[]).includes(key)) c.fail(`${field}: unknown locale "${key}"`);
  }
  const out: Partial<Record<Locale, T>> = {};
  let complete = true;
  for (const locale of LOCALES) {
    const item = Object.hasOwn(v, locale) ? v[locale] : undefined;
    const parsed = item === undefined ? c.fail(`${field}.${locale}: missing`) : parse(`${field}.${locale}`, item);
    if (parsed === null) complete = false;
    else out[locale] = parsed;
  }
  return complete ? (out as Localized<T>) : null;
};

const list = <T>(
  c: Collector,
  field: string,
  v: unknown,
  parse: (field: string, item: unknown) => T | null,
): T[] | null => {
  if (!Array.isArray(v)) return c.fail(`${field}: expected a list, got ${show(v)}`);
  const out: T[] = [];
  let complete = true;
  for (const [i, item] of (v as readonly unknown[]).entries()) {
    const parsed = parse(`${field}[${String(i)}]`, item);
    if (parsed === null) complete = false;
    else out.push(parsed);
  }
  return complete ? out : null;
};

const lift =
  <T>(parse: (v: unknown) => Result<T, string>) =>
  (c: Collector) =>
  (field: string, v: unknown): T | null => {
    const r = parse(v);
    return r.ok ? r.value : c.fail(`${field}: ${r.error}`);
  };

const slug = lift(parseSlug);
const conceptId = lift(parseConceptId);
const citationKey = lift(parseCitationKey);
const domain = lift(parseDomain);

/** An equation label: `eq:` prefix, as the latex stage numbers them. */
const equationLabel =
  (c: Collector) =>
  (field: string, v: unknown): Label | null => {
    const r = parseLabel(v);
    if (!r.ok) return c.fail(`${field}: ${r.error}`);
    return r.value.startsWith('eq:') ? r.value : c.fail(`${field}: label "${r.value}" must use the eq: prefix`);
  };

const symbol =
  (c: Collector) =>
  (field: string, v: unknown): FormulaSymbol | null => {
    if (!isRecord(v)) return c.fail(`${field}: expected an object {tex, text}, got ${show(v)}`);
    for (const key of Object.keys(v)) {
      if (key !== 'tex' && key !== 'text') c.fail(`${field}: unknown key "${key}"`);
    }
    const tex = nonEmptyText(c, `${field}.tex`, v['tex']);
    const text = localized(c, `${field}.text`, v['text'], (f, item) => nonEmptyText(c, f, item));
    return tex === null || text === null ? null : { tex, text };
  };

/** Parses one formula file. Every error is prefixed with the formula id. */
export const parseFormula = (raw: RawFormula): Result<ParsedFormula, readonly string[]> => {
  const errors: string[] = [];
  const c: Collector = {
    errors,
    fail: (message) => {
      errors.push(`formula "${raw.id}": ${message}`);
      return null;
    },
  };
  const id = parseFormulaId(raw.id);
  if (!id.ok) c.fail(id.error);
  if (!isRecord(raw.data))
    return err([...errors, `formula "${raw.id}": expected a JSON object, got ${show(raw.data)}`]);
  const data = raw.data;
  for (const key of Object.keys(data)) {
    if (!(KEYS as readonly string[]).includes(key)) c.fail(`unknown key "${key}" (allowed: ${KEYS.join(', ')})`);
  }
  const get = (key: (typeof KEYS)[number]): unknown => (Object.hasOwn(data, key) ? data[key] : undefined);
  const optional = <T>(key: (typeof KEYS)[number], parse: (field: string, v: unknown) => T | null): T | null => {
    const v = get(key);
    return v === undefined ? null : parse(key, v);
  };
  const required = <T>(key: (typeof KEYS)[number], parse: (field: string, v: unknown) => T | null): T | null => {
    const v = get(key);
    return v === undefined ? c.fail(`${key}: missing`) : parse(key, v);
  };
  const text = (field: string, v: unknown): string | null => nonEmptyText(c, field, v);

  const slugs = required('slug', (f, v) => localized(c, f, v, slug(c)));
  const name = required('name', (f, v) => localized(c, f, v, text));
  const tex = required('tex', text);
  const labels = required('labels', (f, v) => localized(c, f, v, (ff, item) => list(c, ff, item, equationLabel(c))));
  const concept = optional('concept', conceptId(c));
  const stratum = optional('stratum', lift(parseStratum)(c));
  const domains = optional('domains', (f, v) => list(c, f, v, domain(c)));
  const meaning = required('meaning', (f, v) => localized(c, f, v, text));
  const spoken = required('spoken', (f, v) => localized(c, f, v, text));
  const symbols = optional('symbols', (f, v) => list(c, f, v, symbol(c))) ?? [];
  const concepts = optional('concepts', (f, v) => list(c, f, v, conceptId(c))) ?? [];
  const sources = optional('sources', (f, v) => list(c, f, v, citationKey(c))) ?? [];

  if (concept !== null) {
    if (get('stratum') !== undefined) c.fail('stratum: derived from the concept, remove it');
    if (get('domains') !== undefined) c.fail('domains: derived from the concept, remove it');
    if (concepts.includes(concept)) c.fail(`concepts: "${concept}" is already the formula's concept`);
  } else {
    if (stratum === null && get('stratum') === undefined) c.fail('stratum: missing (required without a concept)');
    if (domains === null && get('domains') === undefined) c.fail('domains: missing (required without a concept)');
    if (domains !== null && domains.length === 0) c.fail('domains: expected at least one domain');
  }
  const seenSymbols = new Set<string>();
  for (const s of symbols) {
    if (seenSymbols.has(s.tex)) c.fail(`symbols: "${s.tex}" listed twice`);
    seenSymbols.add(s.tex);
  }
  for (const locale of LOCALES) {
    const seen = new Set<string>();
    for (const label of labels?.[locale] ?? []) {
      if (seen.has(label)) c.fail(`labels.${locale}: "${label}" listed twice`);
      seen.add(label);
    }
  }
  if (
    errors.length > 0 ||
    !id.ok ||
    slugs === null ||
    name === null ||
    tex === null ||
    labels === null ||
    meaning === null ||
    spoken === null
  ) {
    return err(errors);
  }
  return ok({
    id: id.value,
    slug: slugs,
    name,
    tex,
    labels,
    concept,
    stratum,
    domains,
    meaning,
    spoken,
    symbols,
    concepts: dedupe(concepts),
    sources: dedupe(sources),
  });
};

const dedupe = <T>(xs: readonly T[]): readonly T[] => [...new Set(xs)];
