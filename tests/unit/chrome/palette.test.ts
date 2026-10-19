import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  INITIAL_PALETTE,
  foldForSearch,
  inLocale,
  rankQuickNav,
  scoreItem,
  stepPalette,
  toPaletteKey,
  type PaletteEvent,
  type PaletteState,
} from '../../../src/core/chrome/palette.ts';
import { isPaletteShortcut, type KeyChord } from '../../../src/core/chrome/shortcut.ts';

const eventArb: fc.Arbitrary<PaletteEvent> = fc.oneof(
  fc.string({ maxLength: 6 }).map((query): PaletteEvent => ({ type: 'query', query })),
  fc.integer({ min: -3, max: 12 }).map((count): PaletteEvent => ({ type: 'results', count })),
  fc
    .constantFrom('ArrowDown', 'ArrowUp', 'Enter', 'Escape' as const)
    .map((key): PaletteEvent => ({ type: 'key', key })),
  fc.integer({ min: -2, max: 12 }).map((index): PaletteEvent => ({ type: 'point', index })),
);

const run = (events: readonly PaletteEvent[]): PaletteState =>
  events.reduce((s, e) => stepPalette(s, e).state, INITIAL_PALETTE);

const stateArb: fc.Arbitrary<PaletteState> = fc.array(eventArb, { maxLength: 30 }).map(run);

