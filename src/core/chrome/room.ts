/**
 * Reading room — the decisions behind the decorative scene of the essay pages (pure).
 *
 * The scene (a desk, a shelf, a window in the rain, a candle) is drawn by three.js in the gutters beside
 * the article (src/islands/elements/ft-reading-room.ts, src/islands/scenes/reading-room.ts). The rule of
 * the design is that the room makes the atmosphere and the reading keeps the priority; this module is
 * where that rule is decided, so it can be tested without a browser:
 *
 *   roomMode     whether the scene exists at all, as one frame or as an animation
 *   startTier    the resolution and frame rate it starts with
 *   govern       how it steps down, and finally stops, when frames arrive late
 *   calm         how much it quietens once the reader is inside the text
 *   flicker      the candle's intensity over time, band-limited below 3 Hz
 *   gutters      where, on the screen, the room is visible
 *   shelf codec  the corpus as books; burn, rainfall, kindle, gust: the room following the reading
 *
 * docs/adr/0014-sala-de-leitura.md records the decision and its costs.
 */
import { absurd } from '../algebra/match.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import { clamp01, smoothstep } from '../reading/scroll.ts';
import type { Daypart } from './daypart.ts';

export const ROOM_MODES = ['off', 'still', 'live'] as const;
export type RoomMode = (typeof ROOM_MODES)[number];

/** Order of the modes by how much the scene does: off < still < live. */
export const modeRank = (mode: RoomMode): number => ROOM_MODES.indexOf(mode);

/** Narrowest gutter (CSS px, on each side of the sheet) in which the room is worth its download. */
export const ROOM_MIN_GUTTER_PX = 96;

/** What the shell measures before deciding. Every field is a restriction or a capability, never a wish. */
export interface RoomEnvironment {
  /** The reader's preference: `auto` defers to the device, `on` asks for the room, `off` refuses it. */
  readonly preference: 'auto' | 'on' | 'off';
  /** Focus mode (preference `focus`): nothing decorative. */
  readonly focus: boolean;
  /** Width of the narrower gutter beside the sheet, in CSS px. */
  readonly gutterPx: number;
  /** A WebGL 2 context can be created. */
  readonly webgl: boolean;
  /** The context is rendered by the CPU (SwiftShader, llvmpipe): every frame costs the reader's battery. */
  readonly software: boolean;
  /** forced-colors: active — the system palette replaces the page's. */
  readonly forcedColors: boolean;
  /** The resolved --motion is 0 (prefers-reduced-motion, or the reader's preference). */
  readonly reducedMotion: boolean;
  /** Save-Data or prefers-reduced-data. */
  readonly reducedData: boolean;
  /** Increased contrast (prefers-contrast: more, or the reader's preference): no texture, no scene. */
  readonly moreContrast: boolean;
  /** navigator.hardwareConcurrency; 0 when unknown. */
  readonly cores: number;
  /** navigator.deviceMemory in GiB; null when the browser does not say. */
  readonly memoryGiB: number | null;
}

const lowEnd = (env: RoomEnvironment): boolean =>
  (env.cores > 0 && env.cores <= 2) || (env.memoryGiB !== null && env.memoryGiB <= 2);

/**
 * The mode of the scene. Hard limits hold whatever the reader asked for (no context, no gutter to show it
 * in, a system palette, focus mode); soft limits only bind `auto`, because a reader who turned the room on
 * knows the device better than a heuristic does. Reduced motion never removes the room: it stills it.
 *
 * Law (tests/unit/chrome/room.test.ts): adding a restriction never raises the mode.
 */
export const roomMode = (env: RoomEnvironment): RoomMode => {
  if (env.preference === 'off' || env.focus) return 'off';
  if (!env.webgl || env.forcedColors) return 'off';
  if (!(env.gutterPx >= ROOM_MIN_GUTTER_PX)) return 'off';
  if (env.preference === 'auto' && (env.reducedData || env.moreContrast || env.software)) return 'off';
  if (env.reducedMotion) return 'still';
  if (env.preference === 'auto' && lowEnd(env)) return 'still';
  return 'live';
};

