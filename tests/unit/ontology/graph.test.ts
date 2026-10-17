import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { buildGraph, components, degreeOf, distancesFrom, edgesOf, linked, neighbourhood } from '../../../src/core/ontology/graph.ts';
import { describeError, describeWarning, type OntologyError } from '../../../src/core/ontology/model.ts';
import { buildOntology } from '../../../src/core/ontology/ontology.ts';
import { parseConceptEntry } from '../../../src/core/ontology/parse.ts';
import { RELATION_TYPES, RELATIONS } from '../../../src/core/ontology/vocabulary.ts';
import { cid, nodeName, raw, siteOntology, siteRaws, type Spec } from './helpers.ts';

const errorsOf = (raws: ReturnType<typeof raw>[]): readonly OntologyError[] => {
  const r = buildOntology(raws);
  return r.ok ? [] : r.error;
};
const kinds = (raws: ReturnType<typeof raw>[]): readonly string[] => errorsOf(raws).map((e) => e.kind);

/** A connected pair a — b plus whatever is given. */
const pair = (a: Spec = {}, b: Spec = {}) => [raw('a', { ...a, relations: [...(a.relations ?? []), ['related', 'b']] }), raw('b', b)];

describe('the site ontology', () => {
  const o = siteOntology();

  it('is a valid scheme with no topological warnings', () => {
    expect(o.graph.warnings.map(describeWarning)).toEqual([]);
    expect(o.graph.ids.length).toBeGreaterThanOrEqual(40);
  });

  it('keeps every concept id used by the content team', () => {
    const used =
      'being ontology epistemology knowledge sign symbol meaning sense-and-reference inference argument information entropy mutual-information channel channel-capacity redundancy signal noise frequency model fourier-transform fourier-series gibbs-phenomenon sampling-theorem aliasing fast-fourier-transform prefix-code huffman-code kraft-inequality logistic-map deterministic-chaos lyapunov-exponent bifurcation central-limit-theorem decision hick-hyman-law cognitive-load value product interface'.split(
        ' ',
      );
    for (const id of used) expect(o.graph.concepts.has(cid(id)), id).toBe(true);
  });

  it('spans the four strata and every category', () => {
    expect([...o.stats.strata.counts.values()].every((n) => n > 0)).toBe(true);
    expect([...o.stats.categories.counts.values()].every((n) => n > 0)).toBe(true);
  });

  it('derives every inverse as the converse of its relation (law)', () => {
    for (const type of RELATION_TYPES) {
      for (const a of o.graph.ids) {
        for (const b of linked(o.graph, a, type, 'out')) expect(linked(o.graph, b, type, 'in')).toContain(a);
        for (const b of linked(o.graph, a, type, 'in')) expect(linked(o.graph, b, type, 'out')).toContain(a);
      }
    }
  });

  it('narrower is the converse of broader', () => {
    for (const a of o.graph.ids) {
      for (const p of o.graph.hierarchy.broader.get(a) ?? []) expect(o.graph.hierarchy.narrower.get(p)).toContain(a);
    }
  });

  it('is connected and every concept has an edge', () => {
    expect(components(o.graph.ids, o.graph.neighbours)).toHaveLength(1);
    for (const id of o.graph.ids) expect(degreeOf(o.graph, id)).toBeGreaterThan(0);
  });

  it('stores links canonically (symmetric pairs oriented source < target)', () => {
    for (const l of o.graph.links) if (RELATIONS[l.type].symmetric) expect(l.source < l.target).toBe(true);
    expect(edgesOf(o.graph)).toBe(o.graph.links);
  });
});

