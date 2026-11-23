/**
 * The sound of the reading room (docs/adr/0014-sala-de-leitura.md, decision 19) — the pure model behind
 * <ft-room-sound>.
 *
 * A soundscape of independent layers that the reader mixes, modelled on the noise machines of myNoise (S.
 * Pigeon, "Medieval Library", 2020: layers with a level each, presets, and a slow animation of the levels so that
 * the mix never sits still), but drawn from this site's room: the rain on its window, the fire of its candle, the
 * wind, the pages of the essay and a copyist's quill. Nothing is recorded: this module decides WHAT sounds and
 * WHEN (levels, event times, positions); src/core/chrome/sound-synth.ts computes the samples and the shell
 * (src/islands/scenes/room-sound.ts) plays them with the Web Audio API.
 *
 * The room's own models drive it: the rain eases as the essay ends (rainfall, the reading clock of the window),
 * the wind follows the draught of the scrolled page (gust), and a page turns when the reader enters a section.
 */
import type { PrngState } from '../ontology/prng.ts';
import { mulberry32 } from '../ontology/prng.ts';
import { RAIN_FLOOR } from './room.ts';

export const SOUND_LAYERS = ['rain', 'fire', 'wind', 'pages', 'quill'] as const;
export type SoundLayer = (typeof SOUND_LAYERS)[number];

export const isSoundLayer = (v: unknown): v is SoundLayer =>
  typeof v === 'string' && (SOUND_LAYERS as readonly string[]).includes(v);

/** The level of every layer, 0 (silent) … MIX_MAX (full), in whole steps. */
export type Mix = { readonly [L in SoundLayer]: number };
export const MIX_MAX = 10;

/** Ready-made mixes, as on myNoise's machines ("The Quiet Room", "The Fireplace", "Paperwork"…). */
export const SOUND_PRESETS = {
  quiet: { rain: 5, fire: 4, wind: 2, pages: 3, quill: 3 },
  rain: { rain: 8, fire: 1, wind: 5, pages: 2, quill: 0 },
  fire: { rain: 2, fire: 8, wind: 1, pages: 3, quill: 0 },
  scribe: { rain: 2, fire: 3, wind: 0, pages: 5, quill: 7 },
} as const satisfies Readonly<Record<string, Mix>>;
export type SoundPreset = keyof typeof SOUND_PRESETS;
export const SOUND_PRESET_NAMES = Object.keys(SOUND_PRESETS) as readonly SoundPreset[];

/** The reader's choice: silence, a preset, or their own mix (kept under MIX_STORAGE_KEY). */
export const SOUND_CHOICES = ['off', ...SOUND_PRESET_NAMES, 'custom'] as const;
export type SoundChoice = (typeof SOUND_CHOICES)[number];

const isPreset = (v: unknown): v is SoundPreset => typeof v === 'string' && Object.hasOwn(SOUND_PRESETS, v);

/** A level as a whole step in 0…MIX_MAX; anything that is not a finite number is silence. */
export const clampLevel = (v: number): number =>
  Number.isFinite(v) ? Math.min(MIX_MAX, Math.max(0, Math.round(v))) : 0;

/** The mix a choice plays: none for silence, the preset's, or the reader's own (the quiet room until they made one). */
export const mixOf = (choice: unknown, stored: Mix | null): Mix | null => {
  if (isPreset(choice)) return SOUND_PRESETS[choice];
  if (choice === 'custom') return stored ?? SOUND_PRESETS.quiet;
  return null;
};

/** Storage key of the reader's own mix (the preference `sound` says whether it plays). */
export const MIX_STORAGE_KEY = 'ft:sound-mix';

/**
 * Dispatched on document by the mixer when the reader's own mix changes (detail: encodeMix of it, or the empty
 * string once forgotten), so the playing room follows a fader at once, with or without storage.
 */
export const SOUND_MIX_EVENT = 'ft:sound-mix';

/** A stored or attribute value as a choice; anything else is silence (the default, as decodePreferences does). */
export const soundChoiceOf = (v: unknown): SoundChoice =>
  typeof v === 'string' && (SOUND_CHOICES as readonly string[]).includes(v) ? (v as SoundChoice) : 'off';

