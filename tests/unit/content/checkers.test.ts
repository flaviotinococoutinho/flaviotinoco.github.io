/**
 * Laws of the corpus scanners (checkers.ts). A checker that misses a key or
 * flags a legal "R$" would make syntax.test.ts lie, so each recogniser is
 * tested against generated prose whose ground truth is known by construction.
 */
import { fc, test } from '@fast-check/vitest';
import type { Nodes } from 'mdast';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import {
  CITATION_KEYS,
  citationsIn,
  countWords,
  headingAttributes,
  proseText,
  renderHeadingAttributes,
  strayDollars,
  stripCitations,
} from './checkers.ts';
import { parseMarkdown } from './corpus.ts';

/** Prose words that never contain the syntax under test. */
const word = fc.stringMatching(/^[a-zà-úç]{1,10}$/u);
const prose = fc.array(word, { minLength: 0, maxLength: 12 }).map((ws) => ws.join(' '));
const key = fc.constantFrom(...CITATION_KEYS);
const locator = fc.constantFrom('', ', p. 12', ', cap. 5', ', v. 2, § 228', ', p. 379, tradução nossa');

describe('citationsIn', () => {
  test.prop([prose, fc.array(fc.tuple(key, locator), { minLength: 1, maxLength: 3 }), prose])(
    'finds exactly the keys of a bracketed cluster, flagged as bracketed',
    (before, items, after) => {
      const cluster = `[${items.map(([k, l]) => `@${k}${l}`).join('; ')}]`;
      const found = citationsIn(`${before} ${cluster} ${after}.`);
      expect(found.map((c) => c.key)).toEqual(items.map(([k]) => k));
      expect(found.every((c) => c.bracketed)).toBe(true);
    },
  );

  test.prop([prose, key, prose])(
    'reads a narrative citation and stops before sentence punctuation',
    (before, k, after) => {
      const found = citationsIn(`${before} @${k} [p. 3] ${after}. E @${k}.`);
      expect(found.map((c) => [c.key, c.bracketed])).toEqual([
        [k, false],
        [k, false],
      ]);
    },
  );

  test.prop([prose])('ignores e-mail addresses and plain prose', (text) => {
    expect(citationsIn(`${text} autor@exemplo.org`)).toEqual([]);
  });

  it('recognises the suppressed-author form', () => {
    expect(citationsIn('como mostrado [-@shannon1948, p. 379]').map((c) => c.key)).toEqual(['shannon1948']);
  });

  test.prop([prose, key])('stripCitations leaves the surrounding words intact', (text, k) => {
    expect(countWords(stripCitations(`${text} [@${k}, p. 3]`), 'pt-BR')).toBe(countWords(text, 'pt-BR'));
  });
});

describe('strayDollars', () => {
  const ranges = (md: string): (readonly [number, number])[] => {
    const out: (readonly [number, number])[] = [];
    visit(parseMarkdown(md), (n: Nodes) => {
      if (['math', 'inlineMath', 'code', 'inlineCode', 'html'].includes(n.type)) {
        out.push([n.position?.start.offset ?? 0, n.position?.end.offset ?? 0]);
      }
    });
    return out;
  };

  test.prop([prose, fc.integer({ min: 1, max: 999 }), prose])(
    'accepts currency, escaped dollars, $$…$$ math and code',
    (a, n, b) => {
      const md = `${a} R$ ${n},00 e \\$${n} ${b} $$x^2$$ e \`$PATH\`.`;
      expect(strayDollars(md, ranges(md))).toEqual([]);
    },
  );

  test.prop([prose, prose])('flags single-dollar math (it is never math in this site)', (a, b) => {
    const md = `${a} $x$ ${b}`;
    expect(strayDollars(md, ranges(md))).toHaveLength(2);
  });
});

describe('headingAttributes', () => {
  const id = fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+){0,3}$/u);
  const kind = fc.constantFrom('question', 'claim', 'premise', 'conclusion');

  test.prop([prose, id, kind, fc.array(id, { maxLength: 3 })])(
    'round-trips a rendered attribute block',
    (title, i, k, deps) => {
      const attrs = { ids: [i], classes: [k], pairs: deps.length > 0 ? { depends: deps.join(',') } : {} };
      expect(headingAttributes(`${title || 'T'} ${renderHeadingAttributes(attrs)}`)).toEqual(attrs);
    },
  );

  test.prop([prose])('is null on headings without a trailing block', (title) => {
    expect(headingAttributes(title)).toBeNull();
    expect(headingAttributes(`${title} {1, 2}`)).toBeNull();
  });

  it('accepts the curly quotes SmartyPants produces', () => {
    expect(headingAttributes('Título {#t .claim depends=“a,b”}')?.pairs).toEqual({ depends: 'a,b' });
  });
});

describe('proseText', () => {
  test.prop([prose])('excludes math and code but keeps every prose word', (text) => {
    const md = `${text} $$a+b$$ \`código\``;
    expect(countWords(proseText(parseMarkdown(md)), 'pt-BR')).toBe(countWords(text, 'pt-BR'));
  });
});
