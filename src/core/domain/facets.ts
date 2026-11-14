/**
 * Faceted classification (S. R. Ranganathan, Colon Classification, 1933):
 * every item is located by independent, orthogonal facets instead of a single
 * tree, so the same text can be reached from several conceptual directions
 * without duplicating it.
 *
 *   stratum  — epistemic level (see strata.ts)           : exactly one
 *   form     — kind of document (genre)                  : exactly one
 *   domain   — field of knowledge                        : one or more (core disciplines and foundations)
 *   concepts — SKOS concepts the item discusses          : zero or more (ontology)
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

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

/**
 * The domain facet is also the SCOPE of the site (ADR 0013, src/core/domain/scope.ts).
 *
 * Core disciplines are what the site is about: a work is in scope when it answers a
 * question of at least one of them. Foundations are supporting fields: they enter only
 * as far as a core discipline depends on them (scope.ts says which). A discipline is not
 * tied to a stratum: each one has parts on every step of the bridge
 * (docs/programa-editorial.md §2), so the lists follow the lines of inquiry, not the strata.
 */
export const CORE_DOMAINS = [
  // building software
  'software-engineering',
  'software-architecture',
  'systems-design',
  // computing and optimization
  'computer-science',
  'systems-optimization',
  // information systems and data
  'information-systems',
  'information-technology',
  'data-engineering',
  // information and signals
  'information-theory',
  'signal-processing',
  // applied philosophy
  'applied-philosophy',
] as const;
export type CoreDomain = (typeof CORE_DOMAINS)[number];

export const FOUNDATION_DOMAINS = [
  'ontology',
  'epistemology',
  'semiotics',
  'logic',
  'mathematics',
  'probability',
  'dynamical-systems',
  'behavior',
  'methodology',
  'design',
  'product',
] as const;
export type FoundationDomain = (typeof FOUNDATION_DOMAINS)[number];

/** Display order: core disciplines first (by line of inquiry), then foundations. */
export const DOMAINS = [...CORE_DOMAINS, ...FOUNDATION_DOMAINS] as const;
export type Domain = (typeof DOMAINS)[number];

export const parseForm = (v: unknown): Result<Form, string> =>
  typeof v === 'string' && (FORMS as readonly string[]).includes(v) ? ok(v as Form) : err(`unknown form "${show(v)}"`);

export const parseDomain = (v: unknown): Result<Domain, string> =>
  typeof v === 'string' && (DOMAINS as readonly string[]).includes(v)
    ? ok(v as Domain)
    : err(`unknown domain "${show(v)}"`);
