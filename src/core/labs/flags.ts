/**
 * Flags and states — the video player of the essay "A segunda flag"
 * (src/content/essays/{pt,en}/{a-segunda-flag,the-second-flag}.md), run in two representations at once.
 *
 *   flags    three independent booleans, updated by the methods of the essay's demonstration code:
 *            each method sets the flags its author remembered to set, so 2³ = 8 configurations are
 *            writable although the domain has four situations;
 *   machine  a deterministic finite automaton (Rabin & Scott 1959) with the essay's transition table:
 *            the player is in exactly one of four states, and an event the state does not accept is
 *            refused instead of half-applied.
 *
 * A history of events is folded over both (the extended transition function δ̂ of the automaton, and
 * the same fold over the flag methods), so the same history always gives the same picture — which is
 * also why the lab's whole state is the history itself.
 *
 * `stop()` is not shown in the essay's excerpt; here it clears the three flags, the one reading under
 * which "stopped" is the all-false configuration of the essay's trace table.
 */
import { absurd } from '../algebra/match.ts';

export const PLAYER_EVENTS = ['play', 'pause', 'stop', 'rewind'] as const;
export type PlayerEvent = (typeof PLAYER_EVENTS)[number];

export const PLAYER_STATES = ['stopped', 'playing', 'paused', 'rewinding'] as const;
export type PlayerState = (typeof PLAYER_STATES)[number];

/** One letter per event: the lab's state string, permalink and scrolly steps are words over this alphabet. */
export const EVENT_CODE: Readonly<Record<PlayerEvent, string>> = { play: 'p', pause: 'a', stop: 's', rewind: 'r' };
export const EVENT_ALPHABET = PLAYER_EVENTS.map((e) => EVENT_CODE[e]).join('');
/** Longest history the lab keeps (the oldest events stay; further ones are not appended). */
export const MAX_EVENTS = 24;

/** The events a code word spells; letters outside the alphabet are skipped (the parameter spec rejects them earlier). */
export const eventsOf = (code: string): readonly PlayerEvent[] =>
  [...code].flatMap((letter) => {
    const event = PLAYER_EVENTS.find((e) => EVENT_CODE[e] === letter);
    return event === undefined ? [] : [event];
  });

export const codeOf = (events: readonly PlayerEvent[]): string => events.map((e) => EVENT_CODE[e]).join('');

export const FLAG_NAMES = ['isPlaying', 'isPaused', 'isRewinding'] as const;
export interface Flags {
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  readonly isRewinding: boolean;
}
export const NO_FLAGS: Flags = { isPlaying: false, isPaused: false, isRewinding: false };

/** The methods of the essay's code: each one touches only the flags its author thought of. */
export const applyToFlags = (flags: Flags, event: PlayerEvent): Flags => {
  switch (event) {
    case 'play':
      return { isPlaying: true, isPaused: false, isRewinding: false };
    case 'pause':
      return { ...flags, isPaused: true };
    case 'rewind':
      return { ...flags, isRewinding: true, isPlaying: false };
    case 'stop':
      return NO_FLAGS;
    default:
      return absurd(event);
  }
};

/** Number of configurations n independent flags can hold. */
export const configurations = (n: number): number => 2 ** n;

/** Index of a configuration in 0…7, reading the flags as bits in the order of FLAG_NAMES. */
export const configIndex = (flags: Flags): number =>
  (flags.isPlaying ? 4 : 0) + (flags.isPaused ? 2 : 0) + (flags.isRewinding ? 1 : 0);

export const flagsOfIndex = (index: number): Flags => ({
  isPlaying: (index & 4) !== 0,
  isPaused: (index & 2) !== 0,
  isRewinding: (index & 1) !== 0,
});

/** The configuration as written in the essay's tables: one binary digit per flag. */
export const bitsOf = (flags: Flags): string => configIndex(flags).toString(2).padStart(FLAG_NAMES.length, '0');

