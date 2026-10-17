/**
 * Identifier types (nominal). Each has exactly one smart constructor; anything
 * else that produces one is a bug the type checker will flag.
 */
import { type Brand, unsafeBrand } from '../algebra/brand.ts';
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

/** URL path segment: lowercase ASCII words joined by single hyphens. */
export type Slug = Brand<string, 'Slug'>;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const parseSlug = (v: unknown): Result<Slug, string> =>
  typeof v === 'string' && SLUG.test(v) ? ok(unsafeBrand<string, 'Slug'>(v)) : err(`invalid slug "${show(v)}"`);

/** Language-neutral, stable identifier of a SKOS concept (never shown as text). */
export type ConceptId = Brand<string, 'ConceptId'>;
export const parseConceptId = (v: unknown): Result<ConceptId, string> =>
  typeof v === 'string' && SLUG.test(v)
    ? ok(unsafeBrand<string, 'ConceptId'>(v))
    : err(`invalid concept id "${show(v)}"`);

/** Key linking translations of the same work across locales. */
export type TranslationKey = Brand<string, 'TranslationKey'>;
export const parseTranslationKey = (v: unknown): Result<TranslationKey, string> =>
  typeof v === 'string' && SLUG.test(v)
    ? ok(unsafeBrand<string, 'TranslationKey'>(v))
    : err(`invalid translation key "${show(v)}"`);

/** BibTeX citation key, e.g. shannon1948 (letters, digits, and : _ - . /). */
export type CitationKey = Brand<string, 'CitationKey'>;
const CITE_KEY = /^[A-Za-z][A-Za-z0-9:_\-./]*$/;
export const parseCitationKey = (v: unknown): Result<CitationKey, string> =>
  typeof v === 'string' && CITE_KEY.test(v)
    ? ok(unsafeBrand<string, 'CitationKey'>(v))
    : err(`invalid citation key "${show(v)}"`);

/** Cross-reference label, LaTeX style: prefix:name (thm:sampling, eq:fourier, fig:alias). */
export type Label = Brand<string, 'Label'>;
const LABEL = /^[a-z]+:[a-z0-9][a-z0-9-]*$/;
export const parseLabel = (v: unknown): Result<Label, string> =>
  typeof v === 'string' && LABEL.test(v) ? ok(unsafeBrand<string, 'Label'>(v)) : err(`invalid label "${show(v)}"`);
