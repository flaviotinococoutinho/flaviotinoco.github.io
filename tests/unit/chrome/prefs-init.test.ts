import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  PREFS_INIT_HASH,
  PREFS_INIT_SCRIPT,
  PREFS_KEYS,
  PREFS_STORAGE_KEY,
} from '../../../src/adapters/astro/prefs-init.ts';
import {
  ATTRIBUTE_VALUES,
  PREFERENCE_DOMAINS,
  PREFERENCE_KEYS,
  decodePreferences,
  encodePreferences,
  preferenceAttributes,
  type PreferenceKey,
  type Preferences,
} from '../../../src/core/chrome/preferences.ts';
import { daypartOf } from '../../../src/core/chrome/daypart.ts';

/** Runs the inline script against a fake <html> element, storage and clock. */
const run = (stored: string | null, hour = 12, storageThrows = false): Map<string, string> => {
  const attrs = new Map<string, string>();
  const document = { documentElement: { setAttribute: (n: string, v: string) => void attrs.set(n, v) } };
  const localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error('SecurityError');
      return k === PREFS_STORAGE_KEY ? stored : null;
    },
  };
  const FakeDate = class {
    getHours(): number {
      return hour;
    }
  };
  // Evaluating the exact shipped string (not a re-implementation) is the point of this test; a fresh
  // V8 context gives it exactly these globals and nothing else of the test's environment.
  runInNewContext(PREFS_INIT_SCRIPT, { document, localStorage, Date: FakeDate });
  return attrs;
};

const prefsArb: fc.Arbitrary<Preferences> = fc.record(
  Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, fc.constantFrom(...PREFERENCE_DOMAINS[k])])) as {
    [K in PreferenceKey]: fc.Arbitrary<Preferences[K]>;
  },
);

describe('pre-paint script', () => {
  it('PREFS_INIT_HASH is the CSP sha256 of PREFS_INIT_SCRIPT', () => {
    const digest = createHash('sha256').update(PREFS_INIT_SCRIPT, 'utf8').digest('base64');
    expect(PREFS_INIT_HASH).toBe(`sha256-${digest}`);
  });

  it('stays tiny', () => {
    expect(PREFS_INIT_SCRIPT.length).toBeLessThan(1024);
  });

  it('covers every preference key, including cvd', () => {
    expect([...PREFS_KEYS]).toEqual([...PREFERENCE_KEYS]);
    expect(PREFS_KEYS).toContain('cvd');
  });

  test.prop([prefsArb])('applies exactly the attributes of the pure model', (p) => {
    const attrs = run(encodePreferences(p));
    for (const [name, value] of preferenceAttributes(p)) expect(attrs.get(name) ?? null).toBe(value);
  });

  test.prop([fc.oneof(fc.string(), fc.json(), fc.constant(null))])(
    'is total and agrees with decodePreferences on arbitrary storage',
    (raw) => {
      const attrs = run(raw);
      const p = decodePreferences(raw);
      for (const [name, value] of preferenceAttributes(p)) expect(attrs.get(name) ?? null).toBe(value);
      expect(attrs.has('data-js')).toBe(true);
    },
  );

  it('only writes allow-listed values', () => {
    const attrs = run('{"theme":"light dark","text":"xxl","motion":"auto","face":"sans","cvd":"none"}');
    expect(attrs.get('data-theme')).toBeUndefined();
    expect(attrs.get('data-text')).toBeUndefined();
    expect(attrs.get('data-motion')).toBeUndefined();
    expect(attrs.get('data-cvd')).toBeUndefined();
    expect(attrs.get('data-face')).toBe('sans');
    for (const k of PREFERENCE_KEYS) for (const v of ATTRIBUTE_VALUES[k]) expect(v).toMatch(/^[a-z]+$/);
  });

  it('survives storage that throws', () => {
    const attrs = run('{"theme":"dark"}', 8, true);
    expect(attrs.get('data-theme')).toBeUndefined();
    expect(attrs.get('data-daypart')).toBe('dawn');
    expect(attrs.get('data-js')).toBe('');
  });

  it('daypart matches the pure function for every hour', () => {
    for (let h = 0; h < 24; h++) expect(run(null, h).get('data-daypart')).toBe(daypartOf(h));
  });
});
