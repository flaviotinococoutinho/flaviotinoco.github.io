/**
 * Reading room (src/core/chrome/room.ts): the decisions that keep the scene behind the reading.
 * Laws: a restriction never raises the mode; the governor only steps down; the candle never flashes.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { DAYPARTS } from '../../../src/core/chrome/daypart.ts';
import {
  CALM_FLOOR,
  FLICKER_AMPLITUDE,
  FLICKER_PERIOD_S,
  ROOM_MIN_GUTTER_PX,
  ROOM_MODES,
  ROOM_TIERS,
  SLOW_FRAME_MS,
  SLOW_STREAK,
  STALL_MS,
  calm,
  candleStrength,
  flicker,
  frameIntervalOf,
  govern,
  governorAt,
  gutters,
  modeRank,
  pixelRatioOf,
  roomMode,
  startTier,
  CANDLE_STUB,
  GUST_DECAY_SECONDS,
  KINDLE_SECONDS,
  RAIN_FLOOR,
  SHELF_MAX,
  bookSize,
  burn,
  decodeShelf,
  encodeShelf,
  gust,
  kindle,
  rainfall,
  simplexOf,
  type Governor,
  type RoomEnvironment,
  type ShelfBook,
} from '../../../src/core/chrome/room.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';

const environment: fc.Arbitrary<RoomEnvironment> = fc.record({
  preference: fc.constantFrom('auto', 'on', 'off'),
  focus: fc.boolean(),
  gutterPx: fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: 0, max: 800 })),
  webgl: fc.boolean(),
  software: fc.boolean(),
  forcedColors: fc.boolean(),
  reducedMotion: fc.boolean(),
  reducedData: fc.boolean(),
  moreContrast: fc.boolean(),
  cores: fc.integer({ min: 1, max: 64 }),
  memoryGiB: fc.constantFrom(0.5, 1, 2, 4, 8),
});

/** The best case: every capability present, no restriction. */
const ideal: RoomEnvironment = {
  preference: 'auto',
  focus: false,
  gutterPx: 400,
  webgl: true,
  software: false,
  forcedColors: false,
  reducedMotion: false,
  reducedData: false,
  moreContrast: false,
  cores: 8,
  memoryGiB: 8,
};

/** Each way of making an environment more restrictive. */
const restrictions: readonly ((env: RoomEnvironment) => RoomEnvironment)[] = [
  (e) => ({ ...e, preference: e.preference === 'on' ? 'auto' : 'off' }),
  (e) => ({ ...e, focus: true }),
  (e) => ({ ...e, gutterPx: Number.isFinite(e.gutterPx) ? e.gutterPx / 2 : 0 }),
  (e) => ({ ...e, webgl: false }),
  (e) => ({ ...e, software: true }),
  (e) => ({ ...e, forcedColors: true }),
  (e) => ({ ...e, reducedMotion: true }),
  (e) => ({ ...e, reducedData: true }),
  (e) => ({ ...e, moreContrast: true }),
  (e) => ({ ...e, cores: Math.max(1, Math.floor(e.cores / 2)) }),
  (e) => ({ ...e, memoryGiB: e.memoryGiB === null ? 1 : e.memoryGiB / 2 }),
];

