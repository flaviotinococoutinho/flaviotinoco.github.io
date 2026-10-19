/**
 * Parser (unknown → Result<ConceptEntry>) for one concept file.
 *
 * "Parse, don't validate" (A. King, 2019): the untyped JSON is converted once,
 * at the boundary, into refined types. The accepted language is exactly the
 * `concepts` schema of src/content.config.ts (same keys, same defaults, unknown
 * keys rejected), so the Markdown stage and the Astro collection can never
 * disagree about what a concept is. Every problem of the entry is accumulated
 * (applicative validation) instead of stopping at the first.
 *
 * Strings are normalised to Unicode NFC at this boundary (UAX #15): canonically
 * equivalent spellings ("é" vs "e" + U+0301) then compare equal everywhere
 * downstream (label lookup, duplicate detection). Leading/trailing whitespace is
 * rejected rather than trimmed, so nothing the author wrote is silently changed
 * beyond canonical equivalence.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { parseCitationKey, parseConceptId, parseSlug, type ConceptId } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { parseStratum } from '../domain/strata.ts';
import { parseDomain, type Domain } from '../domain/facets.ts';
import type { AuthoredLink, ConceptEntry, Localized, OntologyError } from './model.ts';
import { parseCategory, parseLinkType } from './vocabulary.ts';

const KEYS = [
  'slug',
  'prefLabel',
  'altLabel',
  'definition',
  'notation',
  'stratum',
  'category',
  'domains',
  'broader',
  'relations',
  'exactMatch',
  'sources',
] as const;
const REQUIRED: readonly string[] = ['slug', 'prefLabel', 'definition', 'stratum', 'category', 'domains'];

type Field<T> = Result<T, readonly OntologyError[]>;

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accumulating parser context for one entry. */
const reporter = (id: string) => {
  const fail = (path: string, message: string): Field<never> => err([{ kind: 'malformed', id, path, message }]);

  const text = (v: unknown, path: string): Field<string> => {
    if (typeof v !== 'string' || v.length === 0) return fail(path, 'expected a non-empty string');
    if (v.trim() !== v) return fail(path, 'leading or trailing whitespace');
    return ok(v.normalize('NFC'));
  };

  const list = <T>(v: unknown, path: string, item: (x: unknown, p: string) => Field<T>): Field<readonly T[]> => {
    if (!Array.isArray(v)) return fail(path, 'expected an array');
    const values: T[] = [];
    const errors: OntologyError[] = [];
    v.forEach((x, i) => {
      const r = item(x, `${path}[${String(i)}]`);
      if (r.ok) values.push(r.value);
      else errors.push(...r.error);
    });
    return errors.length === 0 ? ok(values) : err(errors);
  };

  const localized = <T>(v: unknown, path: string, item: (x: unknown, p: string) => Field<T>): Field<Localized<T>> => {
    if (!isRecord(v)) return fail(path, `expected an object with keys ${LOCALES.join(', ')}`);
    const errors: OntologyError[] = [];
    for (const key of Object.keys(v)) {
      if (!(LOCALES as readonly string[]).includes(key))
        errors.push({ kind: 'malformed', id, path, message: `unknown locale "${key}"` });
    }
    const out: Partial<Record<Locale, T>> = {};
    for (const locale of LOCALES) {
      if (!(locale in v)) {
        errors.push({ kind: 'malformed', id, path: `${path}.${locale}`, message: 'missing translation' });
        continue;
      }
      const r = item(v[locale], `${path}.${locale}`);
      if (r.ok) out[locale] = r.value;
      else errors.push(...r.error);
    }
    return errors.length === 0 ? ok(out as Localized<T>) : err(errors);
  };

  const lift =
    <T>(parse: (v: unknown) => Result<T, string>) =>
    (v: unknown, path: string): Field<T> => {
      const r = parse(v);
      return r.ok ? ok(r.value) : fail(path, r.error);
    };

  const iri = (v: unknown, path: string): Field<string> => {
    if (typeof v !== 'string' || !/^https?:\/\/\S+$/u.test(v) || !URL.canParse(v)) {
      return fail(path, `expected an absolute http(s) IRI, got "${show(v)}"`);
    }
    return ok(v);
  };

  /** One `{ "type": …, "target": … }` object of the `relations` list (exactly these two keys). */
  const link = (v: unknown, path: string): Field<AuthoredLink> => {
    if (!isRecord(v)) return fail(path, 'expected an object { "type", "target" }');
    const errors: OntologyError[] = [];
    for (const key of Object.keys(v)) {
      if (key !== 'type' && key !== 'target')
        errors.push({ kind: 'malformed', id, path: `${path}.${key}`, message: 'unknown key' });
    }
    const type = lift(parseLinkType)(v['type'], `${path}.type`);
    const target = lift(parseConceptId)(v['target'], `${path}.target`);
    if (!type.ok) errors.push(...type.error);
    if (!target.ok) errors.push(...target.error);
    return errors.length > 0 || !type.ok || !target.ok ? err(errors) : ok({ type: type.value, target: target.value });
  };

  return { fail, text, list, localized, lift, iri, link };
};

