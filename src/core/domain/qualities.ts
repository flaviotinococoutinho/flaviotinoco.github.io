/**
 * Qualities — the closed vocabulary of tags that qualify a subject (a tool, a
 * reference, a methodology, a standard) independently of what it is about.
 *
 * A quality is an accident in Aristotle's sense (Categories 8, 8b25: ποιότης):
 * it says how a thing is, not what it is; so it is a tag on a subject, never a
 * concept of the ontology. Kept closed so that two subjects tagged alike are
 * comparable (faceted classification, Ranganathan 1933): a new quality is a
 * change to this file, reviewed like any other.
 *
 * Groups (display order): status of a specification, governance and licence,
 * epistemic kind, life cycle, access.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

export const QUALITY_GROUPS = ['standard', 'governance', 'epistemic', 'lifecycle', 'access'] as const;
export type QualityGroup = (typeof QUALITY_GROUPS)[number];

export const QUALITIES = {
  /** Specification publicly available and developed in an open process. */
  'open-standard': 'standard',
  /** Specification maintained continuously, without numbered versions (e.g. the WHATWG model). */
  'living-standard': 'standard',
  /** Adopted by practice rather than by a standards body. */
  'de-facto-standard': 'standard',
  /** Issued by a formal standards body (ISO, ABNT, IEC…). */
  'de-jure-standard': 'standard',
  /** Decisions taken by an open community process. */
  'community-governed': 'governance',
  /** Decisions taken by one company or vendor. */
  'vendor-controlled': 'governance',
  /** Released under a licence approved by the Open Source Initiative. */
  'open-source': 'governance',
  /** Released under a licence that restricts use, study, change or redistribution. */
  proprietary: 'governance',
  /** Defined mathematically; claims follow by proof. */
  formal: 'epistemic',
  /** Supported by observation or experiment. */
  empirical: 'epistemic',
  /** Prescribes what ought to be done (rules, norms, laws). */
  normative: 'epistemic',
  /** Describes what is the case without prescribing. */
  descriptive: 'epistemic',
  /** Reviewed by independent experts before publication. */
  'peer-reviewed': 'epistemic',
  /** Changed rarely, with compatibility guarantees. */
  stable: 'lifecycle',
  /** Subject to change without compatibility guarantees. */
  experimental: 'lifecycle',
  /** Superseded or no longer recommended by its maintainers. */
  deprecated: 'lifecycle',
  /** No longer in use, kept for its historical role. */
  historical: 'lifecycle',
  /** Readable without payment or registration. */
  'free-access': 'access',
  /** Behind payment, registration or institutional access. */
  'restricted-access': 'access',
} as const satisfies Readonly<Record<string, QualityGroup>>;
export type Quality = keyof typeof QUALITIES;

export const QUALITY_KEYS = Object.keys(QUALITIES) as readonly Quality[];

export const isQuality = (v: unknown): v is Quality => typeof v === 'string' && Object.hasOwn(QUALITIES, v);

export const parseQuality = (v: unknown): Result<Quality, string> =>
  isQuality(v) ? ok(v) : err(`unknown quality "${show(v)}" (expected one of ${QUALITY_KEYS.join(', ')})`);

export const qualityGroup = (q: Quality): QualityGroup => QUALITIES[q];

/**
 * Pairs that cannot both hold of the same subject (contraries). Used to reject
 * contradictory tag sets at parse time.
 */
export const CONTRARY_QUALITIES: readonly (readonly [Quality, Quality])[] = [
  ['open-source', 'proprietary'],
  ['community-governed', 'vendor-controlled'],
  ['normative', 'descriptive'],
  ['stable', 'experimental'],
  ['free-access', 'restricted-access'],
  ['de-facto-standard', 'de-jure-standard'],
];

/** Every contrary pair present in `qs`, in vocabulary order (empty when consistent). */
export const contraries = (qs: readonly Quality[]): readonly (readonly [Quality, Quality])[] => {
  const set = new Set(qs);
  return CONTRARY_QUALITIES.filter(([a, b]) => set.has(a) && set.has(b));
};