describe('roomMode', () => {
  it('is live in the ideal environment and still there under reduced motion', () => {
    expect(roomMode(ideal)).toBe('live');
    expect(roomMode({ ...ideal, reducedMotion: true })).toBe('still');
  });

  it('never exists without a context, a gutter, the page palette or outside focus mode', () => {
    for (const preference of ['auto', 'on'] as const) {
      expect(roomMode({ ...ideal, preference, webgl: false })).toBe('off');
      expect(roomMode({ ...ideal, preference, forcedColors: true })).toBe('off');
      expect(roomMode({ ...ideal, preference, focus: true })).toBe('off');
      expect(roomMode({ ...ideal, preference, gutterPx: ROOM_MIN_GUTTER_PX - 1 })).toBe('off');
      expect(roomMode({ ...ideal, preference, gutterPx: Number.NaN })).toBe('off');
      expect(roomMode({ ...ideal, preference, gutterPx: ROOM_MIN_GUTTER_PX })).toBe('live');
    }
  });

  it('lets the reader who asked for the room overrule the heuristics, not the hard limits', () => {
    const modest = { ...ideal, software: true, reducedData: true, moreContrast: true, cores: 2, memoryGiB: 1 };
    expect(roomMode(modest)).toBe('off');
    expect(roomMode({ ...modest, preference: 'on' })).toBe('live');
    expect(roomMode({ ...ideal, cores: 2 })).toBe('still');
    expect(roomMode({ ...ideal, memoryGiB: 2 })).toBe('still');
    expect(roomMode({ ...ideal, cores: 0, memoryGiB: null })).toBe('live');
    expect(roomMode({ ...ideal, preference: 'off' })).toBe('off');
  });

  test.prop([environment])('is total', (env) => {
    expect(ROOM_MODES).toContain(roomMode(env));
  });

  test.prop([environment, fc.integer({ min: 0, max: restrictions.length - 1 })])(
    'a restriction never raises the mode',
    (env, i) => {
      const restricted = (restrictions[i] ?? ((e: RoomEnvironment) => e))(env);
      expect(modeRank(roomMode(restricted))).toBeLessThanOrEqual(modeRank(roomMode(env)));
    },
  );

  test.prop([environment, environment])('live implies every hard condition', (base, capable) => {
    // Most random environments are off; borrow the capabilities of the ideal one so that live is reached often.
    const env = { ...base, webgl: true, forcedColors: false, focus: capable.focus, gutterPx: 96 + capable.cores };
    if (roomMode(env) !== 'live') return;
    expect(env.webgl && !env.forcedColors && !env.focus && !env.reducedMotion).toBe(true);
    expect(env.gutterPx).toBeGreaterThanOrEqual(ROOM_MIN_GUTTER_PX);
    expect(env.preference).not.toBe('off');
  });
});

describe('quality ladder', () => {
  it('goes from best to cheapest', () => {
    for (let i = 1; i < ROOM_TIERS.length; i++) {
      const a = ROOM_TIERS[i - 1];
      const b = ROOM_TIERS[i];
      expect(a !== undefined && b !== undefined && a.pixelRatio * a.fps > b.pixelRatio * b.fps).toBe(true);
    }
    expect(startTier(8)).toBe(0);
    expect(startTier(4)).toBe(1);
    expect(startTier(0)).toBe(0);
  });

  test.prop([fc.integer({ min: -3, max: 9 }), fc.double()])(
    'never renders above the display density nor above the cap',
    (tier, dpr) => {
      const ratio = pixelRatioOf(tier, dpr);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1.5);
      if (Number.isFinite(dpr) && dpr > 0) expect(ratio).toBeLessThanOrEqual(dpr);
      expect(frameIntervalOf(tier)).toBeGreaterThanOrEqual(1000 / 30);
    },
  );
});

describe('governor', () => {
  const run = (g: Governor, deltas: readonly number[]): Governor => deltas.reduce(govern, g);

  it('stays put on a healthy display', () => {
    const g = run(governorAt(0), Array<number>(600).fill(1000 / 60));
    expect(g).toMatchObject({ tier: 0, slow: 0, exhausted: false });
  });

  it('steps down after a streak of late frames and gives up below the last rung', () => {
    const late = Array<number>(400).fill(SLOW_FRAME_MS * 2);
    const one = run(governorAt(0), late.slice(0, SLOW_STREAK + 30));
    expect(one.tier).toBe(1);
    const end = run(governorAt(0), [...late, ...late, ...late]);
    expect(end.exhausted).toBe(true);
    expect(end.tier).toBe(ROOM_TIERS.length - 1);
  });

  it('ignores the gap left by a hidden tab', () => {
    const g = governorAt(0);
    expect(govern(g, STALL_MS + 1)).toBe(g);
    expect(govern(g, Number.NaN)).toBe(g);
    expect(govern(g, -5)).toBe(g);
  });

  test.prop([fc.array(fc.double({ min: 0, max: 400, noNaN: true }), { maxLength: 500 })])(
    'never climbs back up and never leaves the ladder',
    (deltas) => {
      let g = governorAt(0);
      for (const d of deltas) {
        const next = govern(g, d);
        expect(next.tier).toBeGreaterThanOrEqual(g.tier);
        expect(next.tier).toBeLessThan(ROOM_TIERS.length);
        if (g.exhausted) expect(next).toBe(g);
        g = next;
      }
    },
  );
});

