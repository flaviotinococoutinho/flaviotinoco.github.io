import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  CORE_DOMAINS,
  DOMAINS,
  FOUNDATION_DOMAINS,
  type CoreDomain,
  type Domain,
} from '../../../src/core/domain/facets.ts';
import {
  AXES,
  AXIS_OF,
  SCOPE_MIN_CORE_SHARE,
  SUPPORTS,
  checkCorpusScope,
  checkEssayScope,
  classify,
  coreShare,
  coverage,
  disciplinesOf,
  formatScopeProblem,
  foundationsOf,
  isCoreDomain,
  latestByAxis,
  listing,
  rowTotal,
  uncovered,
  type ScopedItem,
  type ScopedWork,
} from '../../../src/core/domain/scope.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import chrome from '../../../src/core/i18n/catalogs/chrome.ts';

const domain = fc.constantFrom(...DOMAINS);
const core = fc.constantFrom(...CORE_DOMAINS);
const foundation = fc.constantFrom(...FOUNDATION_DOMAINS);
const domains = fc.uniqueArray(domain, { minLength: 1, maxLength: 5 });
const item: fc.Arbitrary<ScopedItem> = fc.record({ stratum: fc.constantFrom(...STRATA), domains });
const work: fc.Arbitrary<ScopedWork> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  form: fc.constantFrom('essay' as const, 'lab' as const),
  domains,
});

describe('scope vocabulary (R1)', () => {
  it('partitions the domain facet into core disciplines and foundations', () => {
    expect(new Set(DOMAINS).size).toBe(DOMAINS.length);
    expect(DOMAINS).toEqual([...CORE_DOMAINS, ...FOUNDATION_DOMAINS]);
    for (const d of DOMAINS) expect(isCoreDomain(d)).toBe((CORE_DOMAINS as readonly Domain[]).includes(d));
  });

  it('gives every core discipline a line of inquiry and every line at least one discipline', () => {
    for (const axis of AXES) expect(disciplinesOf(axis).length).toBeGreaterThan(0);
    expect(AXES.flatMap((a) => disciplinesOf(a))).toEqual([...CORE_DOMAINS]);
    for (const d of CORE_DOMAINS) expect(AXES).toContain(AXIS_OF[d]);
  });

  it('makes every foundation a foundation of some core discipline, without repetition', () => {
    for (const f of FOUNDATION_DOMAINS) {
      const supported = SUPPORTS[f];
      expect(supported.length).toBeGreaterThan(0);
      expect(new Set(supported).size).toBe(supported.length);
      for (const d of supported) {
        expect(isCoreDomain(d)).toBe(true);
        expect(foundationsOf(d)).toContain(f);
      }
    }
  });
});

describe('classification', () => {
  test.prop([domains])('is core exactly when a core discipline is declared', (ds) => {
    const c = classify(ds);
    const declared = ds.filter(isCoreDomain);
    if (declared.length > 0) {
      expect(c.tier).toBe('core');
      if (c.tier === 'core') expect(new Set(c.disciplines)).toEqual(new Set(declared));
    } else {
      expect(c.tier).toBe('foundation');
    }
  });

  test.prop([foundation, fc.uniqueArray(foundation, { maxLength: 3 })])(
    'a foundation-only list is listed under what its primary domain supports',
    (primary, rest) => {
      const ds = [primary, ...rest.filter((r) => r !== primary)];
      expect(classify(ds)).toEqual({
        tier: 'foundation',
        supports: CORE_DOMAINS.filter((d) => SUPPORTS[primary].includes(d)),
      });
      expect(listing(ds).role).toBe('supporting');
    },
  );

  test.prop([domains])('lists disciplines in display order, without duplicates', (ds) => {
    const { disciplines } = listing(ds);
    expect(new Set(disciplines).size).toBe(disciplines.length);
    expect(disciplines).toEqual(CORE_DOMAINS.filter((d) => disciplines.includes(d)));
  });

  it('has no class for an empty list', () => {
    expect(classify([])).toEqual({ tier: 'none' });
    expect(listing([])).toEqual({ role: 'supporting', disciplines: [] });
  });
});