/**
 * Parses one concept file. `id` is the file name without extension (the
 * language-neutral concept id); `raw` is the decoded JSON value.
 */
export const parseConceptEntry = (id: unknown, raw: unknown): Result<ConceptEntry, readonly OntologyError[]> => {
  const conceptId = parseConceptId(id);
  const name = show(id);
  const p = reporter(name);
  if (!conceptId.ok) return p.fail('', conceptId.error);
  if (!isRecord(raw)) return p.fail('', 'expected a JSON object');

  const errors: OntologyError[] = [];
  for (const key of Object.keys(raw)) {
    if (!(KEYS as readonly string[]).includes(key))
      errors.push({ kind: 'malformed', id: name, path: key, message: 'unknown key' });
  }
  for (const key of REQUIRED) {
    if (!(key in raw)) errors.push({ kind: 'malformed', id: name, path: key, message: 'required' });
  }

  const take = <T>(r: Field<T>, fallback: T): T => {
    if (r.ok) return r.value;
    errors.push(...r.error);
    return fallback;
  };
  const empty: Localized<readonly string[]> = { 'pt-BR': [], en: [] };
  const broader: readonly ConceptId[] =
    'broader' in raw ? take(p.list(raw['broader'], 'broader', p.lift(parseConceptId)), []) : [];
  const relations: readonly AuthoredLink[] =
    'relations' in raw ? take(p.list(raw['relations'], 'relations', p.link), []) : [];

  const slug = 'slug' in raw ? take(p.localized(raw['slug'], 'slug', p.lift(parseSlug)), null) : null;
  const prefLabel = 'prefLabel' in raw ? take(p.localized(raw['prefLabel'], 'prefLabel', p.text), null) : null;
  const altLabel =
    'altLabel' in raw
      ? take(
          p.localized(raw['altLabel'], 'altLabel', (v, path) => p.list(v, path, p.text)),
          empty,
        )
      : empty;
  const definition = 'definition' in raw ? take(p.localized(raw['definition'], 'definition', p.text), null) : null;
  const notation = 'notation' in raw ? take(p.text(raw['notation'], 'notation'), null) : null;
  const stratum = 'stratum' in raw ? take(p.lift(parseStratum)(raw['stratum'], 'stratum'), null) : null;
  const category = 'category' in raw ? take(p.lift(parseCategory)(raw['category'], 'category'), null) : null;
  const domains: readonly Domain[] =
    'domains' in raw ? take(p.list(raw['domains'], 'domains', p.lift(parseDomain)), []) : [];
  if ('domains' in raw && Array.isArray(raw['domains']) && raw['domains'].length === 0) {
    errors.push({ kind: 'malformed', id: name, path: 'domains', message: 'at least one domain is required' });
  }
  const exactMatch = 'exactMatch' in raw ? take(p.list(raw['exactMatch'], 'exactMatch', p.iri), []) : [];
  const sources = 'sources' in raw ? take(p.list(raw['sources'], 'sources', p.lift(parseCitationKey)), []) : [];

  if (
    errors.length > 0 ||
    slug === null ||
    prefLabel === null ||
    definition === null ||
    stratum === null ||
    category === null
  ) {
    return err(errors);
  }
  return ok({
    id: conceptId.value,
    slug,
    prefLabel,
    altLabel,
    definition,
    notation,
    stratum,
    category,
    domains,
    broader,
    relations,
    exactMatch,
    sources,
  });
};