/** Canonical JSON: every layer, in SOUND_LAYERS order, as a whole step. */
export const encodeMix = (mix: Mix): string =>
  JSON.stringify(Object.fromEntries(SOUND_LAYERS.map((l) => [l, clampLevel(mix[l])])));

/**
 * Tolerant decoder of a stored mix: null for nothing or for what is not an object; a layer that is missing or not
 * a number takes the quiet room's level, and every level is clamped to a whole step. decode ∘ encode = id.
 */
export const decodeMix = (raw: string | null | undefined): Mix | null => {
  if (raw === null || raw === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Readonly<Record<string, unknown>>;
  const level = (l: SoundLayer): number => {
    const v = record[l];
    return typeof v === 'number' && Number.isFinite(v) ? clampLevel(v) : SOUND_PRESETS.quiet[l];
  };
  return {
    rain: level('rain'),
    fire: level('fire'),
    wind: level('wind'),
    pages: level('pages'),
    quill: level('quill'),
  };
};

/** One layer changed, the others kept. */
export const withLevel = (mix: Mix, layer: SoundLayer, level: number): Mix => ({ ...mix, [layer]: clampLevel(level) });

/**
 * Amplitude of a level: 3 dB a step, so the ten steps span 30 dB and each sounds like the same change (loudness
 * follows a power law of amplitude, Stevens 1957); level 0 is silence.
 */
export const LEVEL_DB_STEP = 3;
export const levelGain = (level: number): number => {
  const l = clampLevel(level);
  return l === 0 ? 0 : 10 ** (((l - MIX_MAX) * LEVEL_DB_STEP) / 20);
};

/** How loud each layer sits at full level, relative to the others (a calibration of the synthesis). */
export const LAYER_TRIM: Readonly<Record<SoundLayer, number>> = {
  rain: 0.5,
  fire: 0.55,
  wind: 0.4,
  pages: 0.6,
  quill: 0.35,
};

/**
 * Where each layer stands, −1 (left) … 1 (right), as the room is laid out: the window and the candle on the
 * right, the copyist's desk and the shelves on the left, the essay's own pages in front of the reader.
 */
export const LAYER_PAN: Readonly<Record<SoundLayer, number>> = {
  rain: 0.45,
  fire: 0.3,
  wind: 0.25,
  pages: 0,
  quill: -0.35,
};

/**
 * The slow animation of the mix (myNoise's "soft" animation): each layer's level swells and recedes by
 * SWAY_DEPTH over its own period, prime numbers of seconds so that the layers never move together. Over a long
 * reading the mix is never the same twice, and the ear does not settle on it (habituation; Thompson & Spencer 1966).
 */
export const SWAY_DEPTH = 0.2;
const SWAY_PERIOD_S: Readonly<Record<SoundLayer, number>> = { rain: 67, fire: 41, wind: 29, pages: 83, quill: 53 };
const SWAY_PHASE: Readonly<Record<SoundLayer, number>> = { rain: 0, fire: 1.3, wind: 2.9, pages: 4.1, quill: 5.2 };
export const sway = (seconds: number, layer: SoundLayer): number =>
  Number.isFinite(seconds)
    ? 1 + SWAY_DEPTH * Math.sin((2 * Math.PI * seconds) / SWAY_PERIOD_S[layer] + SWAY_PHASE[layer])
    : 1;

/** The rain of the window eases as the essay ends (rainfall, RAIN_FLOOR…1): a drizzle at the end, never silence. */
export const rainShare = (rainfall: number): number => {
  const r = Number.isFinite(rainfall) ? Math.min(1, Math.max(RAIN_FLOOR, rainfall)) : 1;
  return 1 - 0.7 * (1 - (r - RAIN_FLOOR) / (1 - RAIN_FLOOR));
};

/** The wind swells with the draught of the scrolled page (gust, −1…1). */
export const windShare = (gust: number): number =>
  0.55 + 0.45 * Math.min(1, Math.abs(Number.isFinite(gust) ? gust : 0));

/** Drops on the glass per second at full rain, and crackles of the fire per second. */
export const DROP_RATE = 24;
export const CRACKLE_RATE = 2.2;
/** A page of someone else's book turns about every two minutes; the reader's own, at each new section. */
export const AMBIENT_PAGE_RATE = 1 / 120;
/** Turns closer than this are one gesture (a fast scroll through several sections turns one page, not five). */
export const PAGE_GAP_S = 4;

export const pageTurnAllowed = (now: number, last: number): boolean => !(now - last < PAGE_GAP_S);

/** The wait for the next event of a Poisson process of `rate` events per second (exponential gaps). */
export const nextArrival = (rate: number, state: PrngState): readonly [gap: number, next: PrngState] => {
  const [u, next] = mulberry32(state);
  return [rate > 0 && Number.isFinite(rate) ? -Math.log(1 - u) / rate : Number.POSITIVE_INFINITY, next];
};

/** One sounding event: which sample, how loud (0…1), where (−1…1) and at what speed (pitch). */
export interface SoundEvent {
  readonly variant: number;
  readonly gain: number;
  readonly pan: number;
  readonly rate: number;
}

/** Number of variants the synthesis renders of each kind of event. */
export const VARIANTS = 8;

const draws = (state: PrngState, n: number): readonly [readonly number[], PrngState] => {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i += 1) {
    const [v, next] = mulberry32(s);
    out.push(v);
    s = next;
  }
  return [out, s];
};