describe('copy that states the size of the vocabulary', () => {
  /** Cardinal numbers as the catalogues write them (sentence case is checked case-insensitively). */
  const WORDS = {
    'pt-BR': ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze'],
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
  } as const;

  it('says as many disciplines and lines of inquiry as the scope model holds', () => {
    for (const locale of ['pt-BR', 'en'] as const) {
      const lede = chrome[locale]['home.axes.lede'].toLowerCase();
      const word = (n: number): string => WORDS[locale][n] ?? String(n);
      expect(lede, locale).toContain(`${word(CORE_DOMAINS.length)} `);
      expect(lede, locale).toContain(` ${word(AXES.length)} `);
    }
  });
});

describe('the most recent work of each line of inquiry', () => {
  /** Does the work declare a discipline of the line (the candidates of a line)? */
  const declares = (axis: (typeof AXES)[number], ds: readonly Domain[]): boolean => {
    const l = listing(ds);
    return l.role === 'direct' && l.disciplines.some((d) => AXIS_OF[d] === axis);
  };

  /** Size of a maximum matching lines × works, by exhaustive search (reference for small inputs). */
  const maximum = (ws: readonly ScopedWork[], line = 0, used: ReadonlySet<number> = new Set()): number => {
    const axis = AXES[line];
    if (axis === undefined) return 0;
    let best = maximum(ws, line + 1, used);
    ws.forEach((w, i) => {
      if (!used.has(i) && declares(axis, w.domains))
        best = Math.max(best, 1 + maximum(ws, line + 1, new Set([...used, i])));
    });
    return best;
  };

  test.prop([fc.array(work, { maxLength: 9 })])(
    'shows each work at most once, under a line it declares, and leaves no line empty that could have one',
    (ws) => {
      const latest = latestByAxis(ws);
      const picked = AXES.flatMap((a) => {
        const w = latest[a];
        return w === undefined ? [] : [w];
      });
      expect(new Set(picked).size).toBe(picked.length);
      for (const axis of AXES) {
        const w = latest[axis];
        if (w !== undefined) expect(declares(axis, w.domains)).toBe(true);
      }
      expect(picked.length).toBe(maximum(ws));
    },
  );

  test.prop([fc.array(work, { maxLength: 20 })])(
    'is the newest work of every line when no work declares two lines',
    (ws) => {
      const single = ws.filter((w) => AXES.filter((a) => declares(a, w.domains)).length <= 1);
      const latest = latestByAxis(single);
      for (const axis of AXES) expect(latest[axis]).toBe(single.find((w) => declares(axis, w.domains)));
    },
  );

  it('does not repeat a work that declares two lines, nor leave the line that has only it empty', () => {
    // Newest first: an essay on information systems and applied philosophy, then a lab on data engineering.
    const record = { domains: ['information-systems', 'applied-philosophy'] as const };
    const pipeline = { domains: ['data-engineering'] as const };
    const older = { domains: ['information-systems'] as const };
    const latest = latestByAxis([record, pipeline, older]);
    expect(latest.philosophy).toBe(record);
    expect(latest.systems).toBe(pipeline);
  });
});

describe('essay rule (R2)', () => {
  test.prop([core, fc.uniqueArray(domain, { maxLength: 3 })])('accepts any essay with a core discipline', (d, rest) => {
    expect(checkEssayScope([...rest, d]).ok).toBe(true);
  });

  test.prop([fc.uniqueArray(foundation, { minLength: 1, maxLength: 4 })])(
    'rejects an essay about foundations only, naming them',
    (fs) => {
      const r = checkEssayScope(fs);
      expect(r.ok).toBe(false);
      if (!r.ok) for (const f of fs) expect(r.error).toContain(f);
    },
  );
});

