/**
 * The room's sound, played — the imperative shell of src/core/chrome/sound.ts (ADR 0014, decision 19).
 *
 * Imported by <ft-room-sound> only once the reader chose a sound, and given the AudioContext that the reader's
 * gesture unlocked. Every sample is computed here, from a seed (src/core/chrome/sound-synth.ts): no file is
 * downloaded. The graph:
 *
 *   rain   pink-noise bed → high-pass → low-pass → pan ─┐
 *          drops on the glass (Poisson, DROP_RATE × rainShare) ─┴→ level ─┐
 *   fire   brown-noise bed → low-pass, flickered by an LFO → pan ─┐       │
 *          crackles (Poisson, CRACKLE_RATE) → high-pass ──────────┴→ level ┤
 *   wind   pink-noise bed → band-pass, moved by an LFO and the draught → low-pass → pan → level ┤→ master
 *   pages  someone else's book (Poisson, AMBIENT_PAGE_RATE); the reader's, at each section → level ┤   ↓
 *   quill  strokes in words and lines (a Markov chain of writing) → high-pass → level ─────────────┘ limiter → out
 *
 * Each level is levelGain(step) × LAYER_TRIM × the room's share (the rain eases as the essay ends, the wind swells
 * with the draught) × sway (the slow animation of the mix), and glides to its target (setTargetAtTime), so no
 * change clicks. Events are scheduled a little ahead on the audio clock by a coarse timer (C. Wilson, "A Tale of
 * Two Clocks", 2013): the timer only decides what comes next, the audio thread keeps the time.
 *
 * Computing the samples takes tens of milliseconds, so it is not done in the task of the reader's click (it would
 * count against that interaction's next paint, INP): the graph is built at once, silent, and the samples are
 * computed in stages, one task each, after the next frame; each layer joins under the fade in as its samples are
 * ready. The beds are computed at 16 kHz (the graph filters them below 6.5 kHz), the short events at 24 kHz.
 */
import { mulberry32, type PrngState } from '../../core/ontology/prng.ts';
import {
  AMBIENT_PAGE_RATE,
  CRACKLE_RATE,
  DROP_RATE,
  LAYER_PAN,
  LAYER_TRIM,
  QUILL_START,
  SOUND_LAYERS,
  VARIANTS,
  crackleEvent,
  dropEvent,
  levelGain,
  nextArrival,
  nextStroke,
  pageTurnAllowed,
  rainShare,
  sway,
  windShare,
  type Mix,
  type Quill,
  type SoundEvent,
  type SoundLayer,
} from '../../core/chrome/sound.ts';
import { brownNoise, crackle, drop, page, pinkNoise, stroke, type Samples } from '../../core/chrome/sound-synth.ts';

/** What the room says about the reading now: the same models that draw it (src/core/chrome/room.ts). */
export interface Reading {
  /** rainfall(progress), RAIN_FLOOR … 1. */
  readonly rainfall: number;
  /** The draught of the scrolled page, −1 … 1. */
  readonly gust: number;
}

export interface RoomSound {
  /** Moves every layer to the levels of `mix` (a glide of a fraction of a second). */
  setMix(mix: Mix): void;
  /** The reader entered a section: a page turns in front of them, at most one per gesture (PAGE_GAP_S). */
  turnPage(): void;
  /** Fades out and suspends the audio thread (a hidden tab). */
  suspend(): Promise<void>;
  /** Resumes and fades in; false when the browser keeps the context suspended until another gesture. */
  resume(): Promise<boolean>;
  /** Releases the context for good; `fade` first (not when the page is being left). */
  close(fade: boolean): Promise<void>;
}

/**
 * Sample rates of the computed buffers (the context resamples them): the beds are filtered below 6.5 kHz, so
 * 16 kHz holds them; the drops, crackles and strokes reach higher. A third or a half of the work of 48 kHz.
 */