/** The situation a configuration describes, or null when it describes none. */
export const meaningOf = (flags: Flags): PlayerState | null => {
  switch (configIndex(flags)) {
    case 0:
      return 'stopped';
    case 4:
      return 'playing';
    case 2:
      return 'paused';
    case 1:
      return 'rewinding';
    default:
      return null;
  }
};

/** The essay's transition table: ten transitions; the six missing cells are events the state refuses. */
export const TRANSITIONS: Readonly<Record<PlayerState, Readonly<Partial<Record<PlayerEvent, PlayerState>>>>> = {
  stopped: { play: 'playing' },
  playing: { pause: 'paused', stop: 'stopped', rewind: 'rewinding' },
  paused: { play: 'playing', stop: 'stopped', rewind: 'rewinding' },
  rewinding: { play: 'playing', pause: 'paused', stop: 'stopped' },
};

/** δ made total by refusal: an event the state does not accept leaves it where it is, and says so. */
export const step = (
  state: PlayerState,
  event: PlayerEvent,
): { readonly state: PlayerState; readonly accepted: boolean } => {
  const next = TRANSITIONS[state][event];
  return next === undefined ? { state, accepted: false } : { state: next, accepted: true };
};

export interface TraceRow {
  readonly event: PlayerEvent;
  readonly flags: Flags;
  readonly meaning: PlayerState | null;
  readonly machine: PlayerState;
  readonly accepted: boolean;
}

export interface FlagsRun {
  readonly events: readonly PlayerEvent[];
  readonly trace: readonly TraceRow[];
  /** Where the flags ended, and what that configuration means (null: nothing). */
  readonly flags: Flags;
  readonly meaning: PlayerState | null;
  /** Where the automaton ended. */
  readonly machine: PlayerState;
  /** Events the automaton refused. */
  readonly refused: number;
  /** How many times each of the eight configurations was held, the initial one included. */
  readonly visits: readonly number[];
  /** 1-based position of the first event after which the flags described no situation, or null. */
  readonly firstMeaningless: number | null;
  /** The flags describe a situation, but not the one the automaton is in. */
  readonly disagree: boolean;
}

/** Folds a history over both representations (δ̂ and its flag counterpart), from the stopped player. */
export const run = (events: readonly PlayerEvent[]): FlagsRun => {
  const visits = Array.from({ length: configurations(FLAG_NAMES.length) }, () => 0);
  visits[0] = 1;
  let flags = NO_FLAGS;
  let machine: PlayerState = 'stopped';
  let refused = 0;
  let firstMeaningless: number | null = null;
  const trace: TraceRow[] = [];
  events.forEach((event, i) => {
    flags = applyToFlags(flags, event);
    const next = step(machine, event);
    machine = next.state;
    if (!next.accepted) refused += 1;
    const index = configIndex(flags);
    visits[index] = (visits[index] ?? 0) + 1;
    const meaning = meaningOf(flags);
    if (meaning === null && firstMeaningless === null) firstMeaningless = i + 1;
    trace.push({ event, flags, meaning, machine, accepted: next.accepted });
  });
  const meaning = meaningOf(flags);
  return {
    events,
    trace,
    flags,
    meaning,
    machine,
    refused,
    visits,
    firstMeaningless,
    disagree: meaning !== null && meaning !== machine,
  };
};

/**
 * Lower bound of the Shannon redundancy of n flags that hold k mutually exclusive situations
 * (the essay's equation: R ≥ 1 − log₂ k / n). 0 when the flags are exactly enough (k = 2ⁿ).
 */
export const minRedundancy = (n: number, k: number): number =>
  n <= 0 || k <= 0 ? 0 : Math.max(0, 1 - Math.log2(Math.min(k, configurations(n))) / n);

/** Redundancy of a source of entropy `h` bits written with n flags: the share of the n bits that tells nothing. */
export const redundancy = (h: number, n: number): number => (n <= 0 ? 0 : Math.min(1, Math.max(0, 1 - h / n)));