describe('neighbourhoods', () => {
  const o = siteOntology();
  it('starts with the focus and grows with depth', () => {
    const one = neighbourhood(o.graph, cid('entropy'), 1);
    const two = neighbourhood(o.graph, cid('entropy'), 2);
    expect(one[0]).toBe('entropy');
    expect(two.length).toBeGreaterThan(one.length);
    expect(one.every((id) => two.includes(id))).toBe(true);
    expect(neighbourhood(o.graph, cid('nothing'), 2)).toEqual([]);
  });
  it('measures distances consistently with the neighbourhood', () => {
    const d = distancesFrom(o.graph, cid('entropy'), 2);
    expect(d.get(cid('entropy'))).toBe(0);
    expect([...d.keys()].sort()).toEqual([...neighbourhood(o.graph, cid('entropy'), 2)].sort());
    expect(distancesFrom(o.graph, cid('nothing'), 2).size).toBe(0);
  });
});

describe('validation reports every violation', () => {
  it('accepts a minimal connected pair', () => {
    expect(kinds(pair())).toEqual([]);
  });

  it('rejects unknown references, self relations and repetitions', () => {
    const errors = kinds([
      raw('a', { broader: ['zzz', 'a'], relations: [['related', 'b'], ['related', 'b']] }),
      raw('b'),
    ]);
    expect(errors).toContain('unknown-reference');
    expect(errors).toContain('self-relation');
    expect(errors).toContain('repeated-relation');
  });

  it('finds broader cycles and prints the cycle', () => {
    const errors = errorsOf([raw('a', { broader: ['b'] }), raw('b', { broader: ['c'] }), raw('c', { broader: ['a'] })]);
    const cycle = errors.find((e) => e.kind === 'cycle');
    expect(cycle).toMatchObject({ kind: 'cycle', scope: 'broader', cycle: ['a', 'b', 'c', 'a'] });
    expect(describeError(cycle as OntologyError)).toBe('broader cycle: a → b → c → a');
  });

  it('finds cycles of the prerequisite order that no single type has', () => {
    const errors = errorsOf([raw('a', { broader: ['b'] }), raw('b', { relations: [['dependsOn', 'a']] })]);
    expect(errors.some((e) => e.kind === 'cycle' && e.scope === 'prerequisite')).toBe(true);
    // The same pair under two types is reported too.
    expect(errors.some((e) => e.kind === 'pair-under-two-types')).toBe(true);
  });

  it('enforces the filtration of the bridge (stratum constraints)', () => {
    expect(kinds(pair({ stratum: 'philosophy', relations: [['formalizes', 'b']] }, { stratum: 'formal' }))).toContain(
      'stratum-constraint',
    );
    expect(kinds(pair({ stratum: 'value', relations: [['appliesTo', 'b']] }, { stratum: 'theory' }))).toContain(
      'stratum-constraint',
    );
    expect(
      kinds([raw('a', { stratum: 'formal', relations: [['formalizes', 'b']] }), raw('b', { stratum: 'theory' })]),
    ).toEqual([]);
  });

  it('enforces category constraints (measures, same-category broader)', () => {
    expect(kinds([raw('a', { category: 'quality', relations: [['measures', 'b']] }), raw('b')])).toContain(
      'category-constraint',
    );
    expect(kinds([raw('a', { category: 'measure', relations: [['measures', 'b']] }), raw('b', { category: 'process' })])).toContain(
      'category-constraint',
    );
    expect(kinds([raw('a', { category: 'measure', broader: ['b'] }), raw('b', { category: 'entity' })])).toContain(
      'category-constraint',
    );
  });

  it('rejects a symmetric relation stored in both files', () => {
    expect(kinds([raw('a', { relations: [['contrastsWith', 'b']] }), raw('b', { relations: [['contrastsWith', 'a']] })])).toContain(
      'symmetric-stored-twice',
    );
  });

  it('rejects associative pairs that are also hierarchical (SKOS S27), including the partOf closure', () => {
    const direct = kinds([raw('a', { broader: ['b'] }), raw('b', { broader: ['c'] }), raw('c', { relations: [['related', 'a']] })]);
    expect(direct).toContain('associative-hierarchical');
    const entailed = kinds([
      raw('a', { broader: ['b'], relations: [['partOf', 'x']] }),
      raw('b', { broader: ['c'] }),
      raw('x', { relations: [['partOf', 'c']] }),
      raw('c'),
    ]);
    expect(entailed).toContain('associative-hierarchical');
  });

  it('rejects isolated concepts and disconnected components', () => {
    const errors = kinds([...pair(), raw('c'), raw('d', { relations: [['related', 'e']] }), raw('e')]);
    expect(errors).toContain('isolated');
    expect(errors).toContain('disconnected');
  });

  it('requires sources for propositions', () => {
    expect(kinds(pair({ category: 'proposition' }))).toContain('proposition-without-source');
    expect(kinds(pair({ category: 'proposition', sources: ['shannon1948'] }))).toEqual([]);
  });

  it('checks slugs and labels per locale', () => {
    expect(kinds(pair({ pt: 'Mesmo' }, { pt: 'Mesmo' }))).toEqual(expect.arrayContaining(['duplicate-slug', 'duplicate-pref-label']));
    expect(kinds(pair({ alt: { pt: ['pt a'] } }))).toContain('pref-alt-overlap');
    const mismatch = raw('a', { relations: [['related', 'b']] });
    (mismatch.data as { slug: Record<string, string> }).slug['en'] = 'wrong';
    expect(kinds([mismatch, raw('b')])).toContain('slug-locale-mismatch');
  });

  it('accumulates parse errors with graph errors, without consequential noise', () => {
    const broken = raw('b');
    delete (broken.data as Record<string, unknown>)['category'];
    const errors = errorsOf([raw('a', { relations: [['related', 'b']] }), broken]);
    expect(errors.map((e) => e.kind)).toEqual(['malformed']);
  });

  it('describes every error kind in English', () => {
    const samples = errorsOf([
      raw('a', { broader: ['zzz', 'a', 'b', 'b'], category: 'proposition', relations: [['measures', 'c']] }),
      raw('b', { broader: ['a'], relations: [['related', 'c'], ['contrastsWith', 'a']] }),
      raw('c', { relations: [['related', 'b']] }),
      raw('d'),
    ]);
    for (const e of samples) expect(describeError(e).length).toBeGreaterThan(5);
  });
});

