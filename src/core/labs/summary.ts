/**
 * Text alternatives of the lab plots (WCAG 2.2 SC 1.1.1 Non-text Content): one sentence per state that
 * says what the figure shows and the numbers that matter, announced politely by the islands
 * (aria-live) and readable without the picture. Pure: the islands pass the figures they computed.
 */
import { absurd } from '../algebra/match.ts';
import type { Locale } from '../domain/locale.ts';
import catalog from '../i18n/catalogs/labs.ts';
import { translator } from '../i18n/messages.ts';
import { GIBBS_FRACTION, type Crest, type Waveform } from './fourier.ts';
import { capitalize, fixed, frequency, list, percent, upTo } from './format.ts';
import { exponentSign } from './logistic.ts';
import { samplingRegime } from './sampling.ts';
import type { SymbolUnit } from './entropy.ts';

const tr = (locale: Locale) => translator(catalog, locale);

export interface FourierFigures {
  readonly wave: Waveform;
  readonly harmonics: number;
  readonly sigma: boolean;
  readonly crest: Crest | null;
  /** Largest |S_N − wave| over the plotted points (used for the continuous wave). */
  readonly maxError: number;
}

export const fourierSummary = (locale: Locale, f: FourierFigures): string => {
  const t = tr(locale);
  const common = {
    wave: t(`fourier.wave.${f.wave}`),
    n: upTo(locale, f.harmonics, 0),
    sigma: f.sigma ? t('fourier.withSigma') : '',
  };
  if (f.crest === null) return capitalize(t('fourier.summary.continuous', { ...common, error: fixed(locale, f.maxError, 3) }));
  if (f.crest.fraction <= 0) return capitalize(t('fourier.summary.below', { ...common, peak: fixed(locale, f.crest.peak, 3) }));
  return capitalize(
    t('fourier.summary.jump', {
      ...common,
      peak: fixed(locale, f.crest.peak, 3),
      overshoot: percent(locale, f.crest.fraction, 2),
      limit: percent(locale, GIBBS_FRACTION, 2),
    }),
  );
};

export interface SamplingFigures {
  readonly f: number;
  readonly fs: number;
  readonly phase: number;
  readonly alias: number;
  /** Largest |sample| (the critical case depends on it). */
  readonly amplitude: number;
}

export const samplingSummary = (locale: Locale, s: SamplingFigures): string => {
  const t = tr(locale);
  const base = { f: frequency(locale, s.f), fs: frequency(locale, s.fs), twice: frequency(locale, 2 * s.f) };
  const regime = samplingRegime(s.f, s.fs);
  switch (regime) {
    case 'faithful':
      return t('sampling.summary.faithful', { ...base, perCycle: upTo(locale, s.fs / s.f, 2) });
    case 'critical':
      return t('sampling.summary.critical', {
        ...base,
        phase: t('unit.degrees', { value: upTo(locale, s.phase, 0) }),
        amplitude: fixed(locale, s.amplitude, 2),
      });
    case 'aliased':
      return s.alias < 1e-9 * Math.max(1, s.fs)
        ? t('sampling.summary.constant', base)
        : t('sampling.summary.aliased', { ...base, alias: frequency(locale, s.alias) });
    default:
      return absurd(regime);
  }
};

export interface EntropyFiguresInput {
  readonly unit: SymbolUnit;
  readonly total: number;
  readonly distinct: number;
  readonly entropy: number;
  readonly conditional: number;
  readonly meanLength: number;
  /** Label of the most frequent symbol and its share of the text. */
  readonly top: string | null;
  readonly topShare: number;
}

export const entropySummary = (locale: Locale, e: EntropyFiguresInput): string => {
  const t = tr(locale);
  const bits = (v: number): string => t('unit.bitsPerSymbol', { value: fixed(locale, v, 3) });
  if (e.total === 0 || e.top === null) return t('entropy.summary.empty');
  if (e.distinct === 1) return t('entropy.summary.single', { top: e.top, total: upTo(locale, e.total, 0) });
  return t('entropy.summary', {
    total: upTo(locale, e.total, 0),
    unit: t(`entropy.unit.${e.unit}`),
    distinct: upTo(locale, e.distinct, 0),
    h: bits(e.entropy),
    l: bits(e.meanLength),
    cond: bits(e.conditional),
    top: e.top,
    share: percent(locale, e.topShare, 1),
  });
};

export interface ChannelFigures {
  readonly p: number;
  readonly capacity: number;
  readonly flips: number;
  readonly bits: number;
  /** 1-based positions of the flipped bits. */
  readonly positions: readonly number[];
}

/** Positions listed in the summary at most; beyond that only the count is read out. */
const MAX_POSITIONS = 8;

export const channelSummary = (locale: Locale, c: ChannelFigures): string => {
  const t = tr(locale);
  const positions =
    c.positions.length > 0 && c.positions.length <= MAX_POSITIONS
      ? t('channel.summary.positions', { list: list(locale, c.positions.map((p) => upTo(locale, p, 0))) })
      : '';
  return t('channel.summary', {
    p: fixed(locale, c.p, 3),
    c: t('unit.bitsPerUse', { value: fixed(locale, c.capacity, 3) }),
    flips: upTo(locale, c.flips, 0),
    n: upTo(locale, c.bits, 0),
    rate: percent(locale, c.bits > 0 ? c.flips / c.bits : 0, 1),
    positions,
  });
};

export interface LogisticFigures {
  readonly r: number;
  readonly x0: number;
  readonly lambda: number;
  readonly period: number | null;
}

export const logisticSummary = (locale: Locale, l: LogisticFigures): string => {
  const t = tr(locale);
  return t('logistic.summary', {
    r: fixed(locale, l.r, 3),
    x0: fixed(locale, l.x0, 2),
    behaviour:
      l.period === null
        ? t('logistic.summary.chaos')
        : t('logistic.summary.cycle', { n: upTo(locale, l.period, 0) }),
    lambda: fixed(locale, l.lambda, 3),
    sign: t(`logistic.sign.${exponentSign(l.lambda)}`),
  });
};

export interface CltFigures {
  readonly n: number;
  readonly samples: number;
  readonly distance: number;
  readonly bound: number;
}

export const cltSummary = (locale: Locale, c: CltFigures): string =>
  tr(locale)('clt.summary', {
    n: upTo(locale, c.n, 0),
    samples: upTo(locale, c.samples, 0),
    d: fixed(locale, c.distance, 4),
    bound: fixed(locale, c.bound, 2),
  });
