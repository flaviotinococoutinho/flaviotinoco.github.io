/**
 * The chrome documents fetched on demand (ADR 0009): the palette's
 * quick-navigation entries and the preferences form. Codec laws, parser
 * refusals and the form's agreement with the preference model.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { LOCALES } from '../../../src/core/domain/locale.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import chrome from '../../../src/core/i18n/catalogs/chrome.ts';
import {
  decodePaletteEntries,
  encodePaletteEntries,
  type PaletteEntry,
} from '../../../src/core/chrome/palette-entries.ts';
import {
  decodePreferencesForm,
  encodePreferencesForm,
  preferencesForm,
} from '../../../src/core/chrome/preferences-form.ts';
import { DEFAULT_PREFERENCES, PREFERENCE_DOMAINS, PREFERENCE_KEYS } from '../../../src/core/chrome/preferences.ts';

const text = fc.string({ minLength: 1, maxLength: 20 });
const entryArb: fc.Arbitrary<PaletteEntry> = fc.record({
  label: text,
  href: text.map((s) => `/base/${s}/`),
  kind: fc.string({ maxLength: 10 }),
  keywords: fc.string({ maxLength: 30 }),
  glyph: fc.constantFrom('simplex-0', 'form-essay', 'ui-language'),
  stratum: fc.option(fc.constantFrom(...STRATA), { nil: null }),
  hreflang: fc.option(fc.constantFrom(...LOCALES), { nil: null }),
});

describe('palette entries codec', () => {
  test.prop([fc.array(entryArb, { maxLength: 12 })])('decode ∘ JSON.parse ∘ encode = ok(id)', (entries) => {
    expect(decodePaletteEntries(JSON.parse(encodePaletteEntries(entries)))).toEqual({ ok: true, value: entries });
  });

  it('refuses a payload of another version or shape, and any malformed entry', () => {
    expect(decodePaletteEntries(null).ok).toBe(false);
    expect(decodePaletteEntries({ version: 2, entries: [] }).ok).toBe(false);
    expect(decodePaletteEntries({ version: 1, entries: {} }).ok).toBe(false);
    const good: PaletteEntry = {
      label: 'Ensaios',
      href: '/base/pt/ensaios/',
      kind: 'Seção',
      keywords: '',
      glyph: 'form-essay',
      stratum: null,
      hreflang: null,
    };
    expect(decodePaletteEntries({ version: 1, entries: [good] })).toEqual({ ok: true, value: [good] });
    for (const bad of [
      { ...good, label: '' },
      { ...good, href: 7 },
      { ...good, glyph: '' },
      { ...good, stratum: 'ether' },
      { ...good, hreflang: 'fr' },
      { ...good, keywords: null },
      'not an object',
    ]) {
      const r = decodePaletteEntries({ version: 1, entries: [good, bad] });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('preferences form', () => {
  for (const locale of LOCALES) {
    const form = preferencesForm(locale);

    it(`${locale}: one group per preference key, one option per value, labels from the catalog`, () => {
      expect(form.groups.map((g) => g.key)).toEqual([...PREFERENCE_KEYS]);
      for (const g of form.groups) {
        expect(g.options.map((o) => o.value)).toEqual([...PREFERENCE_DOMAINS[g.key]]);
        expect(g.legend).toBe(chrome[locale][`prefs.${g.key}`]);
        for (const o of g.options) {
          expect(o.label).toBe(chrome[locale][`prefs.${g.key}.${o.value}` as keyof (typeof chrome)['pt-BR']]);
          expect(o.announce).toContain(o.label);
          expect(o.announce).toContain(g.legend);
          expect(o.checked).toBe(o.value === DEFAULT_PREFERENCES[g.key]);
        }
        expect(g.options.filter((o) => o.checked)).toHaveLength(1);
      }
    });

    it(`${locale}: decode ∘ JSON.parse ∘ encode = ok(id)`, () => {
      expect(decodePreferencesForm(JSON.parse(encodePreferencesForm(form)))).toEqual({ ok: true, value: form });
    });
  }

  it('refuses malformed documents: version, unknown key or value, missing checked option, duplicates', () => {
    const form = preferencesForm('pt-BR');
    const group = form.groups[0];
    if (group === undefined) throw new Error('no groups');
    const withGroups = (groups: readonly unknown[]): unknown => ({ version: 1, groups });
    expect(decodePreferencesForm({ version: 0, groups: [] }).ok).toBe(false);
    expect(decodePreferencesForm(withGroups([{ ...group, key: 'font' }])).ok).toBe(false);
    expect(decodePreferencesForm(withGroups([{ ...group, legend: '' }])).ok).toBe(false);
    expect(decodePreferencesForm(withGroups([{ ...group, hint: '' }])).ok).toBe(false);
    expect(decodePreferencesForm(withGroups([{ ...group, options: [] }])).ok).toBe(false);
    expect(
      decodePreferencesForm(withGroups([{ ...group, options: [{ ...group.options[0], value: 'sepia' }] }])).ok,
    ).toBe(false);
    expect(
      decodePreferencesForm(withGroups([{ ...group, options: group.options.map((o) => ({ ...o, checked: false })) }]))
        .ok,
    ).toBe(false);
    expect(decodePreferencesForm(withGroups([group, group])).ok).toBe(false);
    expect(decodePreferencesForm(withGroups(['x'])).ok).toBe(false);
    expect(decodePreferencesForm(withGroups([{ ...group, options: ['x'] }])).ok).toBe(false);
    expect(decodePreferencesForm(withGroups([{ ...group, options: [{ ...group.options[0], label: 1 }] }])).ok).toBe(
      false,
    );
    expect(decodePreferencesForm(withGroups([{ ...group, options: [{ ...group.options[0], announce: 1 }] }])).ok).toBe(
      false,
    );
    expect(
      decodePreferencesForm(withGroups([{ ...group, options: [{ ...group.options[0], checked: 'yes' }] }])).ok,
    ).toBe(false);
  });
});