describe('warnings', () => {
  it('warns about broader edges outside the transitive reduction', () => {
    const r = buildGraph(
      [raw('a', { broader: ['b', 'c'] }), raw('b', { broader: ['c'] }), raw('c')].map((x) => {
        const p = parseConceptEntry(x.id, x.data);
        if (!p.ok) throw new Error('fixture');
        return p.value;
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings).toEqual([{ kind: 'redundant-broader', id: 'a', target: 'c', via: ['b'] }]);
    expect(describeWarning(r.value.warnings[0] as never)).toContain('a → b → c');
  });

  it('warns about more than two broader parents', () => {
    const r = buildOntology([raw('a', { broader: ['b', 'c', 'd'] }), raw('b'), raw('c'), raw('d')]);
    expect(r.ok && r.value.graph.warnings.map((w) => w.kind)).toEqual(['polyhierarchy-excess']);
  });
});

describe('cycle detection on random graphs', () => {
  test.prop([fc.integer({ min: 2, max: 8 }), fc.integer({ min: 0, max: 1000 })])(
    'finds an injected broader cycle in an otherwise acyclic chain',
    (n, seed) => {
      // A chain n_{i} → n_{i-1}, then close it: n_0 → n_{n-1}.
      const raws = Array.from({ length: n }, (_, i) =>
        raw(nodeName(i), { broader: i === 0 ? [nodeName(n - 1)] : [nodeName(i - 1)], pt: `pt ${String(i)} ${String(seed)}` }),
      );
      const errors = errorsOf(raws);
      const cycle = errors.find((e) => e.kind === 'cycle' && e.scope === 'broader');
      expect(cycle).toBeDefined();
      if (cycle?.kind === 'cycle') expect(new Set(cycle.cycle).size).toBe(n);
    },
  );
});