const BED_RATE = 16_000;
const EVENT_RATE = 24_000;
/** The scheduler's period, and how far ahead of the audio clock it places events (s). */
const TICK_MS = 100;
const LOOKAHEAD_S = 0.3;
/** How often the levels are retargeted (s), and their glide (time constant, s). */
const LEVEL_EVERY_S = 0.25;
const LEVEL_TAU = 0.4;
const FADER_TAU = 0.12;
/** Overall gain, and the time constants of the fades in and out (s). */
const MASTER = 1.4;
const FADE_IN_TAU = 0.8;
const FADE_OUT_TAU = 0.08;
/** Lengths of the three beds (s): distinct, so that their loops line up only every 210 s. */
const RAIN_BED_S = 7;
const WIND_BED_S = 5;
const FIRE_BED_S = 6;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const createRoomSound = (ctx: AudioContext, mix: Mix, seed: number, read: () => Reading): RoomSound => {
  let current = mix;
  let rng: PrngState = seed >>> 0;
  /** Where in the slow sway this visit starts, so that two readings do not breathe alike. */
  const phase = (seed >>> 0) % 997;
  let closed = false;
  /** Bumped by every suspend, resume and close: a fade that outlived its call does not act. */
  let epoch = 0;

  const uniform = (): number => {
    const [u, next] = mulberry32(rng);
    rng = next;
    return u;
  };
  const arrival = (rate: number): number => {
    const [gap, next] = nextArrival(rate, rng);
    rng = next;
    return gap;
  };
  const eventOf = (make: (state: PrngState) => readonly [SoundEvent, PrngState]): SoundEvent => {
    const [event, next] = make(rng);
    rng = next;
    return event;
  };

  const bufferOf = (samples: Samples, rate: number): AudioBuffer => {
    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  };
  const variants = (make: (rate: number, seed: PrngState) => Samples, salt: number): readonly AudioBuffer[] =>
    Array.from({ length: VARIANTS }, (_, i) =>
      bufferOf(make(EVENT_RATE, (seed + salt * 7919 + i * 104_729) >>> 0), EVENT_RATE),
    );
  const filter = (type: BiquadFilterType, frequency: number, q = Math.SQRT1_2): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  };
  const panner = (pan: number): StereoPannerNode => {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  };
  const chain = (nodes: readonly AudioNode[]): void => {
    nodes.reduce((from, to) => from.connect(to));
  };
  /** A slow oscillator added to a parameter: its value swings by ±depth around the one it is set to. */
  const lfo = (hz: number, depth: number, param: AudioParam): void => {
    const oscillator = ctx.createOscillator();
    oscillator.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.value = depth;
    oscillator.connect(gain).connect(param);
    oscillator.start();
  };
  const bed = (samples: Samples): AudioBufferSourceNode => {
    const source = ctx.createBufferSource();
    source.buffer = bufferOf(samples, BED_RATE);
    source.loop = true;
    source.start();
    return source;
  };

  // Master: silent until the beds run, then a fade in; a gentle limiter keeps a full mix from clipping.
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 8;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  chain([master, limiter, ctx.destination]);

  const layerGain = (): GainNode => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    return gain;
  };
  const level: Readonly<Record<SoundLayer, GainNode>> = {
    rain: layerGain(),
    fire: layerGain(),
    wind: layerGain(),
    pages: layerGain(),
    quill: layerGain(),
  };

  // The fixed part of each layer: filters, places and slow oscillators. The samples come in stages, below.
  const roar = filter('lowpass', 380, 1.1);
  lfo(0.37, 110, roar.frequency);
  const crackles = filter('highpass', 700);
  chain([crackles, level.fire]);
  const howl = filter('bandpass', 380, 0.9);
  lfo(0.071, 140, howl.frequency);
  const nib = filter('highpass', 2200);
  chain([nib, level.quill]);
  let drops: readonly AudioBuffer[] = [];
  let crackleSamples: readonly AudioBuffer[] = [];
  let strokes: readonly AudioBuffer[] = [];
  let pages: readonly AudioBuffer[] = [];

  /** The samples, one task each; an event whose samples are not ready yet is skipped (play() takes undefined). */
  const stages: readonly (() => void)[] = [
    // Rain on the glass: hiss between 0.5 and 6.5 kHz.
    () =>
      chain([
        bed(pinkNoise(RAIN_BED_S, BED_RATE, seed ^ 0x5eed_0001)),
        filter('highpass', 500),
        filter('lowpass', 6500),
        panner(LAYER_PAN.rain),
        level.rain,
      ]),
    // Fire: the low roar of brown noise, its brightness flickering.
    () => chain([bed(brownNoise(FIRE_BED_S, BED_RATE, seed ^ 0x5eed_0002)), roar, panner(LAYER_PAN.fire), level.fire]),
    // Wind: a band of noise that wanders slowly, and rises with the draught.
    () =>
      chain([
        bed(pinkNoise(WIND_BED_S, BED_RATE, seed ^ 0x5eed_0003)),
        howl,
        filter('lowpass', 1600),
        panner(LAYER_PAN.wind),
        level.wind,
      ]),
    () => {
      drops = variants(drop, 1);
      crackleSamples = variants(crackle, 2);
      strokes = variants(stroke, 3);
    },
    () => {
      pages = variants(page, 4);
    },
  ];
  let stage = 0;
  const build = (): void => {
    if (closed) return;
    stages[stage]?.();
    stage += 1;
    if (stage < stages.length) setTimeout(build, 0);
  };
  // After the next frame: the click that started the sound paints first.
  requestAnimationFrame(() => setTimeout(build, 0));

  /** One event: a buffer at its speed, loudness and place, gone from the graph once it has sounded. */
  const play = (buffer: AudioBuffer | undefined, when: number, e: SoundEvent, gain: number, into: AudioNode): void => {
    if (buffer === undefined) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = e.rate;
    const g = ctx.createGain();
    g.gain.value = e.gain * gain;
    const p = panner(e.pan);
    chain([source, g, p, into]);
    source.addEventListener('ended', () => p.disconnect(), { once: true });
    source.start(when);
  };

  // The event processes, each with the audio time of its next event.
  const start = ctx.currentTime;
  let dropAt = start + arrival(DROP_RATE);
  let crackleAt = start + arrival(CRACKLE_RATE);
  // Someone else's page: not in the first seconds, while the room is still coming in.
  let pageAt = start + 20 + arrival(AMBIENT_PAGE_RATE);
  let quill: Quill = QUILL_START;
  let [strokeGap, nextStrokeEvent, nextQuill, afterStroke] = nextStroke(quill, rng);
  rng = afterStroke;
  quill = nextQuill;
  let strokeAt = start + 2 + strokeGap;
  let lastTurn = Number.NEGATIVE_INFINITY;
  let leveled = Number.NEGATIVE_INFINITY;
  let reading: Reading = read();

  const retarget = (now: number, tau: number): void => {
    leveled = now;
    const t = now + phase;
    for (const l of SOUND_LAYERS) {
      const share = l === 'rain' ? rainShare(reading.rainfall) : l === 'wind' ? windShare(reading.gust) : 1;
      level[l].gain.setTargetAtTime(levelGain(current[l]) * LAYER_TRIM[l] * share * sway(t, l), now, tau);
    }
    howl.frequency.setTargetAtTime(300 + 300 * Math.min(1, Math.abs(reading.gust)), now, 0.5);
  };

  const tick = (): void => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD_S;
    reading = read();
    const rain = DROP_RATE * rainShare(reading.rainfall);
    // A late timer (a busy page, a throttled tab) does not pour out the events it missed: they restart from now.
    if (dropAt < now) dropAt = now + arrival(rain);
    while (dropAt < horizon) {
      const e = eventOf(dropEvent);
      if (current.rain > 0) play(drops[e.variant], dropAt, e, 0.6, level.rain);
      dropAt += arrival(rain);
    }
    if (crackleAt < now) crackleAt = now + arrival(CRACKLE_RATE);
    while (crackleAt < horizon) {
      const e = eventOf(crackleEvent);
      if (current.fire > 0) play(crackleSamples[e.variant], crackleAt, e, 0.8, crackles);
      crackleAt += arrival(CRACKLE_RATE);
    }
    if (pageAt < now) pageAt = now + arrival(AMBIENT_PAGE_RATE);
    while (pageAt < horizon) {
      // A book on the shelves to the left, quieter than the reader's own.
      const e: SoundEvent = {
        variant: Math.floor(uniform() * VARIANTS),
        gain: 0.35,
        pan: -0.55,
        rate: 0.9 + 0.2 * uniform(),
      };
      if (current.pages > 0) play(pages[e.variant], pageAt, e, 1, level.pages);
      pageAt += arrival(AMBIENT_PAGE_RATE);
    }
    if (strokeAt < now) strokeAt = now + 0.5;
    while (strokeAt < horizon) {
      if (current.quill > 0) play(strokes[nextStrokeEvent.variant], strokeAt, nextStrokeEvent, 1, nib);
      [strokeGap, nextStrokeEvent, nextQuill, afterStroke] = nextStroke(quill, rng);
      rng = afterStroke;
      quill = nextQuill;
      strokeAt += strokeGap;
    }
    if (now - leveled >= LEVEL_EVERY_S) retarget(now, LEVEL_TAU);
  };

  const timer = window.setInterval(tick, TICK_MS);
  retarget(ctx.currentTime, LEVEL_TAU);
  master.gain.setTargetAtTime(MASTER, ctx.currentTime, FADE_IN_TAU);
  tick();

  return {
    setMix(next) {
      current = next;
      if (ctx.state === 'running') retarget(ctx.currentTime, FADER_TAU);
    },

    turnPage() {
      const now = ctx.currentTime;
      if (closed || ctx.state !== 'running' || current.pages === 0 || !pageTurnAllowed(now, lastTurn)) return;
      lastTurn = now;
      const e: SoundEvent = {
        variant: Math.floor(uniform() * VARIANTS),
        gain: 1,
        pan: 0,
        rate: 0.95 + 0.1 * uniform(),
      };
      play(pages[e.variant], now + 0.02, e, 1, level.pages);
    },

    async suspend() {
      const mine = (epoch += 1);
      if (closed || ctx.state !== 'running') return;
      master.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT_TAU);
      await wait(FADE_OUT_TAU * 5000);
      if (mine === epoch && !closed) await ctx.suspend();
    },

    async resume() {
      const mine = (epoch += 1);
      if (closed) return false;
      try {
        await ctx.resume();
      } catch {
        return false;
      }
      if (mine !== epoch || closed || ctx.state !== 'running') return !closed && ctx.state === 'running';
      master.gain.setTargetAtTime(MASTER, ctx.currentTime, FADE_IN_TAU / 2);
      return true;
    },

    async close(fade) {
      epoch += 1;
      if (closed) return;
      closed = true;
      window.clearInterval(timer);
      if (fade && ctx.state === 'running') {
        master.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT_TAU);
        await wait(FADE_OUT_TAU * 5000);
      }
      await ctx.close().catch(() => undefined);
    },
  };
};
