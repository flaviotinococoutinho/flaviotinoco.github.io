/**
 * Presentation rules of the essay pages, as pure functions over the content
 * model (the views only print what these return).
 *
 *   - keywords per ABNT NBR 6028:2021, 4.1.7: "Palavras-chave: a; b; c." —
 *     "separadas entre si por ponto e vírgula e finalizadas por ponto";
 *   - the epistemic status: Kent's (1964) estimative words on an ordinal scale
 *     with their probability band;
 *   - the provenance notice (editorial ethics: AI assistance, pending review);
 *   - the bridge: the stratum an essay leads to;
 *   - grouping in bridge order and the facets present, for the index.
 */
import { absurd } from '../algebra/match.ts';
import { CONFIDENCE_LEVELS, KENT_BANDS, type Confidence } from '../domain/epistemic.ts';
import { DOMAINS, type Domain } from '../domain/facets.ts';
import type { Locale } from '../domain/locale.ts';
import { nextStratum, STRATA, type Stratum } from '../domain/strata.ts';

/** NBR 6028 keyword list (without its label): "a; b; c." The authors' casing is kept. */
export const keywordList = (keywords: readonly string[]): string => {
  const items = keywords.map((k) => k.trim().replace(/[.;]+$/u, '')).filter((k) => k.length > 0);
  return items.length === 0 ? '' : `${items.join('; ')}.`;
};

/** Kent's levels from the lowest to the highest probability (an ordinal scale). */
export const CONFIDENCE_SCALE: readonly Confidence[] = [...CONFIDENCE_LEVELS].reverse();

export interface ScaleStep {
  readonly level: Confidence;
  readonly active: boolean;
}
/** The ordinal scale with the essay's level marked. */
export const confidenceScale = (confidence: Confidence): readonly ScaleStep[] =>
  CONFIDENCE_SCALE.map((level) => ({ level, active: level === confidence }));

/** Probability band of a Kent level in the reader's locale, e.g. "63%–87%" (a point when the band is exact). */
export const kentBand = (confidence: Confidence, locale: Locale): string => {
  const { center, halfWidth } = KENT_BANDS[confidence];
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const low = Math.max(0, center - halfWidth) / 100;
  const high = Math.min(100, center + halfWidth) / 100;
  return low === high ? pct.format(low) : `${pct.format(low)}–${pct.format(high)}`;
};

export type Assistance = 'none' | 'assisted' | 'generated';
export interface Provenance {
  readonly assistance: Assistance;
  readonly reviewed: boolean;
}
export type ProvenanceMessage =
  | 'provenance.generated.pending'
  | 'provenance.generated.reviewed'
  | 'provenance.assisted.pending'
  | 'provenance.assisted.reviewed'
  | 'provenance.none.pending';

/**
 * The notice readers must see, or null: shown whenever AI assistance was used
 * or the author has not reviewed the text (ethical transparency).
 */
export const provenanceMessage = (p: Provenance): ProvenanceMessage | null => {
  switch (p.assistance) {
    case 'generated':
      return p.reviewed ? 'provenance.generated.reviewed' : 'provenance.generated.pending';
    case 'assisted':
      return p.reviewed ? 'provenance.assisted.reviewed' : 'provenance.assisted.pending';
    case 'none':
      return p.reviewed ? null : 'provenance.none.pending';
    default:
      return absurd(p.assistance);
  }
};

/** The stratum an essay leads to: its declared bridge, else the next stratum (null at the end of the bridge). */
export const bridgeTarget = (stratum: Stratum, bridgesTo: Stratum | undefined): Stratum | null =>
  bridgesTo ?? nextStratum(stratum);

/** Calendar date (UTC) as an ISO 8601 string, for <time datetime>. */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** The most recent revision strictly after publication, or null. */
export const lastRevision = (published: Date, revisions: readonly { readonly date: Date }[]): Date | null =>
  revisions.reduce<Date | null>(
    (latest, r) => (r.date.valueOf() > published.valueOf() && (latest === null || r.date > latest) ? r.date : latest),
    null,
  );

/** Revisions, most recent first (stable for equal dates). */
export const revisionsNewestFirst = <R extends { readonly date: Date }>(revisions: readonly R[]): readonly R[] =>
  revisions
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.date.valueOf() - a.r.date.valueOf() || a.i - b.i)
    .map((x) => x.r);

export interface StratumGroup<T> {
  readonly stratum: Stratum;
  readonly items: readonly T[];
}
/** Items grouped by stratum in bridge order (philosophy → value); empty groups are dropped, item order is kept. */
export const groupByStratum = <T>(items: readonly T[], stratumOf: (t: T) => Stratum): readonly StratumGroup<T>[] =>
  STRATA.map((stratum) => ({ stratum, items: items.filter((i) => stratumOf(i) === stratum) })).filter(
    (g) => g.items.length > 0,
  );

/** Domains present among the items, in the canonical facet order. */
export const domainsPresent = <T>(items: readonly T[], domainsOf: (t: T) => readonly Domain[]): readonly Domain[] => {
  const present = new Set(items.flatMap(domainsOf));
  return DOMAINS.filter((d) => present.has(d));
};
