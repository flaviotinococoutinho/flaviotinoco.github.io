/**
 * Run-in lists (src/core/chrome/runin.ts): the separator never opens a line, and the items are recoverable.
 */
import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { RUN_IN_SEPARATOR, runIn } from '../../../src/core/chrome/runin.ts';

/** Items as authors write them: any text without the separator's own characters. */
const item = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !/[\u00a0·]/u.test(s));

describe('run-in lists', () => {
  test.prop([fc.array(item, { minLength: 1, maxLength: 6 })])(
    'split at the separator gives the items back (decode ∘ encode = id)',
    (items) => {
      expect(runIn(items).split(RUN_IN_SEPARATOR)).toEqual(items);
    },
  );

  test.prop([fc.array(item, { minLength: 2, maxLength: 6 })])(
    'no break opportunity comes before a dot: a wrapped line never starts with "·"',
    (items) => {
      const text = runIn(items);
      // A line can break at an ordinary space; what follows it would start the next line.
      for (let i = 0; i < text.length; i++) if (text[i] === ' ') expect(text[i + 1]).not.toBe('·');
      // The dot is glued to the item before it.
      for (let i = 0; i < text.length; i++) if (text[i] === '·') expect(text[i - 1]).toBe('\u00a0');
    },
  );

  it('sets one item alone and no item as nothing', () => {
    expect(runIn(['a'])).toBe('a');
    expect(runIn([])).toBe('');
  });
});
