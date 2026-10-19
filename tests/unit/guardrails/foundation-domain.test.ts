/**
 * Smart constructors and orders of the domain (src/core/domain) and the message
 * helpers (src/core/i18n/messages.ts). Parsers must accept exactly their
 * language and return the input unchanged on success (no silent normalisation).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  parseCitationKey,
  parseConceptId,
  parseLabel,
  parseSlug,
  parseTranslationKey,
} from '../../../src/core/domain/identifiers.ts';
import {
  DEFAULT_LOCALE,
  LOCALES,
  alternateLocales,
  direction,
  isLocale,
  localeCodec,
  ogLocale,
  parseLocale,
} from '../../../src/core/domain/locale.ts';
import {
  STRATA,
  STRATUM_SPECS,
  compareStrata,
  isStratum,
  nextStratum,
  parseStratum,
  previousStratum,
} from '../../../src/core/domain/strata.ts';
import {
  CONFIDENCE_LEVELS,
  EVIDENCE_KINDS,
  KENT_BANDS,
  parseConfidence,
  parseEvidence,
} from '../../../src/core/domain/epistemic.ts';
import { DOMAINS, FORMS, FORM_GLYPH, parseDomain, parseForm } from '../../../src/core/domain/facets.ts';
import { defineMessages, format, formatNumber, plural, translator } from '../../../src/core/i18n/messages.ts';

const anything = fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined), fc.object());

describe('identifier parsers accept exactly their language', () => {
  const cases = [
    ['slug', parseSlug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/],
    ['concept id', parseConceptId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/],
    ['translation key', parseTranslationKey, /^[a-z0-9]+(?:-[a-z0-9]+)*$/],
    ['citation key', parseCitationKey, /^[A-Za-z][A-Za-z0-9:_\-./]*$/],
    ['label', parseLabel, /^[a-z]+:[a-z0-9][a-z0-9-]*$/],
  ] as const;

  for (const [name, parse, language] of cases) {
    test.prop([fc.oneof(fc.stringMatching(language), fc.string({ maxLength: 16 }))])(
      `${name}: ok ⇔ in the language, and the value is returned unchanged`,
      (s) => {
        const r = parse(s);
        expect(r.ok).toBe(language.test(s));
        if (r.ok) expect(r.value).toBe(s);
      },
    );
    test.prop([anything])(`${name}: non-strings are rejected with a message`, (v) => {
      fc.pre(typeof v !== 'string');
      const r = parse(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    });
  }

  it('examples', () => {
    expect(parseSlug('teoria-da-informacao').ok).toBe(true);
    expect(parseSlug('Teoria').ok).toBe(false);
    expect(parseSlug('a--b').ok).toBe(false);
    expect(parseCitationKey('shannon1948').ok).toBe(true);
    expect(parseLabel('thm:sampling').ok).toBe(true);
    expect(parseLabel('sampling').ok).toBe(false);
  });
});

describe('locale', () => {
  it('has a total, closed set with a default', () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
    for (const l of LOCALES) {
      expect(isLocale(l)).toBe(true);
      expect(parseLocale(l)).toEqual({ ok: true, value: l });
      expect(alternateLocales(l)).toEqual(LOCALES.filter((x) => x !== l));
      expect(direction(l)).toBe('ltr');
      expect(ogLocale[l]).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
    expect(parseLocale('pt').ok).toBe(false);
    expect(localeCodec.decode('pt-BR').ok).toBe(false);
  });
});

describe('strata', () => {
  it('are totally ordered along the bridge, with consistent specs', () => {
    STRATA.forEach((s, i) => {
      expect(STRATUM_SPECS[s].ordinal).toBe(i);
      expect(STRATUM_SPECS[s].simplex).toBe(i);
      expect(STRATUM_SPECS[s].glyph).toBe(`simplex-${i}`);
      expect(STRATUM_SPECS[s].colorToken).toBe(`stratum-${s}`);
      expect(isStratum(s)).toBe(true);
      expect(parseStratum(s)).toEqual({ ok: true, value: s });
    });
    expect(parseStratum('poetry').ok).toBe(false);
    expect(nextStratum('value')).toBeNull();
    expect(previousStratum('philosophy')).toBeNull();
  });

  test.prop([fc.constantFrom(...STRATA), fc.constantFrom(...STRATA)])('compareStrata is antisymmetric', (a, b) => {
    // Sum, not negation: -Math.sign(0) is -0, which toBe (Object.is) distinguishes from 0.
    expect(Math.sign(compareStrata(a, b)) + Math.sign(compareStrata(b, a))).toBe(0);
    expect(compareStrata(a, b) === 0).toBe(a === b);
  });

  test.prop([fc.constantFrom(...STRATA)])('next and previous are inverse where defined', (s) => {
    const next = nextStratum(s);
    if (next !== null) expect(previousStratum(next)).toBe(s);
    const previous = previousStratum(s);
    if (previous !== null) expect(nextStratum(previous)).toBe(s);
  });
});

describe('epistemic status and facets', () => {
  it('parse their closed vocabularies', () => {
    for (const c of CONFIDENCE_LEVELS) expect(parseConfidence(c)).toEqual({ ok: true, value: c });
    for (const e of EVIDENCE_KINDS) expect(parseEvidence(e)).toEqual({ ok: true, value: e });
    for (const f of FORMS) {
      expect(parseForm(f)).toEqual({ ok: true, value: f });
      expect(FORM_GLYPH[f]).toBe(`form-${f}`);
    }
    for (const d of DOMAINS) expect(parseDomain(d)).toEqual({ ok: true, value: d });
    for (const parse of [parseConfidence, parseEvidence, parseForm, parseDomain]) {
      expect(parse('unknown').ok).toBe(false);
      expect(parse(7).ok).toBe(false);
    }
  });

  it('Kent bands are ordered probabilities within [0, 100]', () => {
    const centers = CONFIDENCE_LEVELS.map((c) => KENT_BANDS[c].center);
    expect(centers).toEqual([...centers].sort((a, b) => b - a));
    for (const c of CONFIDENCE_LEVELS) {
      const { center, halfWidth } = KENT_BANDS[c];
      expect(center - halfWidth).toBeGreaterThanOrEqual(0);
      expect(center + halfWidth).toBeLessThanOrEqual(100);
    }
  });
});

describe('messages', () => {
  it('formats placeholders, keeping unknown ones visible', () => {
    expect(format('© {year} {name}', { year: 2026 })).toBe('© 2026 {name}');
    expect(format('{a}{a}', { a: 'x' })).toBe('xx');
  });

  test.prop([fc.string().filter((s) => !/\{[a-zA-Z0-9_]+\}/.test(s))])(
    'is the identity on text without placeholders',
    (s) => {
      expect(format(s, { a: 1 })).toBe(s);
    },
  );

  it('uses each locale’s number and plural conventions (CLDR)', () => {
    expect(formatNumber('pt-BR', 1234.5)).toBe('1.234,5');
    expect(formatNumber('en', 1234.5)).toBe('1,234.5');
    const forms = { one: '{n} minuto', other: '{n} minutos' };
    expect(plural('pt-BR', 1, forms)).toBe('1 minuto');
    expect(plural('pt-BR', 2, forms)).toBe('2 minutos');
    expect(plural('en', 1, { other: '{n} items' })).toBe('1 items');
  });

  it('translates through a catalog with compile-time parity', () => {
    const catalog = defineMessages({ 'pt-BR': { hi: 'Olá, {who}' }, en: { hi: 'Hi, {who}' } });
    expect(translator(catalog, 'pt-BR')('hi', { who: 'Ana' })).toBe('Olá, Ana');
    expect(translator(catalog, 'en')('hi')).toBe('Hi, {who}');
  });
});