/** A drop on the glass: mostly soft (the square favours small drops), around the window, slightly varied in pitch. */
export const dropEvent = (state: PrngState): readonly [SoundEvent, PrngState] => {
  const [[a = 0, b = 0, c = 0, d = 0], next] = draws(state, 4);
  return [
    {
      variant: Math.floor(a * VARIANTS),
      gain: 0.2 + 0.8 * b * b,
      pan: Math.min(1, Math.max(-1, LAYER_PAN.rain + (c - 0.5) * 1.1)),
      rate: 0.85 + 0.4 * d,
    },
    next,
  ];
};

/** A crackle of the fire: sharp, at the candle, sometimes doubled. */
export const crackleEvent = (state: PrngState): readonly [SoundEvent, PrngState] => {
  const [[a = 0, b = 0, c = 0, d = 0], next] = draws(state, 4);
  return [
    {
      variant: Math.floor(a * VARIANTS),
      gain: 0.3 + 0.7 * b,
      pan: Math.min(1, Math.max(-1, LAYER_PAN.fire + (c - 0.5) * 0.3)),
      rate: 0.8 + 0.5 * d,
    },
    next,
  ];
};

/** Where a copyist is in their writing: strokes left in the word, words left in the line. */
export interface Quill {
  readonly strokes: number;
  readonly words: number;
}
export const QUILL_START: Quill = { strokes: 0, words: 0 };

/**
 * The next stroke of the quill (a Markov chain of writing): strokes follow one another within a word, a word
 * ends with a lift of the pen, a line with a pause to dip it. Returns the wait before the stroke, the stroke, the
 * new state of the writing and of the generator.
 */
export const nextStroke = (
  quill: Quill,
  state: PrngState,
): readonly [gap: number, event: SoundEvent, quill: Quill, next: PrngState] => {
  const [[a = 0, b = 0, c = 0, d = 0, e = 0], next] = draws(state, 5);
  const event: SoundEvent = {
    variant: Math.floor(a * VARIANTS),
    gain: 0.45 + 0.55 * b,
    pan: LAYER_PAN.quill + (c - 0.5) * 0.15,
    rate: 0.9 + 0.25 * d,
  };
  if (quill.strokes > 0) return [0.11 + 0.13 * e, event, { ...quill, strokes: quill.strokes - 1 }, next];
  const strokes = 2 + Math.floor(e * 6);
  if (quill.words > 0) return [0.35 + 0.55 * c, event, { strokes, words: quill.words - 1 }, next];
  return [2.5 + 4.5 * d, event, { strokes, words: 3 + Math.floor(b * 7) }, next];
};
