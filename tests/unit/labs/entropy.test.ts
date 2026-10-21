/**
 * Empirical source statistics for the entropy lab: NFC symbol sequences (code points or UTF-8 bytes),
 * counts, bigrams, H = −Σ p log2 p, mean code length, ranking, labels and derived figures.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  countBigrams,
  countSymbols,
  entropyFigures,
  entropyOfCounts,
  meanLength,
  symbolLabel,
  symbolName,
  symbolsOf,
  topSymbols,
} from '../../../src/core/labs/entropy.ts';

describe('symbols', () => {
  it('reads code points or UTF-8 bytes of the NFC form', () => {
    expect(symbolsOf('ab', 'char')).toEqual([97, 98]);
    expect(symbolsOf('é', 'char')).toEqual([0xe9]);
    expect(symbolsOf('é', 'char')).toEqual([0xe9]);
    expect(symbolsOf('é', 'byte')).toEqual([0xc3, 0xa9]);
    expect(symbolsOf('', 'byte')).toEqual([]);
  });

  test.prop([fc.string({ maxLength: 20 })])('canonically equivalent spellings give the same sequence', (s) => {
    expect(symbolsOf(s.normalize('NFD'), 'char')).toEqual(symbolsOf(s.normalize('NFC'), 'char'));
    expect(symbolsOf(s.normalize('NFD'), 'byte')).toEqual(symbolsOf(s, 'byte'));
  });

  it('counts symbols in first-appearance order and bigrams of overlapping pairs', () => {
    expect(countSymbols([2, 1, 2, 3, 2])).toEqual({ symbols: [2, 1, 3], counts: [3, 1, 1], total: 5 });
    expect(countSymbols([])).toEqual({ symbols: [], counts: [], total: 0 });
    expect(countBigrams([1, 2, 1, 2])).toEqual({ pairs: [2, 1], firsts: [2, 1] });
    expect(countBigrams([7])).toEqual({ pairs: [], firsts: [] });
  });
});

describe('entropy and code length', () => {
  it('is 0 for one symbol, log2 m for m equiprobable symbols, 0 for nothing', () => {
    expect(entropyOfCounts([5])).toBe(0);
    expect(entropyOfCounts([1, 1, 1, 1])).toBeCloseTo(2, 12);
    expect(entropyOfCounts([3, 1])).toBeCloseTo(0.8112781, 6);
    expect(entropyOfCounts([])).toBe(0);
    expect(entropyOfCounts([0, 0])).toBe(0);
  });

  test.prop([fc.array(fc.integer({ min: 0, max: 50 }), { minLength: 1, maxLength: 12 })])(
    'is bounded by log2 of the number of used symbols',
    (counts) => {
      const used = counts.filter((c) => c > 0).length;
      const h = entropyOfCounts(counts);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(Math.log2(Math.max(1, used)) + 1e-12);
    },
  );

  it('averages code lengths by frequency', () => {
    expect(meanLength([1, 1, 2], [2, 2, 1])).toBe(1.5);
    expect(meanLength([], [])).toBe(0);
    expect(meanLength([2, 2], [1])).toBe(0.5);
  });

  it('ranks the most frequent symbols, ties by first appearance', () => {
    const stats = countSymbols([1, 2, 2, 3, 3]);
    expect(topSymbols(stats, [3, 1, 2], 2)).toEqual([
      { symbol: 2, count: 2, probability: 0.4, length: 1 },
      { symbol: 3, count: 2, probability: 0.4, length: 2 },
    ]);
    expect(topSymbols(stats, [], 0)).toEqual([]);
    expect(topSymbols(countSymbols([]), [], 3)).toEqual([]);
  });
});

describe('labels and figures', () => {
  it('shows invisible characters as signs and controls or marks as codes', () => {
    expect(symbolLabel(0x20, 'char')).toBe('␣');
    expect(symbolLabel(0x0a, 'byte')).toBe('↵');
    expect(symbolLabel(0x09, 'char')).toBe('⇥');
    expect(symbolLabel(0x41, 'byte')).toBe('A');
    expect(symbolLabel(0xc3, 'byte')).toBe('0xC3');
    expect(symbolLabel(0x301, 'char')).toBe('U+0301');
    expect(symbolLabel(0x1f, 'char')).toBe('U+001F');
    expect(symbolLabel(0xd800, 'char')).toBe('U+D800');
    expect(symbolLabel(0xe9, 'char')).toBe('é');
  });

  it('names a symbol by its code when the label is a sign', () => {
    expect(symbolName(0x20, 'char')).toBe('U+0020');
    expect(symbolName(0x20, 'byte')).toBe('0x20');
    expect(symbolName(0x301, 'char')).toBe('U+0301');
    expect(symbolName(0x41, 'char')).toBe('A');
  });

  it('derives the maximum entropy, fixed length and redundancy', () => {
    expect(entropyFigures(0, 0)).toEqual({ distinct: 0, maxEntropy: null, fixedLength: null, redundancy: null });
    expect(entropyFigures(0, 1)).toEqual({ distinct: 1, maxEntropy: 0, fixedLength: 1, redundancy: null });
    expect(entropyFigures(1, 4)).toEqual({ distinct: 4, maxEntropy: 2, fixedLength: 2, redundancy: 0.5 });
    expect(entropyFigures(3, 4).redundancy).toBe(0);
    expect(entropyFigures(2, 5).fixedLength).toBe(3);
    expect(entropyFigures(2, 8).fixedLength).toBe(3);
  });
});
