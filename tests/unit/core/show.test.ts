import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { show } from '../../../src/core/algebra/show.ts';
import { parseSlug, parseLabel } from '../../../src/core/domain/identifiers.ts';
import { parseStratum } from '../../../src/core/domain/strata.ts';

describe('show', () => {
  test.prop([
    fc.anything({ withBigInt: true, withMap: true, withSet: true, withObjectString: true, withNullPrototype: true }),
  ])('never throws and is bounded', (v) => {
    const s = show(v);
    expect(typeof s).toBe('string');
    expect(s.length).toBeLessThanOrEqual(Math.max(80, typeof v === 'string' ? v.length : 0));
  });

  test.prop([fc.constantFrom({ toString: [] }, { valueOf: 1, toString: 2 }, Object.create(null), Symbol('x'))])(
    'parsers report hostile inputs instead of throwing',
    (v) => {
      expect(parseSlug(v).ok).toBe(false);
      expect(parseLabel(v).ok).toBe(false);
      expect(parseStratum(v).ok).toBe(false);
    },
  );
});
