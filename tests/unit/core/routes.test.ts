import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { ONTOLOGY_PAGES, decodeRoute, encodeRoute, type Route } from '../../../src/core/i18n/routes.ts';
import { LOCALES, localeCodec, negotiate } from '../../../src/core/domain/locale.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import { parseSlug } from '../../../src/core/domain/identifiers.ts';

const slugArb = fc
  .array(fc.stringMatching(/^[a-z0-9]{1,8}$/), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join('-'))
  .map((s) => {
    const r = parseSlug(s);
    if (!r.ok) throw new Error('generator produced invalid slug');
    return r.value;
  });

const routeArb: fc.Arbitrary<Route> = fc.oneof(
  fc.constant<Route>({ kind: 'home' }),
  fc.constant<Route>({ kind: 'essays' }),
  fc.constant<Route>({ kind: 'labs' }),
  fc.constant<Route>({ kind: 'ontology' }),
  fc.constant<Route>({ kind: 'glossary' }),
  fc.constant<Route>({ kind: 'about' }),
  fc.constant<Route>({ kind: 'colophon' }),
  slugArb.map((slug): Route => ({ kind: 'essay', slug })),
  slugArb.map((slug): Route => ({ kind: 'lab', slug })),
  slugArb.map((slug): Route => ({ kind: 'concept', slug })),
  fc.constantFrom(...STRATA).map((stratum): Route => ({ kind: 'stratum', stratum })),
  fc.constantFrom(...ONTOLOGY_PAGES).map((page): Route => ({ kind: 'ontology-page', page })),
);

describe('route codec', () => {
  test.prop([routeArb, fc.constantFrom(...LOCALES)])('decode ∘ encode = id', (route, locale) => {
    const path = encodeRoute(route, locale);
    expect(decodeRoute(path)).toEqual({ ok: true, value: { route, locale } });
  });

  test.prop([routeArb, fc.constantFrom(...LOCALES)])('paths are absolute and end with a slash', (route, locale) => {
    const path = encodeRoute(route, locale);
    expect(path.startsWith('/')).toBe(true);
    expect(path.endsWith('/')).toBe(true);
    expect(path).not.toContain('//');
  });

  test.prop([routeArb])('encoding is injective across locales', (route) => {
    expect(encodeRoute(route, 'pt-BR')).not.toBe(encodeRoute(route, 'en'));
  });

  test('rejects unknown segments instead of guessing', () => {
    expect(decodeRoute('/pt/essays/').ok).toBe(false); // English segment under pt
    expect(decodeRoute('/fr/').ok).toBe(false);
    expect(decodeRoute('/pt/ensaios/a/b/').ok).toBe(false);
    expect(decodeRoute('/pt/glossary/').ok).toBe(false); // English segment under pt
    expect(decodeRoute('/pt/glossario/x/').ok).toBe(false); // the glossary takes no parameter
    expect(decodeRoute('/pt/ontologia/structure/').ok).toBe(false); // English page slug under pt
    expect(decodeRoute('/en/ontology/estrutura/').ok).toBe(false);
    expect(decodeRoute('/pt/ontologia/estrutura/')).toEqual({
      ok: true,
      value: { route: { kind: 'ontology-page', page: 'structure' }, locale: 'pt-BR' },
    });
  });
});

describe('locale', () => {
  test.prop([fc.constantFrom(...LOCALES)])('segment codec round-trips', (locale) => {
    expect(localeCodec.decode(localeCodec.encode(locale))).toEqual({ ok: true, value: locale });
  });

  test('inherited property names are not locale segments', () => {
    for (const s of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(localeCodec.decode(s).ok).toBe(false);
      expect(decodeRoute(`/${s}/`).ok).toBe(false);
    }
  });

  test('negotiation follows RFC 4647 lookup on the primary subtag', () => {
    expect(negotiate(['pt-PT', 'en'])).toBe('pt-BR');
    expect(negotiate(['de', 'en-GB'])).toBe('en');
    expect(negotiate(['ja'])).toBe('pt-BR');
    expect(negotiate([])).toBe('pt-BR');
  });
});
