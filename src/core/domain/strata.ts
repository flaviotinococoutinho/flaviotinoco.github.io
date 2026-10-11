/**
 * Strata — the epistemic levels the site traverses, in order:
 *
 *   philosophy → theory → formal → value
 *   (questão)    (modelo)  (prova)   (produto)
 *
 * Symbology: each stratum is drawn as the k-simplex of its ordinal k —
 * point (0-simplex), segment (1-simplex), triangle (2-simplex), tetrahedron
 * (3-simplex). Each step adds one degree of determination, from the
 * dimensionless question to the solid, usable artefact. The ordering is also
 * encoded redundantly in lightness (see design tokens), so it survives every
 * form of colour-vision deficiency and greyscale printing.
 */
import { err, ok, type Result } from '../algebra/result.ts';

export const STRATA = ['philosophy', 'theory', 'formal', 'value'] as const;
export type Stratum = (typeof STRATA)[number];

export type SimplexDimension = 0 | 1 | 2 | 3;

export interface StratumSpec {
  readonly id: Stratum;
  /** Position in the bridge, 0-based. */
  readonly ordinal: SimplexDimension;
  /** Dimension of the simplex used as its glyph (= ordinal by construction). */
  readonly simplex: SimplexDimension;
  /** Name of the design token holding its colour (see src/core/design/tokens.json). */
  readonly colorToken: `stratum-${Stratum}`;
  /** Glyph id in the SVG symbol sprite. */
  readonly glyph: `simplex-${SimplexDimension}`;
}

export const STRATUM_SPECS: Readonly<Record<Stratum, StratumSpec>> = {
  philosophy: { id: 'philosophy', ordinal: 0, simplex: 0, colorToken: 'stratum-philosophy', glyph: 'simplex-0' },
  theory: { id: 'theory', ordinal: 1, simplex: 1, colorToken: 'stratum-theory', glyph: 'simplex-1' },
  formal: { id: 'formal', ordinal: 2, simplex: 2, colorToken: 'stratum-formal', glyph: 'simplex-2' },
  value: { id: 'value', ordinal: 3, simplex: 3, colorToken: 'stratum-value', glyph: 'simplex-3' },
};

export const isStratum = (value: unknown): value is Stratum =>
  typeof value === 'string' && (STRATA as readonly string[]).includes(value);

export const parseStratum = (value: unknown): Result<Stratum, string> =>
  isStratum(value) ? ok(value) : err(`unknown stratum "${String(value)}" (expected one of ${STRATA.join(', ')})`);

/** Total order on strata (the direction of the bridge). */
export const compareStrata = (a: Stratum, b: Stratum): number => STRATUM_SPECS[a].ordinal - STRATUM_SPECS[b].ordinal;

/** Next stratum on the bridge, or null at the end (value is the terminal stratum). */
export const nextStratum = (s: Stratum): Stratum | null => STRATA[STRATUM_SPECS[s].ordinal + 1] ?? null;
export const previousStratum = (s: Stratum): Stratum | null => STRATA[STRATUM_SPECS[s].ordinal - 1] ?? null;