describe('calm', () => {
  it('is 1 at the top and the floor one screen down', () => {
    expect(calm(0, 900)).toBe(1);
    expect(calm(900, 900)).toBeCloseTo(CALM_FLOOR, 12);
    expect(calm(5000, 900)).toBeCloseTo(CALM_FLOOR, 12);
    expect(calm(100, 0)).toBe(1);
    expect(calm(Number.NaN, 900)).toBe(1);
  });

  test.prop([
    fc.double({ min: 0, max: 1e5, noNaN: true }),
    fc.double({ min: 0, max: 1e5, noNaN: true }),
    fc.double({ min: 1, max: 4000, noNaN: true }),
  ])('never grows with scrolling and stays within [floor, 1]', (a, b, h) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    expect(calm(hi, h)).toBeLessThanOrEqual(calm(lo, h) + 1e-12);
    expect(calm(lo, h)).toBeGreaterThanOrEqual(CALM_FLOOR - 1e-12);
    expect(calm(lo, h)).toBeLessThanOrEqual(1);
  });
});

describe('candle', () => {
  test.prop([fc.double(), fc.double()])('wavers within the amplitude, whatever the time', (t, k) => {
    expect(Math.abs(flicker(t, k) - 1)).toBeLessThanOrEqual(FLICKER_AMPLITUDE + 1e-12);
  });

  test.prop([fc.double({ min: 0, max: 1e6, noNaN: true }), fc.integer({ min: 1, max: 50 })])(
    'repeats with its period',
    (t, k) => {
      const base = t % FLICKER_PERIOD_S;
      expect(flicker(base + k * FLICKER_PERIOD_S)).toBeCloseTo(flicker(base), 6);
    },
  );

  test.prop([fc.double({ min: 0, max: 3600, noNaN: true })])('is steady when the liveliness is zero', (t) => {
    expect(flicker(t, 0)).toBe(1);
  });

  it('changes by less than a flash between two frames at 24 Hz', () => {
    // Largest slope: Σ a·2πf ≈ 0.69 per second, so ≤ 3 % per frame at the slowest rung.
    let worst = 0;
    for (let i = 0; i < 24 * 120; i++) worst = Math.max(worst, Math.abs(flicker((i + 1) / 24) - flicker(i / 24)));
    expect(worst).toBeLessThan(0.03);
  });

  it('is strongest at night and in the dark scheme', () => {
    for (const d of DAYPARTS) {
      expect(candleStrength('dark', d)).toBeGreaterThan(candleStrength('light', d));
      expect(candleStrength('dark', 'night')).toBeGreaterThanOrEqual(candleStrength('dark', d));
      expect(candleStrength('light', d)).toBeGreaterThan(0);
    }
  });
});

describe('gutters', () => {
  it('measures the strips beside the sheet', () => {
    expect(gutters(1920, 385, 1535)).toEqual({
      left: 385,
      right: 385,
      leftNdc: 385 / 1920 - 1,
      rightNdc: 1535 / 1920,
    });
    expect(gutters(0, 10, 20)).toEqual({ left: 0, right: 0, leftNdc: -1, rightNdc: 1 });
  });

  test.prop([fc.double({ min: 1, max: 8000, noNaN: true }), fc.double(), fc.double()])(
    'is total: widths are non-negative, add up to at most the viewport, centres stay on their side',
    (w, a, b) => {
      const g = gutters(w, a, b);
      expect(g.left).toBeGreaterThanOrEqual(0);
      expect(g.right).toBeGreaterThanOrEqual(0);
      expect(g.left + g.right).toBeLessThanOrEqual(w + 1e-9);
      expect(g.leftNdc).toBeGreaterThanOrEqual(-1);
      expect(g.leftNdc).toBeLessThanOrEqual(g.rightNdc);
      expect(g.rightNdc).toBeLessThanOrEqual(1);
    },
  );
});