describe('palette keyboard model (APG combobox + listbox)', () => {
  test.prop([fc.array(eventArb, { maxLength: 60 })])(
    'invariant: -1 ≤ active < count, chosen ⇒ active ≥ 0',
    (events) => {
      let s = INITIAL_PALETTE;
      for (const e of events) {
        s = stepPalette(s, e).state;
        expect(s.active).toBeGreaterThanOrEqual(-1);
        expect(s.active).toBeLessThan(Math.max(s.count, 0) || 1);
        if (s.count === 0) expect(s.active).toBe(-1);
        if (s.chosen) expect(s.active).toBeGreaterThanOrEqual(0);
      }
    },
  );

  // Regression (review chrome#0): full-text hits arrive ≥ 144 ms after the keystroke and are
  // appended to the quick-navigation options; they used to reset the selection to the first
  // option, so Enter opened a page the reader had not chosen.
  test.prop([
    stateArb,
    fc.string({ minLength: 1, maxLength: 6 }),
    fc.integer({ min: 1, max: 8 }),
    fc.array(fc.constantFrom('ArrowDown', 'ArrowUp' as const), { minLength: 1, maxLength: 12 }),
    fc.integer({ min: 0, max: 8 }),
  ])(
    'results for the same query keep the option the reader chose (query → arrows → results)',
    (start, query, quickCount, keys, appended) => {
      let s = stepPalette(start, { type: 'query', query }).state;
      s = stepPalette(s, { type: 'results', count: quickCount }).state;
      for (const key of keys) s = stepPalette(s, { type: 'key', key }).state;
      const chosen = s.active;
      const after = stepPalette(s, { type: 'results', count: quickCount + appended }).state;
      expect(after.active).toBe(chosen);
      expect(stepPalette(after, { type: 'key', key: 'Enter' }).effect).toEqual({ kind: 'follow', index: chosen });
    },
  );

  test.prop([
    stateArb,
    fc.string({ minLength: 1, maxLength: 6 }).filter((q) => q.trim() !== ''),
    fc.integer({ min: 1, max: 8 }),
  ])('a new query forgets the choice and selects its first result', (start, query, count) => {
    const moved = stepPalette(stepPalette(start, { type: 'results', count }).state, { type: 'key', key: 'ArrowUp' });
    const s = stepPalette(stepPalette(moved.state, { type: 'query', query }).state, { type: 'results', count }).state;
    expect(s).toEqual({ query, count, active: 0, chosen: false });
  });

  it('falls back to automatic selection when the chosen option is no longer listed', () => {
    const s = run([
      { type: 'query', query: 'ent' },
      { type: 'results', count: 5 },
      { type: 'key', key: 'ArrowUp' },
    ]);
    expect(s).toEqual({ query: 'ent', count: 5, active: 4, chosen: true });
    expect(stepPalette(s, { type: 'results', count: 3 }).state).toEqual({
      query: 'ent',
      count: 3,
      active: 0,
      chosen: false,
    });
    expect(stepPalette(s, { type: 'results', count: 0 }).state).toEqual({
      query: 'ent',
      count: 0,
      active: -1,
      chosen: false,
    });
  });

  it('a pointer choice is kept like a keyboard one', () => {
    const s = run([
      { type: 'query', query: 'ent' },
      { type: 'results', count: 3 },
      { type: 'point', index: 2 },
      { type: 'results', count: 7 },
    ]);
    expect(s).toEqual({ query: 'ent', count: 7, active: 2, chosen: true });
  });

  test.prop([stateArb])('ArrowDown then ArrowUp returns to an active option', (s) => {
    fc.pre(s.count > 0 && s.active >= 0);
    const down = stepPalette(s, { type: 'key', key: 'ArrowDown' }).state;
    const back = stepPalette(down, { type: 'key', key: 'ArrowUp' }).state;
    expect(back.active).toBe(s.active);
  });

  test.prop([stateArb])('count presses of ArrowDown cycle back (wrap-around)', (s) => {
    fc.pre(s.count > 0 && s.active >= 0);
    let t = s;
    for (let i = 0; i < s.count; i++) t = stepPalette(t, { type: 'key', key: 'ArrowDown' }).state;
    expect(t.active).toBe(s.active);
  });

  test.prop([stateArb])('arrow keys are always handled (the caret must not move)', (s) => {
    expect(stepPalette(s, { type: 'key', key: 'ArrowDown' }).handled).toBe(true);
    expect(stepPalette(s, { type: 'key', key: 'ArrowUp' }).handled).toBe(true);
  });

  test.prop([stateArb])('Enter follows the active option, and only it', (s) => {
    const step = stepPalette(s, { type: 'key', key: 'Enter' });
    expect(step.effect).toEqual(s.active >= 0 ? { kind: 'follow', index: s.active } : { kind: 'none' });
    expect(step.state).toEqual(s);
  });

  it('Escape closes', () => {
    expect(stepPalette(INITIAL_PALETTE, { type: 'key', key: 'Escape' }).effect).toEqual({ kind: 'close' });
  });

  it('selects the first result automatically for a non-empty query', () => {
    const s = run([
      { type: 'query', query: 'ent' },
      { type: 'results', count: 4 },
    ]);
    expect(s.active).toBe(0);
    const empty = run([
      { type: 'query', query: '  ' },
      { type: 'results', count: 4 },
    ]);
    expect(empty.active).toBe(-1);
  });

  it('ArrowUp from no selection goes to the last option; ArrowDown to the first', () => {
    const s: PaletteState = { query: '', count: 5, active: -1, chosen: false };
    expect(stepPalette(s, { type: 'key', key: 'ArrowUp' }).state.active).toBe(4);
    expect(stepPalette(s, { type: 'key', key: 'ArrowDown' }).state.active).toBe(0);
  });

  it('pointer moves the active option only within range', () => {
    const s: PaletteState = { query: 'a', count: 3, active: 0, chosen: false };
    expect(stepPalette(s, { type: 'point', index: 2 }).state.active).toBe(2);
    expect(stepPalette(s, { type: 'point', index: 3 }).state.active).toBe(0);
    expect(stepPalette(s, { type: 'point', index: -1 }).state.active).toBe(0);
  });

  it('leaves Home, End and printable keys to the text field', () => {
    for (const k of ['Home', 'End', 'a', ' ', 'Tab', 'PageDown']) expect(toPaletteKey(k)).toBeNull();
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) expect(toPaletteKey(k)).toBe(k);
  });
});

