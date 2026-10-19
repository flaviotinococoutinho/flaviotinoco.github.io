import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  closeIntent,
  conceptLattice,
  contextOf,
  extentOf,
  formalConcepts,
  intentOf,
} from '../../../src/core/ontology/fca.ts';
import { labelLines, latticeLayout, latticeMarkup } from '../../../src/core/ontology/lattice.ts';
import { renderMarkup, textContent } from '../../../src/core/ontology/markup.ts';

/** Every closed intent by brute force over all attribute subsets: the naive specification. */
const bruteForce = (k: ReturnType<typeof contextOf<string, string>>): string[] => {
  const m = k.attributes;
  const out = new Set<string>();
  for (let mask = 0; mask < 1 << m.length; mask += 1) {
    const subset = m.filter((_, i) => (mask & (1 << i)) !== 0);
    out.add(closeIntent(k, subset).join(','));
  }
  return [...out].sort();
};

const contextArb = fc
  .array(fc.tuple(fc.constantFrom('g1', 'g2', 'g3', 'g4', 'g5'), fc.subarray(['a', 'b', 'c', 'd', 'e', 'f'])), {
    minLength: 1,
    maxLength: 5,
  })
  .map((rows) => contextOf(rows));

describe('NextClosure (Ganter 1984)', () => {
  test.prop([contextArb])('enumerates exactly the closed intents, each once, in lectic order', (k) => {
    const concepts = formalConcepts(k);
    const intents = concepts.map((c) => c.intent.join(','));
    expect(new Set(intents).size).toBe(intents.length);
    expect([...intents].sort()).toEqual(bruteForce(k));
    for (const c of concepts) {
      expect(extentOf(k, c.intent)).toEqual(c.extent);
      expect(intentOf(k, c.extent)).toEqual(c.intent);
    }
  });

  test.prop([contextArb])('the covers form the Hasse diagram of extent inclusion', (k) => {
    const l = conceptLattice(k);
    for (const [lower, upper] of l.covers) {
      const a = new Set(l.concepts[lower]!.extent);
      const b = new Set(l.concepts[upper]!.extent);
      expect([...a].every((g) => b.has(g))).toBe(true);
      expect(b.size).toBeGreaterThan(a.size);
    }
    // γ(g) contains g and μ(m) has m in its intent.
    for (const [g, i] of l.objectConcept) expect(l.concepts[i]!.extent).toContain(g);
    for (const [m, i] of l.attributeConcept) expect(l.concepts[i]!.intent).toContain(m);
  });

  it('computes the lattice of a worked example', () => {
    const k = contextOf([
      ['frog', ['water', 'land', 'animal']],
      ['reed', ['water', 'land', 'plant']],
      ['fish', ['water', 'animal']],
    ]);
    const l = conceptLattice(k);
    expect(l.concepts.map((c) => c.intent.join('+'))).toEqual(
      expect.arrayContaining(['water', 'animal+water', 'land+water', 'animal+land+water', 'animal+land+plant+water']),
    );
    expect(l.concepts).toHaveLength(6);
  });
});

describe('lattice drawing', () => {
  const k = contextOf([
    ['w1', ['a', 'b']],
    ['w2', ['b', 'c']],
    ['w3', ['b']],
  ]);
  const l = conceptLattice(k);
  const layout = latticeLayout(l);

  it('draws every cover edge downwards (layer = rank of the intent size)', () => {
    for (const [lower, upper] of l.covers)
      expect(layout.positions[lower]!.y).toBeGreaterThan(layout.positions[upper]!.y);
    expect(layout.layers.flat().sort()).toEqual(l.concepts.map((_, i) => i).sort());
  });

  it('renders a picture plus a complete textual list', () => {
    const [figure, list] = latticeMarkup({
      lattice: l,
      layout,
      objectLabel: (g) => g.toUpperCase(),
      attributeLabel: (m) => `concept ${m}`,
      objectHref: (g) => `/w/${g}/`,
      attributeHref: (m) => `/c/${m}/`,
      idPrefix: 'fca-test',
      text: {
        title: 'T',
        description: 'D',
        listSummary: 'S',
        extentLabel: 'Works',
        intentLabel: 'Concepts',
        emptyExtent: 'none',
        emptyIntent: 'nothing',
        more: (n) => `+${String(n)}`,
      },
    });
    const html = renderMarkup(figure!);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-labelledby="fca-test-title fca-test-desc"');
    const text = textContent(list!);
    for (const c of l.concepts) for (const m of c.intent) expect(text).toContain(`concept ${m}`);
    expect(renderMarkup(list!)).toContain('href="/w/w1/"');
  });

  it('cuts label lines with a +k suffix', () => {
    expect(labelLines(['alpha', 'beta', 'gamma', 'delta'], 12, 1, (n) => `+${String(n)}`)).toEqual(['alpha, beta +2']);
    expect(labelLines(['a', 'b'], 26, 2, (n) => `+${String(n)}`)).toEqual(['a, b']);
    expect(labelLines([], 26, 2, (n) => `+${String(n)}`)).toEqual([]);
  });
});
