import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  ATTRIBUTE_VALUES,
  DEFAULT_PREFERENCES,
  PREFERENCE_DOMAINS,
  PREFERENCE_KEYS,
  decodePreferences,
  encodePreferences,
  isDefault,
  parsePreferences,
  preferenceAttributes,
  withPreference,
  type PreferenceKey,
  type Preferences,
} from '../../../src/core/chrome/preferences.ts';
import { CVD_TYPES } from '../../../src/core/design/cvd.ts';

/** Arbitrary over the whole (finite) preference space. */
const prefsArb: fc.Arbitrary<Preferences> = fc.record(
  Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, fc.constantFrom(...PREFERENCE_DOMAINS[k])])) as {
    [K in PreferenceKey]: fc.Arbitrary<Preferences[K]>;
  },
);

const keyArb = fc.constantFrom(...PREFERENCE_KEYS);

describe('preference codec', () => {
  test.prop([prefsArb])('decode ∘ encode = id', (p) => {
    expect(decodePreferences(encodePreferences(p))).toEqual(p);
  });

  test.prop([prefsArb])('strict parse ∘ encode = ok(id)', (p) => {
    expect(parsePreferences(JSON.parse(encodePreferences(p)))).toEqual({ ok: true, value: p });
  });

  test.prop([prefsArb, prefsArb])('encoding is injective', (a, b) => {
    fc.pre(JSON.stringify(a) !== JSON.stringify(b));
    expect(encodePreferences(a)).not.toBe(encodePreferences(b));
  });

  test.prop([prefsArb])('canonical form omits defaults and keeps key order', (p) => {
    const encoded = JSON.parse(encodePreferences(p)) as Record<string, string>;
    for (const [k, v] of Object.entries(encoded)) expect(v).not.toBe(DEFAULT_PREFERENCES[k as PreferenceKey]);
    const order = Object.keys(encoded).map((k) => PREFERENCE_KEYS.indexOf(k as PreferenceKey));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('defaults encode to the empty object', () => {
    expect(encodePreferences(DEFAULT_PREFERENCES)).toBe('{}');
    expect(isDefault(DEFAULT_PREFERENCES)).toBe(true);
  });

  it('cvd domain is derived from the simulation model', () => {
    expect(PREFERENCE_DOMAINS.cvd).toEqual(['none', ...CVD_TYPES]);
  });
});

describe('strict parser rejects what it does not know', () => {
  test.prop([keyArb, fc.string()])('unknown values are errors', (key, value) => {
    fc.pre(!(PREFERENCE_DOMAINS[key] as readonly string[]).includes(value));
    const r = parsePreferences({ [key]: value });
    expect(r.ok).toBe(false);
  });

  test.prop([fc.string().filter((k) => !(PREFERENCE_KEYS as readonly string[]).includes(k) && k !== '__proto__')])(
    'unknown keys are errors',
    (key) => {
      expect(parsePreferences({ [key]: 'on' }).ok).toBe(false);
    },
  );

  it('accumulates every error', () => {
    const r = parsePreferences({ theme: 'sepia', motion: 3, colour: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toHaveLength(3);
  });

  it('rejects non-objects', () => {
    for (const v of [null, 1, 'x', [], true]) expect(parsePreferences(v).ok).toBe(false);
  });
});

describe('lenient decoder is total', () => {
  test.prop([fc.oneof(fc.string(), fc.json(), fc.constant(null))])('never throws, always yields valid preferences', (raw) => {
    const p = decodePreferences(raw);
    for (const k of PREFERENCE_KEYS) expect(PREFERENCE_DOMAINS[k]).toContain(p[k]);
  });

  it('keeps valid keys and drops invalid ones independently', () => {
    expect(decodePreferences('{"theme":"dark","contrast":"ultra","cvd":"tritanopia"}')).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
      cvd: 'tritanopia',
    });
  });

  it('ignores inherited properties', () => {
    expect(decodePreferences('{"__proto__":{"theme":"dark"}}')).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('attribute mapping', () => {
  test.prop([prefsArb])('defaults remove the attribute; other values are written verbatim', (p) => {
    for (const [name, value] of preferenceAttributes(p)) {
      const key = name.slice('data-'.length) as PreferenceKey;
      if (p[key] === DEFAULT_PREFERENCES[key]) expect(value).toBeNull();
      else {
        expect(value).toBe(p[key]);
        expect(ATTRIBUTE_VALUES[key]).toContain(value);
      }
    }
  });

  test.prop([prefsArb, keyArb])('withPreference updates exactly one key', (p, key) => {
    const value = PREFERENCE_DOMAINS[key][0];
    const q = withPreference(p, key, value as never);
    for (const k of PREFERENCE_KEYS) expect(q[k]).toBe(k === key ? value : p[k]);
  });
});