/** A rung of the quality ladder: the cap on the device pixel ratio and the frame rate. */
export interface RoomTier {
  readonly pixelRatio: number;
  readonly fps: number;
}

/**
 * From best to cheapest. The scene is soft and dark, so it is rendered below the display's density from
 * the start: fragment work is proportional to the pixel count, and 1.5× already hides the sampling.
 */
export const ROOM_TIERS: readonly RoomTier[] = [
  { pixelRatio: 1.5, fps: 30 },
  { pixelRatio: 1, fps: 30 },
  { pixelRatio: 0.75, fps: 24 },
];

const tierAt = (index: number): RoomTier => ROOM_TIERS[index] ?? { pixelRatio: 1, fps: 30 };

/** The rung to start on: one step down on four cores or fewer. */
export const startTier = (cores: number): number => (cores > 0 && cores <= 4 ? 1 : 0);

/** The pixel ratio the renderer uses on a display of density `devicePixelRatio`. */
export const pixelRatioOf = (tier: number, devicePixelRatio: number): number => {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, tierAt(Math.max(0, Math.min(ROOM_TIERS.length - 1, Math.trunc(tier)))).pixelRatio);
};

/** Milliseconds between two rendered frames on a rung. */
export const frameIntervalOf = (tier: number): number =>
  1000 / tierAt(Math.max(0, Math.min(ROOM_TIERS.length - 1, Math.trunc(tier)))).fps;

/** The state of the governor: the rung, the smoothed interval between display frames, and the slow streak. */
export interface Governor {
  readonly tier: number;
  readonly ema: number;
  readonly slow: number;
  /** No rung is left: the shell keeps one frame and stops animating. */
  readonly exhausted: boolean;
}

export const governorAt = (tier: number): Governor => ({ tier, ema: 1000 / 60, slow: 0, exhausted: false });

/** A display frame slower than this (25 per second) is late. */
export const SLOW_FRAME_MS = 40;
/** Consecutive late samples before stepping down: a second and a half at 30 Hz. */
export const SLOW_STREAK = 45;
/** Intervals beyond this come from a throttled or hidden tab, not from the scene, and are ignored. */
export const STALL_MS = 250;
const EMA_WEIGHT = 0.1;

/**
 * One step of the governor: an exponential moving average of the interval between display frames; a streak
 * of late averages moves one rung down and starts over; below the last rung the governor is exhausted.
 * The rung never goes back up, so the scene cannot oscillate between two qualities.
 */
export const govern = (g: Governor, deltaMs: number): Governor => {
  if (g.exhausted || !Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > STALL_MS) return g;
  const ema = g.ema + EMA_WEIGHT * (deltaMs - g.ema);
  if (ema <= SLOW_FRAME_MS) return { ...g, ema, slow: 0 };
  if (g.slow + 1 < SLOW_STREAK) return { ...g, ema, slow: g.slow + 1 };
  return g.tier + 1 < ROOM_TIERS.length ? governorAt(g.tier + 1) : { tier: g.tier, ema, slow: 0, exhausted: true };
};

/** How quiet the room gets once the reader is one screen into the text. */
export const CALM_FLOOR = 0.45;

/**
 * Liveliness of the room in [CALM_FLOOR, 1]: 1 at the top of the page, easing down (smoothstep) to the
 * floor over the first screen of scrolling. It scales the rain's speed, the candle's flicker and the
 * scene's brightness: the further into the text, the less the room asks for.
 */
export const calm = (scrollY: number, viewportHeight: number): number => {
  if (!(viewportHeight > 0) || !Number.isFinite(scrollY)) return 1;
  return 1 - (1 - CALM_FLOOR) * smoothstep(clamp01(scrollY / viewportHeight));
};

/** Largest relative deviation of the candle's intensity from its mean. */
export const FLICKER_AMPLITUDE = 0.07;

/**
 * Partials of the flicker: [amplitude, frequency in Hz, phase in rad]. Amplitudes sum to FLICKER_AMPLITUDE;
 * the frequencies are whole multiples of 0.01 Hz, so the sum repeats every FLICKER_PERIOD_S seconds.
 */