describe('shelf: the corpus as books', () => {
  const book: fc.Arbitrary<ShelfBook> = fc.record({
    stratum: fc.constantFrom(...STRATA),
    form: fc.constantFrom('essay', 'lab'),
    size: fc.integer({ min: 0, max: 9 }),
    current: fc.boolean(),
  });

  test.prop([fc.array(book, { maxLength: SHELF_MAX })])('decode ∘ encode = id', (books) => {
    expect(decodeShelf(encodeShelf(books))).toEqual(books);
  });

  test.prop([fc.string()])('decoding is total and never exceeds the shelf', (text) => {
    const books = decodeShelf(text);
    expect(books.length).toBeLessThanOrEqual(SHELF_MAX);
    for (const b of books) {
      expect(STRATA).toContain(b.stratum);
      expect(b.size >= 0 && b.size <= 9).toBe(true);
    }
  });

  it('reads the documented example and skips what is not a book', () => {
    expect(decodeShelf('f3v5*T1')).toEqual([
      { stratum: 'formal', form: 'essay', size: 3, current: false },
      { stratum: 'value', form: 'essay', size: 5, current: true },
      { stratum: 'theory', form: 'lab', size: 1, current: false },
    ]);
    expect(decodeShelf('x9 f f2 ??')).toEqual([{ stratum: 'formal', form: 'essay', size: 2, current: false }]);
    expect(decodeShelf(null)).toEqual([]);
    expect(
      encodeShelf(Array<ShelfBook>(SHELF_MAX + 5).fill({ stratum: 'value', form: 'essay', size: 1, current: false })),
    ).toHaveLength(SHELF_MAX * 2);
  });

  test.prop([fc.double()])('book size is a class in 0…9 and grows with the text', (characters) => {
    const size = bookSize(characters);
    expect(Number.isInteger(size) && size >= 0 && size <= 9).toBe(true);
    if (Number.isFinite(characters)) expect(bookSize(characters + 3000)).toBeGreaterThanOrEqual(size);
  });

  it('gives each stratum its simplex, in the order of the bridge', () => {
    expect(STRATA.map(simplexOf)).toEqual([0, 1, 2, 3]);
  });
});

describe('the room follows the reading', () => {
  test.prop([fc.double(), fc.double()])('the candle only burns down, and never below the stub', (a, b) => {
    for (const p of [a, b]) {
      expect(burn(p)).toBeGreaterThanOrEqual(CANDLE_STUB - 1e-12);
      expect(burn(p)).toBeLessThanOrEqual(1);
    }
    if (!Number.isNaN(a) && !Number.isNaN(b) && a <= b) expect(burn(b)).toBeLessThanOrEqual(burn(a) + 1e-12);
  });

  it('is a linear clock: half the text, half the burnable wax', () => {
    expect(burn(0)).toBe(1);
    expect(burn(1)).toBeCloseTo(CANDLE_STUB, 12);
    expect(burn(0.5)).toBeCloseTo((1 + CANDLE_STUB) / 2, 12);
  });

  test.prop([fc.double(), fc.double()])('the rain never picks up as the reading advances', (a, b) => {
    expect(rainfall(a)).toBeGreaterThanOrEqual(RAIN_FLOOR - 1e-12);
    expect(rainfall(a)).toBeLessThanOrEqual(1);
    if (!Number.isNaN(a) && !Number.isNaN(b) && a <= b) expect(rainfall(b)).toBeLessThanOrEqual(rainfall(a) + 1e-12);
  });

  it('keeps raining for the first three fifths and ends as a drizzle', () => {
    expect(rainfall(0)).toBe(1);
    expect(rainfall(0.6)).toBe(1);
    expect(rainfall(1)).toBeCloseTo(RAIN_FLOOR, 12);
  });

  test.prop([fc.double()])('the flame catches once: kindle is within [0, 1] and complete after its time', (t) => {
    expect(kindle(t)).toBeGreaterThanOrEqual(0);
    expect(kindle(t)).toBeLessThanOrEqual(1);
    if (Number.isFinite(t) && t >= KINDLE_SECONDS) expect(kindle(t)).toBe(1);
  });

  test.prop([fc.double(), fc.double(), fc.double(), fc.double()])(
    'a draught is always within [−1, 1]',
    (g, v, dt, h) => {
      const next = gust(g, v, dt, h);
      expect(next).toBeGreaterThanOrEqual(-1);
      expect(next).toBeLessThanOrEqual(1);
    },
  );

  it('a draught follows the scroll and dies when the page rests', () => {
    expect(gust(0, 900, 1 / 30, 900)).toBe(1);
    expect(gust(0, -450, 1 / 30, 900)).toBe(-0.5);
    let g = 1;
    for (let i = 0; i < 30 * 5; i++) g = gust(g, 0, 1 / 30, 900);
    expect(Math.abs(g)).toBeLessThan(0.001);
    expect(gust(1, 0, GUST_DECAY_SECONDS, 900)).toBeCloseTo(Math.exp(-1), 12);
  });
});
