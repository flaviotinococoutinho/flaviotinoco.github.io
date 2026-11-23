/**
 * The sound of the reading room (src/core/chrome/sound.ts, sound-synth.ts): the mix and its codec, the levels
 * in decibels, how the room drives the layers, the event processes and the synthesised samples.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { RAIN_FLOOR } from '../../../src/core/chrome/room.ts';
import {
  LEVEL_DB_STEP,
  MIX_MAX,
  QUILL_START,
  SOUND_CHOICES,
  SOUND_LAYERS,
  SOUND_PRESETS,
  SWAY_DEPTH,
  VARIANTS,
  clampLevel,
  crackleEvent,
  decodeMix,
  dropEvent,
  encodeMix,
  levelGain,
  mixOf,
  nextArrival,
  nextStroke,
  pageTurnAllowed,
  rainShare,
  sway,
  windShare,
  withLevel,
  type Mix,
  type Quill,
} from '../../../src/core/chrome/sound.ts';
import {
  brownNoise,
  crackle,
  drop,
  loopable,
  page,
  pinkNoise,
  stroke,
  type Samples,
} from '../../../src/core/chrome/sound-synth.ts';
import { DEFAULT_PREFERENCES, PREFERENCE_DOMAINS } from '../../../src/core/chrome/preferences.ts';

const level = fc.integer({ min: 0, max: MIX_MAX });
const mixArb: fc.Arbitrary<Mix> = fc.record({ rain: level, fire: level, wind: level, pages: level, quill: level });
const seed = fc.nat({ max: 0xffffffff });

describe('the mix', () => {
  test.prop([mixArb])('decode ∘ encode = id', (m) => {
    expect(decodeMix(encodeMix(m))).toEqual(m);
  });

  it('decodes what is stored tolerantly: a missing or foreign layer takes the quiet room, levels are clamped', () => {
    expect(decodeMix(null)).toBeNull();
    expect(decodeMix('not json')).toBeNull();
    expect(decodeMix('[1, 2]')).toBeNull();
    expect(decodeMix('{}')).toEqual(SOUND_PRESETS.quiet);
    expect(decodeMix('{"rain": 99, "fire": -3, "wind": 2.6, "pages": "x"}')).toEqual({
      rain: 10,
      fire: 0,
      wind: 3,
      pages: SOUND_PRESETS.quiet.pages,
      quill: SOUND_PRESETS.quiet.quill,
    });
  });

  it('has presets that are mixes of whole steps, every layer heard in at least one of them', () => {
    for (const mix of Object.values(SOUND_PRESETS)) {
      for (const l of SOUND_LAYERS) expect(mix[l]).toBe(clampLevel(mix[l]));
    }
    for (const l of SOUND_LAYERS) expect(Object.values(SOUND_PRESETS).some((m) => m[l] > 0)).toBe(true);
  });

  it('plays nothing for silence, a preset as written, the reader’s own mix (or the quiet room) for custom', () => {
    const own = { rain: 1, fire: 2, wind: 3, pages: 4, quill: 5 };
    expect(mixOf('off', own)).toBeNull();
    expect(mixOf('rain', own)).toEqual(SOUND_PRESETS.rain);
    expect(mixOf('custom', own)).toEqual(own);
    expect(mixOf('custom', null)).toEqual(SOUND_PRESETS.quiet);
    expect(mixOf('loud', own)).toBeNull();
    expect(mixOf(undefined, own)).toBeNull();
  });

  it('is a preference: silent by default, with every preset and the reader’s own mix as choices', () => {
    expect(DEFAULT_PREFERENCES.sound).toBe('off');
    expect([...PREFERENCE_DOMAINS.sound]).toEqual([...SOUND_CHOICES]);
  });

  test.prop([mixArb, fc.constantFrom(...SOUND_LAYERS), fc.integer({ min: -5, max: 20 })])(
    'changes one layer, clamped, and keeps the others',
    (m, layer, v) => {
      const next = withLevel(m, layer, v);
      for (const l of SOUND_LAYERS) expect(next[l]).toBe(l === layer ? clampLevel(v) : m[l]);
    },
  );
});

describe('levels in decibels', () => {
  it('is silence at 0 and unity at the top', () => {
    expect(levelGain(0)).toBe(0);
    expect(levelGain(MIX_MAX)).toBe(1);
  });
  test.prop([fc.integer({ min: 2, max: MIX_MAX })])('moves by the same number of decibels at every step', (l) => {
    const db = 20 * Math.log10(levelGain(l) / levelGain(l - 1));
    expect(db).toBeCloseTo(LEVEL_DB_STEP, 9);
  });
});

describe('the room drives the layers', () => {
  test.prop([fc.double({ min: RAIN_FLOOR, max: 1, noNaN: true }), fc.double({ min: RAIN_FLOOR, max: 1, noNaN: true })])(
    'the rain follows the window: louder with more rain, a drizzle at the end, never silence',
    (a, b) => {
      if (a <= b) expect(rainShare(a)).toBeLessThanOrEqual(rainShare(b));
      expect(rainShare(a)).toBeGreaterThanOrEqual(0.3);
    },
  );
  it('takes the rain of the window at its ends, and is total', () => {
    expect(rainShare(1)).toBe(1);
    expect(rainShare(RAIN_FLOOR)).toBeCloseTo(0.3, 9);
    expect(rainShare(Number.NaN)).toBe(1);
  });
  test.prop([fc.double({ min: -3, max: 3, noNaN: true })])('the wind swells with the draught, either way', (g) => {
    expect(windShare(g)).toBeGreaterThanOrEqual(0.55);
    expect(windShare(g)).toBeLessThanOrEqual(1);
    expect(windShare(g)).toBeCloseTo(windShare(-g), 12);
  });
  test.prop([fc.double({ min: 0, max: 1e5, noNaN: true }), fc.constantFrom(...SOUND_LAYERS)])(
    'sways by at most SWAY_DEPTH',
    (t, layer) => {
      expect(Math.abs(sway(t, layer) - 1)).toBeLessThanOrEqual(SWAY_DEPTH + 1e-12);
    },
  );
  it('sways each layer on its own period: they do not move together', () => {
    const at = (t: number) => SOUND_LAYERS.map((l) => sway(t, l).toFixed(6));
    expect(new Set(at(10)).size).toBe(SOUND_LAYERS.length);
    expect(sway(Number.POSITIVE_INFINITY, 'rain')).toBe(1);
  });
  it('turns one page for a gesture, not one per section a fast scroll crosses', () => {
    expect(pageTurnAllowed(10, 0)).toBe(true);
    expect(pageTurnAllowed(10, 8)).toBe(false);
    expect(pageTurnAllowed(10, Number.NEGATIVE_INFINITY)).toBe(true);
  });
});

describe('events', () => {
  test.prop([fc.double({ min: 0.5, max: 40, noNaN: true }), seed])(
    'arrive as a Poisson process: the mean gap is 1 / rate (law of large numbers)',
    (rate, s0) => {
      let s = s0;
      let total = 0;
      const n = 4000;
      for (let i = 0; i < n; i += 1) {
        const [gap, next] = nextArrival(rate, s);
        expect(gap).toBeGreaterThanOrEqual(0);
        total += gap;
        s = next;
      }
      // Exponential gaps: the mean of 4000 has a standard error of (1/rate)/√4000 ≈ 1.6 %; 8 % is five of them.
      expect(Math.abs(total / n - 1 / rate) / (1 / rate)).toBeLessThan(0.08);
    },
  );
  it('never arrive at rate 0, and are deterministic for a seed', () => {
    expect(nextArrival(0, 1)[0]).toBe(Number.POSITIVE_INFINITY);
    expect(nextArrival(3, 42)).toEqual(nextArrival(3, 42));
  });
  test.prop([seed])('drops and crackles stay in range', (s) => {
    for (const make of [dropEvent, crackleEvent]) {
      const [e] = make(s);
      expect(e.variant).toBeGreaterThanOrEqual(0);
      expect(e.variant).toBeLessThan(VARIANTS);
      expect(e.gain).toBeGreaterThan(0);
      expect(e.gain).toBeLessThanOrEqual(1);
      expect(Math.abs(e.pan)).toBeLessThanOrEqual(1);
      expect(e.rate).toBeGreaterThan(0.5);
    }
  });
  test.prop([seed])('the quill writes strokes in words and words in lines, with longer waits at each level', (s0) => {
    let quill: Quill = QUILL_START;
    let s = s0;
    const within: number[] = [];
    const longer: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const [gap, event, next, state] = nextStroke(quill, s);
      expect(gap).toBeGreaterThan(0);
      expect(event.variant).toBeLessThan(VARIANTS);
      (quill.strokes > 0 ? within : longer).push(gap);
      quill = next;
      s = state;
    }
    expect(Math.max(...within)).toBeLessThan(Math.min(...longer));
  });
});

describe('synthesised samples', () => {
  const RATE = 8000;
  const bounded = (x: Samples): void => {
    for (const v of x) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  };
  const roughness = (x: Samples): number => {
    let sum = 0;
    for (let i = 1; i < x.length; i += 1) sum += Math.abs((x[i] ?? 0) - (x[i - 1] ?? 0));
    return sum / x.length;
  };

  it('are deterministic, bounded, and the events end at rest', () => {
    for (const make of [drop, crackle, stroke, page]) {
      const a = make(RATE, 7);
      expect(a).toEqual(make(RATE, 7));
      expect(a).not.toEqual(make(RATE, 8));
      bounded(a);
      expect(Math.abs(a[a.length - 1] ?? 1)).toBeLessThan(0.02);
    }
    expect(page(RATE, 1)).toHaveLength(Math.round(RATE * 0.6));
  });
  it('make beds that loop without a step, pink rougher than brown (−3 vs −6 dB per octave)', () => {
    const pink = pinkNoise(2, RATE, 3);
    const brown = brownNoise(2, RATE, 3);
    for (const bed of [pink, brown]) {
      bounded(bed);
      // The jump from the last sample to the first is no larger than a typical step inside the loop.
      expect(Math.abs((bed[0] ?? 0) - (bed[bed.length - 1] ?? 0))).toBeLessThan(4 * roughness(bed) + 1e-3);
    }
    expect(roughness(brown)).toBeLessThan(roughness(pink));
  });
  test.prop([fc.integer({ min: 4, max: 400 }), fc.integer({ min: 0, max: 200 })])(
    'loopable drops the crossfaded tail and keeps the rest',
    (n, fade) => {
      const x = Float32Array.from({ length: n }, (_, i) => Math.sin(i));
      const f = Math.min(fade, Math.floor(n / 2));
      const y = loopable(x, fade);
      expect(y).toHaveLength(n - f);
      for (let i = f; i < y.length; i += 1) expect(y[i]).toBe(x[i]);
    },
  );
});