describe('corpus rule (R3)', () => {
  test.prop([fc.array(work, { maxLength: 30 })])('core share is the fraction of works with a core discipline', (ws) => {
    const share = coreShare(ws);
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(1);
    const n = ws.filter((w) => w.domains.some(isCoreDomain)).length;
    expect(share).toBeCloseTo(ws.length === 0 ? 1 : n / ws.length, 12);
  });

  test.prop([fc.array(work, { maxLength: 30 })])('reports every out-of-scope essay and the share', (ws) => {
    const problems = checkCorpusScope(ws);
    const outside = ws.filter((w) => w.form === 'essay' && !w.domains.some(isCoreDomain));
    expect(problems.filter((p) => p.kind === 'essay-out-of-scope')).toHaveLength(outside.length);
    expect(problems.some((p) => p.kind === 'core-share-below-minimum')).toBe(coreShare(ws) < SCOPE_MIN_CORE_SHARE);
    for (const p of problems) expect(formatScopeProblem(p).length).toBeGreaterThan(0);
  });

  it('accepts a corpus of core works and rejects one that foundations outgrow', () => {
    const coreWork = (id: string): ScopedWork => ({ id, form: 'lab', domains: ['information-theory'] });
    const base = (id: string): ScopedWork => ({ id, form: 'lab', domains: ['mathematics'] });
    expect(checkCorpusScope([coreWork('a'), coreWork('b'), coreWork('c'), base('d')])).toEqual([]);
    const tilted = checkCorpusScope([coreWork('a'), base('b'), base('c')]);
    expect(tilted).toEqual([{ kind: 'core-share-below-minimum', share: 1 / 3, minimum: SCOPE_MIN_CORE_SHARE }]);
    expect(formatScopeProblem(tilted[0]!)).toContain('33.3 %');
    expect(checkCorpusScope([{ id: 'x', form: 'essay', domains: [] }])).toContainEqual({
      kind: 'work-without-domain',
      id: 'x',
    });
  });
});

describe('coverage matrix', () => {
  test.prop([fc.array(item, { maxLength: 40 })])(
    'has every cell and counts each item once per listed discipline',
    (items) => {
      const c = coverage(items);
      for (const d of CORE_DOMAINS) for (const s of STRATA) expect(c[d][s]).toBeDefined();
      const total = CORE_DOMAINS.reduce(
        (acc, d) => {
          const row = rowTotal(c[d]);
          return { direct: acc.direct + row.direct, supporting: acc.supporting + row.supporting };
        },
        { direct: 0, supporting: 0 },
      );
      const expected = items.reduce(
        (acc, i) => {
          const l = listing(i.domains);
          return l.role === 'direct'
            ? { ...acc, direct: acc.direct + l.disciplines.length }
            : { ...acc, supporting: acc.supporting + l.disciplines.length };
        },
        { direct: 0, supporting: 0 },
      );
      expect(total).toEqual(expected);
    },
  );

  test.prop([fc.array(item, { maxLength: 40 })])(
    'is a monoid homomorphism: coverage of a concatenation adds cells',
    (items) => {
      const half = Math.floor(items.length / 2);
      const a = coverage(items.slice(0, half));
      const b = coverage(items.slice(half));
      const whole = coverage(items);
      for (const d of CORE_DOMAINS)
        for (const s of STRATA) {
          expect(whole[d][s].direct).toBe(a[d][s].direct + b[d][s].direct);
          expect(whole[d][s].supporting).toBe(a[d][s].supporting + b[d][s].supporting);
        }
    },
  );

  it('names the disciplines no item declares', () => {
    const only: CoreDomain = 'data-engineering';
    const c = coverage([{ stratum: 'formal', domains: [only, 'mathematics'] }]);
    expect(uncovered(c)).toEqual(CORE_DOMAINS.filter((d) => d !== only));
    expect(c[only].formal).toEqual({ direct: 1, supporting: 0 });
    // A foundation-only item supports, but does not cover, a discipline.
    const s = coverage([{ stratum: 'formal', domains: ['probability'] }]);
    expect(s['information-theory'].formal).toEqual({ direct: 0, supporting: 1 });
    expect(uncovered(s)).toEqual([...CORE_DOMAINS]);
  });
});
