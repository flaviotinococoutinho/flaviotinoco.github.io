/**
 * The build clock honours SOURCE_DATE_EPOCH (reproducible builds) and ignores
 * anything that is not a non-negative decimal count of seconds.
 */
import { describe, expect, it } from 'vitest';
import { BUILD_DATE, BUILD_DAY, parseSourceDateEpoch } from '../../../src/adapters/astro/build-clock.ts';

describe('build clock', () => {
  it('reads SOURCE_DATE_EPOCH as seconds since the epoch, UTC', () => {
    expect(parseSourceDateEpoch('1760832000')?.toISOString()).toBe('2025-10-19T00:00:00.000Z');
    expect(parseSourceDateEpoch(' 0 ')?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('ignores malformed values', () => {
    for (const raw of [undefined, '', '-1', '1.5', '1e9', 'abc', '9999999999999'])
      expect(parseSourceDateEpoch(raw)).toBeUndefined();
  });

  it('exposes one calendar date and the matching UTC day', () => {
    expect(BUILD_DAY.toISOString().slice(0, 10)).toBe(
      `${BUILD_DATE.year}-${String(BUILD_DATE.month).padStart(2, '0')}-${String(BUILD_DATE.day).padStart(2, '0')}`,
    );
  });
});
