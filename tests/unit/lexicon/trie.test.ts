import { describe, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { buildTrie, naiveAlternationBody, trieToRegexBody } from '../../../src/core/lexicon/trie.ts';
import { termArb, wordArb } from './helpers.ts';

/**
 * LAW (compiler): the anchored pattern compiled from the trie accepts exactly
 * the key set — with a space in a key standing for any whitespace run.
 */
describe('trie → regex compiler', () => {
  const accepts = (body: string, s: string): boolean => new RegExp(`^(?:${body})$`, 'u').test(s);

  test.prop([fc.uniqueArray(termArb, { minLength: 1, maxLength: 12 }), termArb])(
    'accepts exactly the keys',
    (keys, probe) => {
      const body = trieToRegexBody(buildTrie(keys)) ?? '';
      for (const k of keys) expect(accepts(body, k)).toBe(true);
      expect(accepts(body, probe)).toBe(keys.includes(probe));
    },
  );

  test.prop([fc.uniqueArray(termArb, { minLength: 1, maxLength: 12 })])(
    'agrees with the naive alternation on every key and on random probes',
    (keys) => {
      const trie = trieToRegexBody(buildTrie(keys)) ?? '';
      const naive = naiveAlternationBody(keys) ?? '';
      for (const k of keys) expect(accepts(trie, k)).toBe(accepts(naive, k));
    },
  );

  test.prop([fc.uniqueArray(wordArb, { minLength: 2, maxLength: 6 })])(
    'a key space matches any whitespace run',
    (words) => {
      const key = words.join(' ');
      const body = trieToRegexBody(buildTrie([key])) ?? '';
      expect(accepts(body, words.join(' \n\u00a0'))).toBe(true);
    },
  );

  test.prop([fc.constant(0)])('an empty key set compiles to nothing (never to the empty pattern)', () => {
    expect(trieToRegexBody(buildTrie([]))).toBeUndefined();
    expect(trieToRegexBody(buildTrie(['']))).toBeUndefined();
  });
});
