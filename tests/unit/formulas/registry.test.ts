/**
 * The formula registry: parser (every error at once), builder (references,
 * uniqueness, derivation from the concept, bridge order), lookups, the words
 * formatter and the JSON export.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { DOMAINS } from '../../../src/core/domain/facets.ts';
import { LOCALES } from '../../../src/core/domain/locale.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import {
  buildFormulaRegistry,
  encodeFormulasJson,
  formulaOrdinal,
  formulaWords,
  lookupFormula,
  parseFormula,
  type Formula,
  type RegistryContext,
} from '../../../src/core/formulas/index.ts';

const L = <T>(pt: T, en: T) => ({ 'pt-BR': pt, en });

const entropy = {
  slug: L('entropia', 'entropy'),
  name: L('Entropia', 'Entropy'),
  tex: '\\H(X) = -\\sum_x p(x) \\log_2 p(x)',
  labels: L(['eq:entropia'], ['eq:entropy']),
  concept: 'entropy',
  meaning: L('Incerteza média.', 'Average uncertainty.'),
  spoken: L('H de X é igual a…', 'H of X equals…'),
  symbols: [{ tex: 'p(x)', text: L('probabilidade de x', 'probability of x') }],
  concepts: ['information'],
  sources: ['shannon1948'],
};

const capacity = {
  slug: L('capacidade', 'capacity'),
  name: L('Capacidade', 'Capacity'),
  tex: 'C = W \\log_2 (1 + P/N)',
  labels: L(['eq:capacidade'], ['eq:capacity']),
  stratum: 'formal',
  domains: ['information-theory'],
  meaning: L('Limite.', 'Limit.'),
  spoken: L('C é igual a…', 'C equals…'),
};

const context: RegistryContext = {
  concepts: new Map([
    ['entropy', { stratum: 'theory', domains: ['information-theory', 'probability'] }],
    ['information', { stratum: 'theory', domains: ['information-theory'] }],
  ]),
  sources: new Set(['shannon1948', 'cover2006']),
};

const build = (files: Readonly<Record<string, unknown>>) =>
  buildFormulaRegistry(
    Object.entries(files).map(([id, data]) => ({ id, data })),
    context,
  );

const errorsOf = (files: Readonly<Record<string, unknown>>): readonly string[] => {
  const r = build(files);
  return r.ok ? [] : r.error;
};

describe('parseFormula', () => {
  it('accepts a formula bound to a concept (stratum and domains come from the concept)', () => {
    const r = parseFormula({ id: 'shannon-entropy', data: entropy });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe('shannon-entropy');
    expect(r.value.concept).toBe('entropy');
    expect(r.value.stratum).toBeNull();
    expect(r.value.domains).toBeNull();
    expect(r.value.labels['pt-BR']).toEqual(['eq:entropia']);
    expect(r.value.symbols).toHaveLength(1);
  });

  it('accepts a formula without a concept when it states its stratum and domains', () => {
    const r = parseFormula({ id: 'capacity', data: capacity });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stratum).toBe('formal');
    expect(r.value.domains).toEqual(['information-theory']);
    expect(r.value.symbols).toEqual([]);
    expect(r.value.sources).toEqual([]);
  });

  it('reports every problem at once, prefixed with the formula id', () => {
    const r = parseFormula({
      id: 'Bad Id',
      data: {
        ...entropy,
        extra: 1,
        tex: '',
        labels: L(['thm:x'], ['eq:b']),
        stratum: 'theory',
        symbols: [
          { tex: 'p', text: L('a', 'b') },
          { tex: 'p', text: L('a', 'b') },
        ],
        concepts: ['entropy'],
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const messages = r.error.join('\n');
    expect(r.error.every((m) => m.startsWith('formula "Bad Id": '))).toBe(true);
    expect(messages).toContain('invalid formula id');
    expect(messages).toContain('unknown key "extra"');
    expect(messages).toContain('tex: expected a non-empty string');
    expect(messages).toContain('label "thm:x" must use the eq: prefix');
    expect(errorsOf({ x: { ...entropy, labels: L(['eq:a', 'eq:a'], []) } }).join('\n')).toContain(
      'labels.pt-BR: "eq:a" listed twice',
    );
    expect(errorsOf({ x: { ...entropy, labels: L<unknown>([], 'eq:b') } }).join('\n')).toContain(
      'labels.en: expected a list',
    );
    expect(messages).toContain('stratum: derived from the concept');
    expect(messages).toContain('symbols: "p" listed twice');
    expect(messages).toContain('concepts: "entropy" is already the formula\'s concept');
  });

  it('requires stratum and non-empty domains without a concept, and both locales everywhere', () => {
    const { stratum: _s, domains: _d, ...noFacets } = capacity;
    expect(errorsOf({ c: noFacets }).join('\n')).toMatch(/stratum: missing[\s\S]*domains: missing/);
    expect(errorsOf({ c: { ...capacity, domains: [] } }).join('\n')).toContain('domains: expected at least one');
    expect(errorsOf({ c: { ...capacity, meaning: { 'pt-BR': 'x' } } }).join('\n')).toContain('meaning.en: missing');
    expect(errorsOf({ c: { ...capacity, name: { 'pt-BR': 'x', en: 'y', fr: 'z' } } }).join('\n')).toContain(
      'unknown locale "fr"',
    );
  });

  it('rejects a value that is not an object', () => {
    expect(parseFormula({ id: 'x', data: 'no' }).ok).toBe(false);
    expect(parseFormula({ id: 'x', data: null }).ok).toBe(false);
  });
});

describe('buildFormulaRegistry', () => {
  it('derives stratum and domains from the concept and indexes by id, label, slug and concept', () => {
    const r = build({ 'shannon-entropy': entropy, capacity });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reg = r.value;
    const e = reg.byId.get('shannon-entropy' as Formula['id']);
    expect(e?.stratum).toBe('theory');
    expect(e?.domains).toEqual(['information-theory', 'probability']);
    expect(lookupFormula(reg, 'pt-BR', 'eq:entropia' as never)?.id).toBe('shannon-entropy');
    expect(lookupFormula(reg, 'en', 'eq:entropia' as never)).toBeUndefined();
    expect(reg.bySlug.en.get('capacity' as never)?.id).toBe('capacity');
    expect(reg.byConcept.get('entropy' as never)?.id).toBe('shannon-entropy');
  });

  it('orders formulas along the bridge (stratum), then by id', () => {
    const r = build({
      zeta: { ...capacity, slug: L('z', 'z'), labels: L([], []), stratum: 'theory' },
      alpha: { ...capacity, slug: L('a', 'a'), labels: L([], []), stratum: 'value' },
      beta: { ...capacity, slug: L('b', 'b'), labels: L([], []), stratum: 'theory' },
      capacity,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.formulas.map((f) => f.id)).toEqual(['beta', 'zeta', 'capacity', 'alpha']);
    expect(formulaOrdinal(r.value, 'capacity' as never)).toBe(3);
    expect(formulaOrdinal(r.value, 'nope' as never)).toBe(0);
  });

  it('rejects unknown concepts and sources, a concept with two notations, and labels or slugs used twice', () => {
    const errors = errorsOf({
      a: { ...entropy, concept: 'nope' },
      b: { ...entropy, slug: L('b', 'b'), labels: L(['eq:b'], ['eq:b']), concepts: ['ghost'], sources: ['nobody2020'] },
      c: { ...entropy, slug: L('c', 'c'), labels: L(['eq:c'], ['eq:c']) },
      d: { ...capacity, slug: L('d', 'd'), labels: L(['eq:b'], ['eq:d']) },
      e: { ...capacity, slug: L('d', 'e'), labels: L(['eq:e'], ['eq:e']) },
    }).join('\n');
    expect(errors).toContain('formula "a": concept: unknown concept "nope"');
    expect(errors).toContain('formula "b": concepts: unknown concept "ghost"');
    expect(errors).toContain('formula "b": sources: unknown citation key "nobody2020"');
    expect(errors).toContain('concept "entropy" is already the notation of "b"');
    expect(errors).toContain('formula "d": label "eq:b" (pt-BR) already belongs to "b"');
    expect(errors).toContain('formula "e": slug "d" (pt-BR) already belongs to "d"');
  });

  it('fails when any file fails, never with a partial registry', () => {
    const r = build({ 'shannon-entropy': entropy, broken: { tex: 'x' } });
    expect(r.ok).toBe(false);
  });
});

// ── properties ────────────────────────────────────────────────────────────────

const word = fc.stringMatching(/^[a-z]{1,8}$/);
const sentence = fc.array(word, { minLength: 1, maxLength: 6 }).map((ws) => `${ws.join(' ')}.`);
const slugArb = fc.stringMatching(/^[a-z0-9]{1,6}(?:-[a-z0-9]{1,6}){0,2}$/);
const labelArb = slugArb.map((s) => `eq:${s}`);
const localizedArb = <T>(arb: fc.Arbitrary<T>) => fc.record({ 'pt-BR': arb, en: arb });

const formulaArb = fc.record({
  slug: localizedArb(slugArb),
  name: localizedArb(sentence),
  tex: fc.stringMatching(/^[a-zA-Z0-9 =+\\{}_^()]{1,30}$/).filter((s) => s.trim().length > 0),
  labels: localizedArb(fc.uniqueArray(labelArb, { maxLength: 3 })),
  stratum: fc.constantFrom(...STRATA),
  domains: fc.uniqueArray(fc.constantFrom(...DOMAINS), { minLength: 1, maxLength: 3 }),
  meaning: localizedArb(sentence),
  spoken: localizedArb(sentence),
  symbols: fc.uniqueArray(fc.record({ tex: word, text: localizedArb(sentence) }), {
    maxLength: 4,
    selector: (s) => s.tex,
  }),
  concepts: fc.uniqueArray(fc.constantFrom('entropy', 'information'), { maxLength: 2 }),
  sources: fc.uniqueArray(fc.constantFrom('shannon1948', 'cover2006'), { maxLength: 2 }),
});

describe('properties', () => {
  test.prop([slugArb, formulaArb])('a well-formed formula parses to its own fields', (id, data) => {
    const r = parseFormula({ id, data });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ ...data, id, concept: null });
  });

  test.prop([fc.uniqueArray(fc.tuple(slugArb, formulaArb), { minLength: 1, maxLength: 6, selector: ([id]) => id })])(
    'the registry lists every accepted formula once, in bridge order; words and JSON are total',
    (files) => {
      const r = buildFormulaRegistry(
        files.map(([id, data]) => ({ id, data })),
        context,
      );
      if (!r.ok) {
        // Only clashes between files can fail here: a label or slug shared by two formulas.
        expect(r.error.join('\n')).toMatch(/already belongs to/);
        return;
      }
      const reg = r.value;
      expect(reg.formulas.map((f) => f.id).sort()).toEqual(files.map(([id]) => id).sort());
      for (let i = 1; i < reg.formulas.length; i += 1) {
        const a = reg.formulas[i - 1];
        const b = reg.formulas[i];
        if (a === undefined || b === undefined) continue;
        expect(STRATA.indexOf(a.stratum) <= STRATA.indexOf(b.stratum)).toBe(true);
      }
      for (const f of reg.formulas) {
        expect(formulaOrdinal(reg, f.id)).toBe(reg.formulas.indexOf(f) + 1);
        for (const locale of LOCALES) {
          const words = formulaWords(f, locale, `/x/${f.slug[locale]}/`);
          expect(words.name).toBe(f.name[locale]);
          expect(words.symbols.map((s) => s.tex)).toEqual(f.symbols.map((s) => s.tex));
          for (const label of f.labels[locale]) expect(lookupFormula(reg, locale, label)).toBe(f);
        }
      }
      const json = JSON.parse(encodeFormulasJson(reg, (f, locale) => `/${locale}/${f.slug[locale]}/`)) as {
        formulas: readonly { id: string; ordinal: number; url: Record<string, string> }[];
      };
      expect(json.formulas.map((f) => f.id)).toEqual(reg.formulas.map((f) => f.id));
      expect(json.formulas.map((f) => f.ordinal)).toEqual(reg.formulas.map((_, i) => i + 1));
      expect(json.formulas.every((f) => f.url['en']?.startsWith('/en/'))).toBe(true);
    },
  );
});
