/**
 * Epistemic status — an ethical writing device: every text declares how sure
 * the author is and what kind of support the claims rest on.
 *
 * Confidence uses Sherman Kent's "Words of Estimative Probability" (CIA Studies
 * in Intelligence, 1964): calibrated verbal labels mapped to probability bands,
 * so "provável" means the same thing in every essay.
 */
import { err, ok, type Result } from '../algebra/result.ts';

export const CONFIDENCE_LEVELS = [
  'certain',
  'almost-certain',
  'probable',
  'chances-even',
  'probably-not',
  'almost-certainly-not',
] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** Kent (1964) bands: central estimate and half-width, in percent. */
export const KENT_BANDS: Readonly<Record<Confidence, { readonly center: number; readonly halfWidth: number }>> = {
  certain: { center: 100, halfWidth: 0 },
  'almost-certain': { center: 93, halfWidth: 6 },
  probable: { center: 75, halfWidth: 12 },
  'chances-even': { center: 50, halfWidth: 10 },
  'probably-not': { center: 30, halfWidth: 10 },
  'almost-certainly-not': { center: 7, halfWidth: 5 },
};

/** What supports the claims: ordered from strongest formal warrant to weakest. */
export const EVIDENCE_KINDS = ['proof', 'empirical', 'argument', 'speculation'] as const;
export type Evidence = (typeof EVIDENCE_KINDS)[number];

export interface EpistemicStatus {
  readonly confidence: Confidence;
  readonly evidence: Evidence;
}

export const parseConfidence = (v: unknown): Result<Confidence, string> =>
  typeof v === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(v)
    ? ok(v as Confidence)
    : err(`unknown confidence "${String(v)}"`);

export const parseEvidence = (v: unknown): Result<Evidence, string> =>
  typeof v === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(v)
    ? ok(v as Evidence)
    : err(`unknown evidence kind "${String(v)}"`);
