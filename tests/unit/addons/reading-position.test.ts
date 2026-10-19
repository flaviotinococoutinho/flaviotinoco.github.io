/**
 * Reading position: the stored record is parsed totally (anything foreign reads
 * as empty), bounded, and holds only paths and heading ids.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  EMPTY_STORE,
  MAX_PAGES,
  forget,
  lastPassed,
  parseStore,
  recall,
  remember,
  serializeStore,
  shouldOffer,
} from '../../../src/core/addons/reading-position.ts';

const entry = fc.record({
  path: fc.stringMatching(/^\/[a-z/-]{0,40}$/u),
  id: fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/u),
});

describe('the stored record', () => {
  test.prop([fc.option(fc.string(), { nil: null })])('parseStore is total', (raw) => {
    expect(parseStore(raw).pages.length).toBeLessThanOrEqual(MAX_PAGES);
  });

  test.prop([fc.jsonValue()])('foreign JSON never throws and never yields invalid entries', (v) => {
    for (const p of parseStore(JSON.stringify(v)).pages) {
      expect(p.path.startsWith('/')).toBe(true);
      expect(p.id).not.toMatch(/\s/u);
    }
  });

  test.prop([fc.array(entry, { maxLength: 40 })])('parseStore ∘ serializeStore = id on reachable stores', (entries) => {
    const store = entries.reduce(remember, EMPTY_STORE);
    expect(parseStore(serializeStore(store))).toEqual(store);
    expect(store.pages.length).toBeLessThanOrEqual(MAX_PAGES);
    expect(new Set(store.pages.map((p) => p.path)).size).toBe(store.pages.length);
  });

  it('keeps the most recent page first and forgets on request', () => {
    let s = remember(EMPTY_STORE, { path: '/a/', id: 'x' });
    s = remember(s, { path: '/b/', id: 'y' });
    s = remember(s, { path: '/a/', id: 'z' });
    expect(s.pages).toEqual([
      { path: '/a/', id: 'z' },
      { path: '/b/', id: 'y' },
    ]);
    expect(recall(s, '/b/')).toEqual({ path: '/b/', id: 'y' });
    expect(recall(forget(s, '/b/'), '/b/')).toBeNull();
  });

  it('ignores invalid entries and old formats', () => {
    expect(remember(EMPTY_STORE, { path: 'relative', id: 'x' })).toBe(EMPTY_STORE);
    expect(remember(EMPTY_STORE, { path: '/a/', id: 'has space' })).toBe(EMPTY_STORE);
    expect(parseStore('{"v":0,"pages":[{"path":"/a/","id":"x"}]}')).toEqual(EMPTY_STORE);
    expect(parseStore('not json')).toEqual(EMPTY_STORE);
    expect(parseStore('{"v":1,"pages":[{"path":"/a/","id":"x"},{"path":"/a/","id":"y"},5]}').pages).toEqual([
      { path: '/a/', id: 'x' },
    ]);
  });
});

describe('position on the page', () => {
  const headings = [
    { id: 'a', top: -500 },
    { id: 'b', top: -20 },
    { id: 'c', top: 300 },
  ];

  it('is the last heading above the reading line', () => {
    expect(lastPassed(headings, 0)).toBe('b');
    expect(lastPassed(headings, 400)).toBe('c');
    expect(lastPassed(headings, -1000)).toBeNull();
    expect(lastPassed([], 0)).toBeNull();
  });

  it('is offered only for a heading that still exists and is not the first', () => {
    const ids = ['a', 'b', 'c'];
    expect(shouldOffer({ path: '/p/', id: 'b' }, ids)).toBe(true);
    expect(shouldOffer({ path: '/p/', id: 'a' }, ids)).toBe(false);
    expect(shouldOffer({ path: '/p/', id: 'gone' }, ids)).toBe(false);
    expect(shouldOffer(null, ids)).toBe(false);
  });
});