describe('quick navigation ranking', () => {
  const items = [
    { label: 'Ensaios', keywords: 'essays textos' },
    { label: 'Laboratório', keywords: 'lab experimentos' },
    { label: 'Ontologia', keywords: 'conceitos grafo skos' },
    { label: 'Colofão', keywords: 'colophon tipografia' },
    { label: 'Filosofia', keywords: 'estrato pergunta' },
  ] as const;

  it('folds diacritics and case', () => {
    expect(foldForSearch('Colofão')).toBe('colofao');
    expect(foldForSearch('LABORATÓRIO')).toBe('laboratorio');
    expect(rankQuickNav(items, 'colofao').map((i) => i.label)).toEqual(['Colofão']);
    expect(rankQuickNav(items, 'LABORAT').map((i) => i.label)).toEqual(['Laboratório']);
  });

  it('empty query keeps every item in author order', () => {
    expect(rankQuickNav(items, '   ')).toBe(items);
  });

  it('prefers label prefixes over keyword and infix matches', () => {
    const ranked = rankQuickNav(
      [
        { label: 'Teoria', keywords: 'modelo' },
        { label: 'Modelos', keywords: '' },
        { label: 'Remodelagem', keywords: '' },
      ],
      'model',
    ).map((i) => i.label);
    expect(ranked).toEqual(['Modelos', 'Teoria', 'Remodelagem']);
  });

  it('is conjunctive over query tokens', () => {
    expect(rankQuickNav(items, 'grafo skos').map((i) => i.label)).toEqual(['Ontologia']);
    expect(rankQuickNav(items, 'grafo lab')).toEqual([]);
  });

  test.prop([
    fc.array(fc.record({ label: fc.string(), keywords: fc.string() }), { maxLength: 12 }),
    fc.string({ maxLength: 8 }),
  ])('returns a stable sub-sequence-by-score of matching items', (list, q) => {
    const ranked = rankQuickNav(list, q);
    for (const item of ranked) expect(list).toContain(item);
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1];
      const b = ranked[i];
      if (a === undefined || b === undefined) continue;
      const sa = scoreItem(a, q);
      const sb = scoreItem(b, q);
      expect(sa).toBeGreaterThanOrEqual(sb);
      if (sa === sb && foldForSearch(q).trim() !== '') expect(list.indexOf(a)).toBeLessThanOrEqual(list.indexOf(b));
    }
  });

  it('filters by locale prefix', () => {
    expect(inLocale('/base/pt/ensaios/x/', '/base/pt/')).toBe(true);
    expect(inLocale('/base/en/essays/x/', '/base/pt/')).toBe(false);
    expect(inLocale('/anything', '')).toBe(false);
  });
});

describe('global shortcut', () => {
  const chord = (over: Partial<KeyChord>): KeyChord => ({
    key: '/',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    editableTarget: false,
    defaultPrevented: false,
    singleKey: true,
    ...over,
  });

  it('opens on "/", Ctrl+K and ⌘K', () => {
    expect(isPaletteShortcut(chord({}))).toBe(true);
    expect(isPaletteShortcut(chord({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(chord({ key: 'K', metaKey: true }))).toBe(true);
  });

  it('never fires while typing, composing or with Alt/AltGr', () => {
    expect(isPaletteShortcut(chord({ editableTarget: true }))).toBe(false);
    expect(isPaletteShortcut(chord({ key: 'k', ctrlKey: true, editableTarget: true }))).toBe(false);
    expect(isPaletteShortcut(chord({ isComposing: true }))).toBe(false);
    expect(isPaletteShortcut(chord({ altKey: true }))).toBe(false);
    expect(isPaletteShortcut(chord({ defaultPrevented: true }))).toBe(false);
  });

  it('"/" can be turned off (WCAG 2.1.4); the chorded shortcut cannot be', () => {
    expect(isPaletteShortcut(chord({ singleKey: false }))).toBe(false);
    expect(isPaletteShortcut(chord({ key: 'k', ctrlKey: true, singleKey: false }))).toBe(true);
    expect(isPaletteShortcut(chord({ key: 'K', metaKey: true, singleKey: false }))).toBe(true);
  });

  it('ignores plain k, Ctrl+/ and Ctrl+⌘+K', () => {
    expect(isPaletteShortcut(chord({ key: 'k' }))).toBe(false);
    expect(isPaletteShortcut(chord({ ctrlKey: true }))).toBe(false);
    expect(isPaletteShortcut(chord({ key: 'k', ctrlKey: true, metaKey: true }))).toBe(false);
  });
});