const PARTIALS: readonly (readonly [number, number, number])[] = [
  [0.035, 1.3, 0],
  [0.022, 2.7, 1.7],
  [0.013, 0.37, 0.5],
];
export const FLICKER_PERIOD_S = 100;

/**
 * The candle's intensity at `seconds`, as a factor around 1: a sum of three sinusoids below 3 Hz whose
 * only common period is 100 s, so the light wavers without a visible loop and without ever flashing
 * (WCAG 2.2 SC 2.3.1 counts flashes above three per second; this stays under the rate and, at ±7 %, far
 * under the luminance change that defines a flash). `liveliness` (calm) scales the deviation.
 * Deterministic and total: the time is reduced modulo the period first, which also keeps the phase exact
 * in a tab left open for days (and finite for any finite input).
 */
export const flicker = (seconds: number, liveliness = 1): number => {
  if (!Number.isFinite(seconds)) return 1;
  const k = clamp01(liveliness);
  const t = seconds % FLICKER_PERIOD_S;
  return 1 + k * PARTIALS.reduce((sum, [a, f, phase]) => sum + a * Math.sin(2 * Math.PI * f * t + phase), 0);
};

/**
 * How much of the scene's light the candle gives, by colour scheme and time of day: by day the window
 * lights the room and the candle is a detail; at night it is the light.
 */
export const candleStrength = (scheme: 'light' | 'dark', daypart: Daypart): number => {
  const byDaypart: Readonly<Record<Daypart, number>> = { night: 1, dusk: 0.9, dawn: 0.7, day: 0.55 };
  return byDaypart[daypart] * (scheme === 'dark' ? 1 : 0.8);
};

/** The two strips of the viewport where the room shows, and where their centres are. */
export interface Gutters {
  /** Widths in CSS px. */
  readonly left: number;
  readonly right: number;
  /** Centres in normalised device coordinates (−1 at the left edge, 1 at the right). */
  readonly leftNdc: number;
  readonly rightNdc: number;
}

/**
 * The gutters beside a sheet whose edges are at `sheetLeft` and `sheetRight` (CSS px) in a viewport of
 * `viewportWidth`. Total: a sheet wider than the viewport, or a degenerate viewport, leaves no gutter.
 */
export const gutters = (viewportWidth: number, sheetLeft: number, sheetRight: number): Gutters => {
  if (!(viewportWidth > 0) || !Number.isFinite(sheetLeft) || !Number.isFinite(sheetRight)) {
    return { left: 0, right: 0, leftNdc: -1, rightNdc: 1 };
  }
  const l = Math.min(viewportWidth, Math.max(0, Math.min(sheetLeft, sheetRight)));
  const r = Math.min(viewportWidth, Math.max(l, Math.max(sheetLeft, sheetRight)));
  return {
    left: l,
    right: viewportWidth - r,
    leftNdc: l / viewportWidth - 1,
    rightNdc: r / viewportWidth,
  };
};

/* ───────────────────────── The room is this site's room ─────────────────────────
 * Nothing in the scene is stock: the shelf is the corpus, the candle is a reading clock, the rain eases
 * as the essay ends and the paperweight is the simplex of the essay's stratum. The functions below are
 * the data behind that; the scene only draws them.
 */

/** One work of the corpus as a book on the shelf. */
export interface ShelfBook {
  readonly stratum: Stratum;
  /** Essays are bound books (upper shelf); labs are notebooks (lower shelf). */
  readonly form: 'essay' | 'lab';
  /** Thickness class 0…9, from the length of the text (bookSize). */
  readonly size: number;
  /** The work being read: off the shelf, on the desk. */
  readonly current: boolean;
}

/** Books a shelf attribute may carry; older works beyond it are left out by the view. */
export const SHELF_MAX = 64;
const CHARACTERS_PER_SIZE = 3000;

/** Thickness class of a text of `characters` (Markdown source): one step per 3 000 characters, 0…9. */
export const bookSize = (characters: number): number =>
  Number.isFinite(characters) ? Math.max(0, Math.min(9, Math.floor(characters / CHARACTERS_PER_SIZE))) : 0;

