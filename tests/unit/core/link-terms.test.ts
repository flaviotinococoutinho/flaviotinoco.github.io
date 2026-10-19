import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  LEVELS,
  LINK_TERM_IDS,
  ROOTS,
  admits,
  ancestors,
  danglingReferences,
  checkLink,
  children,
  comparable,
  depth,
  isA,
  modeOf,
  needsNote,
  needsRatio,
  parseLinkTerm,
  signatureOf,
  spec,
  type Level,
} from '../../../src/core/domain/link-terms.ts';
import links from '../../../src/core/i18n/catalogs/links.ts';

const term = fc.constantFrom(...LINK_TERM_IDS);
const level = fc.constantFrom(...LEVELS);

describe('link-term taxonomy', () => {
  it('refers only to its own terms', () => {
    expect(danglingReferences()).toEqual([]);
  });

  it('is a forest of ten modes, each with at least one specific term, at most three levels deep', () => {
    expect(ROOTS).toEqual([
      'predication',
      'opposition',
      'mereology',
      'dependence',
      'causation',
      'signification',
      'instantiation',
      'analogy',
      'axiology',
      'dialectic',
    ]);
    for (const r of ROOTS) expect(children(r).length).toBeGreaterThan(0);
    for (const t of LINK_TERM_IDS) expect(depth(t)).toBeLessThanOrEqual(3);
  });

  test.prop([term])('every term descends from exactly one root mode', (t) => {
    expect(ROOTS).toContain(modeOf(t));
    expect(isA(t, modeOf(t))).toBe(true);
    expect(ancestors(t)).not.toContain(t);
  });

  test.prop([term])('converses are mutual, and symmetric terms are their own converse', (t) => {
    const c = spec(t).converse;
    if (spec(t).symmetric) expect(c).toBe(t);
    if (c !== null) expect(spec(c).converse).toBe(t);
  });

  test.prop([term, level, level])('a converse admits exactly the transposed level pairs', (t, a, b) => {
    const c = spec(t).converse;
    if (c === null || c === t) return;
    expect(admits(c, b, a)).toBe(admits(t, a, b));
  });

  test.prop([term])('every term has an effective signature', (t) => {
    expect(signatureOf(t).length).toBeGreaterThan(0);
  });

  test.prop([term])('a symmetric term admits a level pair iff it admits its transpose', (t) => {
    if (!spec(t).symmetric) return;
    for (const a of LEVELS) for (const b of LEVELS) expect(admits(t, a, b)).toBe(admits(t, b, a));
  });

  it('labels every term, mode and level in both locales', () => {
    for (const t of LINK_TERM_IDS) {
      expect(links['pt-BR'][`link.${t}`]).toBeTruthy();
      expect(links.en[`link.${t}`]).toBeTruthy();
    }
    for (const r of ROOTS) expect(links['pt-BR'][`mode.${r}` as keyof (typeof links)['pt-BR']]).toBeTruthy();
    for (const l of LEVELS) expect(links.en[`level.${l}`]).toBeTruthy();
  });

  it('places the dialectical kinds under attack, and the four causes under causation', () => {
    for (const k of ['counterexample', 'reductio', 'undercut', 'rebut', 'disconfirm', 'burden'] as const) {
      expect(isA(k, 'attacks')).toBe(true);
    }
    for (const k of ['material-cause-of', 'formal-cause-of', 'efficient-cause-of', 'final-cause-of'] as const) {
      expect(spec(k).parent).toBe('causation');
    }
    expect(isA('influenced', 'causation')).toBe(true);
    expect(isA('variety-of', 'predication')).toBe(true);
  });
});

describe('checking links', () => {
  it('accepts a sourced influence between agents and rejects one from a claim', () => {
    expect(checkLink({ type: 'influenced', from: 'agent', to: 'agent' })).toEqual({ ok: true, value: 'influenced' });
    const r = checkLink({ type: 'influenced', from: 'claim', to: 'agent' });
    expect(r.ok).toBe(false);
  });

  it('requires a ratio for analogies and a note for value relations', () => {
    expect(checkLink({ type: 'analogous-to', from: 'work', to: 'concept' }).ok).toBe(false);
    expect(
      checkLink({ type: 'analogous-to', from: 'work', to: 'concept', ratio: 'commit : history :: frame : film' }).ok,
    ).toBe(true);
    expect(checkLink({ type: 'benefits', from: 'agent', to: 'agent' }).ok).toBe(false);
    expect(checkLink({ type: 'benefits', from: 'agent', to: 'agent', note: 'funding for basic research' }).ok).toBe(
      true,
    );
    expect(needsRatio('isomorphic-to')).toBe(true);
    expect(needsNote('trades-off-with')).toBe(true);
  });

  test.prop([fc.string().filter((s) => !(LINK_TERM_IDS as readonly string[]).includes(s))])(
    'rejects unknown terms, inherited property names included',
    (s) => {
      expect(parseLinkTerm(s).ok).toBe(false);
    },
  );

  it('rejects inherited property names', () => {
    for (const s of ['toString', 'constructor', '__proto__']) expect(parseLinkTerm(s).ok).toBe(false);
  });
});

describe('comparability', () => {
  test.prop([level, level])('only things at the same level are comparable', (a: Level, b: Level) => {
    expect(comparable({ level: a, category: 'x' }, { level: b, category: 'x' })).toBe(a === b);
  });

  it('concepts are comparable only within the same category', () => {
    expect(comparable({ level: 'concept', category: 'measure' }, { level: 'concept', category: 'measure' })).toBe(true);
    expect(comparable({ level: 'concept', category: 'measure' }, { level: 'concept', category: 'process' })).toBe(
      false,
    );
    expect(comparable({ level: 'tool' }, { level: 'tool' })).toBe(true);
  });
});
