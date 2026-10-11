/**
 * Faceted classification (S. R. Ranganathan, Colon Classification, 1933):
 * every item is located by independent, orthogonal facets instead of a single
 * tree, so the same text can be reached from several conceptual directions
 * without duplicating it.
 *
 *   stratum  — epistemic level (see strata.ts)           : exactly one
 *   form     — kind of document (genre)                  : exactly one
 *   domain   — field of knowledge                        : one or more
 *   concepts — SKOS concepts the item discusses          : zero or more (ontology)
 */
import { err, ok, type Result } from '../algebra/result.ts';

export const FORMS = ['essay', 'note', 'lab', 'concept', 'map'] as const;
export type Form = (typeof FORMS)[number];

/**
 * Typographic marks for forms, drawn from the scholarly tradition so the sign
 * carries its own history: ¶ (pilcrow, the argument), † (note), ⚗ redrawn as an
 * alembic glyph (experiment), § (definition entry), ⌖ (position/map).
 * Rendered as SVG symbols, never as emoji-prone code points.
 */
export const FORM_GLYPH: Readonly<Record<Form, `form-${Form}`>> = {
  essay: 'form-essay',
  note: 'form-note',
  lab: 'form-lab',
  concept: 'form-concept',
  map: 'form-map',
};

export const DOMAINS = [
  'ontology',
  'epistemology',
  'semiotics',
  'logic',
  'information-theory',
  'signal-processing',
  'dynamical-systems',
  'probability',
  'computation',
  'mathematics',
  'design',
  'product',
] as const;
export type Domain = (typeof DOMAINS)[number];

export const parseForm = (v: unknown): Result<Form, string> =>
  typeof v === 'string' && (FORMS as readonly string[]).includes(v) ? ok(v as Form) : err(`unknown form "${String(v)}"`);

export const parseDomain = (v: unknown): Result<Domain, string> =>
  typeof v === 'string' && (DOMAINS as readonly string[]).includes(v)
    ? ok(v as Domain)
    : err(`unknown domain "${String(v)}"`);