const STRATUM_LETTER: Readonly<Record<Stratum, string>> = { philosophy: 'p', theory: 't', formal: 'f', value: 'v' };

/**
 * The shelf as an attribute value: per book, the stratum's initial (upper case for a lab), the size digit
 * and "*" for the current work — "f3v5*T1". Codec law: decodeShelf(encodeShelf(books)) = books for any
 * list of at most SHELF_MAX books with sizes in 0…9.
 */
export const encodeShelf = (books: readonly ShelfBook[]): string =>
  books
    .slice(0, SHELF_MAX)
    .map((b) => {
      const letter = STRATUM_LETTER[b.stratum];
      const size = Math.max(0, Math.min(9, Math.trunc(Number.isFinite(b.size) ? b.size : 0)));
      return `${b.form === 'lab' ? letter.toUpperCase() : letter}${String(size)}${b.current ? '*' : ''}`;
    })
    .join('');

/** Lenient and total: whatever is not a book is skipped, so a damaged attribute gives a shorter shelf. */
export const decodeShelf = (text: string | null | undefined): readonly ShelfBook[] => {
  const books: ShelfBook[] = [];
  for (const [, letter = '', digit = '0', star = ''] of (text ?? '').matchAll(/([ptfvPTFV])(\d)(\*?)/g)) {
    const stratum = STRATA.find((s) => STRATUM_LETTER[s] === letter.toLowerCase());
    if (stratum === undefined || books.length >= SHELF_MAX) continue;
    books.push({
      stratum,
      form: letter === letter.toUpperCase() ? 'lab' : 'essay',
      size: Number(digit),
      current: star === '*',
    });
  }
  return books;
};

/** The dimension of the simplex that stands for a stratum: point, segment, triangle, tetrahedron. */
export const simplexOf = (stratum: Stratum): 0 | 1 | 2 | 3 => {
  switch (stratum) {
    case 'philosophy':
      return 0;
    case 'theory':
      return 1;
    case 'formal':
      return 2;
    case 'value':
      return 3;
    default:
      return absurd(stratum);
  }
};

/** What is left of the candle when the essay is read to the end. */
export const CANDLE_STUB = 0.4;

/**
 * The candle as a reading clock: the fraction of its height left at reading `progress` (0 at the top of
 * the article, 1 at its end). Linear, like a candle clock: equal lengths of text burn equal lengths of wax.
 */
export const burn = (progress: number): number => 1 - (1 - CANDLE_STUB) * clamp01(progress);

/** How much it still rains when the essay ends. */
export const RAIN_FLOOR = 0.25;

/** The rain against reading progress: steady for the first three fifths, then easing to a drizzle. */
export const rainfall = (progress: number): number =>
  1 - (1 - RAIN_FLOOR) * smoothstep(clamp01((clamp01(progress) - 0.6) / 0.4));

/** Seconds the flame takes to catch when the room first appears. */
export const KINDLE_SECONDS = 1.8;

/** The flame catching: 0 at the moment the room appears, 1 once it burns steadily. */
export const kindle = (seconds: number): number =>
  Number.isFinite(seconds) ? smoothstep(clamp01(seconds / KINDLE_SECONDS)) : 1;

/** Seconds for a draught to fall to 1/e. */
export const GUST_DECAY_SECONDS = 0.6;

/**
 * The draught the page makes when it is scrolled, in [−1, 1]: it jumps to the scroll speed (one viewport
 * per second is a full draught, signed by direction) and decays exponentially when the page rests. The
 * flame leans with it; nothing else moves.
 */
export const gust = (previous: number, pixelsPerSecond: number, seconds: number, viewportHeight: number): number => {
  const before = Number.isFinite(previous) ? Math.max(-1, Math.min(1, previous)) : 0;
  const dt = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const decayed = before * Math.exp(-dt / GUST_DECAY_SECONDS);
  if (!(viewportHeight > 0) || !Number.isFinite(pixelsPerSecond)) return decayed;
  const target = Math.max(-1, Math.min(1, pixelsPerSecond / viewportHeight));
  return Math.abs(target) > Math.abs(decayed) ? target : decayed;
};
