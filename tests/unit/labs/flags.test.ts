/** The flags lab model: the essay's trace, the automaton's table and the laws of the two folds. */
import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  EVENT_ALPHABET,
  FLAG_NAMES,
  NO_FLAGS,
  PLAYER_EVENTS,
  PLAYER_STATES,
  TRANSITIONS,
  applyToFlags,
  bitsOf,
  codeOf,
  configIndex,
  configurations,
  eventsOf,
  flagsOfIndex,
  meaningOf,
  minRedundancy,
  redundancy,
  run,
  step,
  type PlayerState,
} from '../../../src/core/labs/flags.ts';
import { flagsSummary } from '../../../src/core/labs/summary.ts';

const event = fc.constantFrom(...PLAYER_EVENTS);
const history = fc.array(event, { maxLength: 24 });

describe('flags lab: the essay’s example', () => {
  it('reproduces the trace table of “A segunda flag”: play, pause, rewind', () => {
    const r = run(['play', 'pause', 'rewind']);
    expect(r.trace.map((row) => bitsOf(row.flags))).toEqual(['100', '110', '011']);
    expect(r.trace.map((row) => row.meaning)).toEqual(['playing', null, null]);
    expect(r.trace.map((row) => row.machine)).toEqual(['playing', 'paused', 'rewinding']);
    expect(r.firstMeaningless).toBe(2);
    expect(r.refused).toBe(0);
  });

  it('has the essay’s transition table: ten transitions and six refused cells', () => {
    const cells = PLAYER_STATES.flatMap((s) => PLAYER_EVENTS.map((e) => step(s, e)));
    expect(cells).toHaveLength(16);
    expect(cells.filter((c) => c.accepted)).toHaveLength(10);
    expect(cells.filter((c) => !c.accepted)).toHaveLength(6);
    expect(TRANSITIONS.stopped).toEqual({ play: 'playing' });
    expect(step('playing', 'play')).toEqual({ state: 'playing', accepted: false });
  });

  it('counts eight configurations for four situations and the essay’s minimum redundancy', () => {
    expect(configurations(FLAG_NAMES.length)).toBe(8);
    const meaningful = Array.from({ length: 8 }, (_, i) => meaningOf(flagsOfIndex(i))).filter((m) => m !== null);
    expect([...meaningful].sort()).toEqual([...PLAYER_STATES].sort());
    expect(minRedundancy(3, 4)).toBeCloseTo(1 / 3, 12);
    expect(minRedundancy(4, 4)).toBeCloseTo(0.5, 12);
    expect(minRedundancy(11, 11)).toBeCloseTo(0.69, 2);
    expect(minRedundancy(2, 4)).toBe(0);
    expect(minRedundancy(0, 4)).toBe(0);
  });

  it('lets the two representations disagree when the automaton refuses an event the flags accept', () => {
    const r = run(['pause']);
    expect(r.meaning).toBe('paused');
    expect(r.machine).toBe('stopped');
    expect(r.refused).toBe(1);
    expect(r.disagree).toBe(true);
  });
});

describe('flags lab: laws', () => {
  test.prop([fc.integer({ min: 0, max: 7 })])('configuration index and flags are inverse', (i) => {
    expect(configIndex(flagsOfIndex(i))).toBe(i);
    expect(bitsOf(flagsOfIndex(i))).toBe(i.toString(2).padStart(3, '0'));
  });

  test.prop([history])('the event code is a bijection on histories', (events) => {
    const code = codeOf(events);
    expect(eventsOf(code)).toEqual(events);
    expect([...code].every((c) => EVENT_ALPHABET.includes(c))).toBe(true);
  });

  it('skips letters outside the alphabet', () => {
    expect(eventsOf('pXa?')).toEqual(['play', 'pause']);
  });

  test.prop([history, history])(
    'the run is a fold: the end of a concatenation is the end of its second half started there',
    (a, b) => {
      const whole = run([...a, ...b]);
      const first = run(a);
      // Flags: apply b's events to where a ended.
      expect(whole.flags).toEqual(b.reduce(applyToFlags, first.flags));
      // Automaton: the extended transition function, δ̂(q, ab) = δ̂(δ̂(q, a), b).
      expect(whole.machine).toBe(b.reduce<PlayerState>((q, e) => step(q, e).state, first.machine));
      expect(whole.trace).toHaveLength(a.length + b.length);
    },
  );

  test.prop([history])('visits count every configuration held, the initial one included', (events) => {
    const r = run(events);
    expect(r.visits).toHaveLength(8);
    expect(r.visits.reduce((x, y) => x + y, 0)).toBe(events.length + 1);
    expect(r.refused).toBe(r.trace.filter((row) => !row.accepted).length);
    if (r.firstMeaningless !== null) expect(r.trace[r.firstMeaningless - 1]?.meaning).toBeNull();
    else expect(r.trace.every((row) => row.meaning !== null)).toBe(true);
  });

  test.prop([history])('stop() always brings the flags back to the stopped configuration', (events) => {
    const r = run([...events, 'stop']);
    expect(r.flags).toEqual(NO_FLAGS);
    expect(r.meaning).toBe('stopped');
  });

  test.prop([history])('the automaton is always in one of its four states', (events) => {
    expect(PLAYER_STATES).toContain(run(events).machine);
  });

  test.prop([fc.double({ min: 0, max: 3, noNaN: true })])(
    'redundancy stays within [0, 1] and falls as entropy rises',
    (h) => {
      const r = redundancy(h, 3);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(redundancy(Math.min(3, h + 0.1), 3)).toBeLessThanOrEqual(r);
      expect(redundancy(h, 0)).toBe(0);
    },
  );
});

describe('flags lab: text alternative', () => {
  it('describes the start, a short history and a long one in both locales', () => {
    expect(flagsSummary('pt-BR', run([]))).toContain('000');
    const pt = flagsSummary('pt-BR', run(['play', 'pause']));
    expect(pt).toContain('play() e pause()');
    expect(pt).toContain('110');
    expect(pt).toContain('não descreve situação alguma');
    expect(pt).toContain('“pausado”');
    const en = flagsSummary('en', run(['pause']));
    expect(en).toContain('which describes “paused”');
    expect(en).toContain('with 1 refused event');
    const long = flagsSummary('en', run(Array.from({ length: 9 }, () => 'play' as const)));
    expect(long).toContain('9 events, the last one play()');
    expect(long).toContain('with 8 refused events');
  });
});
