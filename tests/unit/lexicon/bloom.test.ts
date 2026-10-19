import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  BLOOM_HEADER_BYTES,
  bloomHas,
  bloomParameters,
  buildBloom,
  crc32,
  decodeBloom,
  encodeBloom,
  expectedFalsePositiveRate,
  fnv1a32,
  murmur3x86_32,
  utf8,
  type BloomFilter,
} from '../../../src/core/lexicon/bloom.ts';

const ascii = (s: string): Uint8Array => utf8(s);

const build = (keys: readonly string[], p: number): BloomFilter => {
  const r = buildBloom(keys, { falsePositiveRate: p });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

/** Deterministic pseudo-random strings (xorshift32): tests must not depend on Math.random. */
const randomStrings = (n: number, seed: number, prefix: string): readonly string[] => {
  let x = seed >>> 0 || 1;
  const next = (): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
  return Array.from({ length: n }, () => `${prefix}${next().toString(36)}${next().toString(36)}`);
};

describe('hash functions (known-answer tests)', () => {
  it('FNV-1a 32', () => {
    expect(fnv1a32(ascii(''))).toBe(0x811c9dc5);
    expect(fnv1a32(ascii('a'))).toBe(0xe40c292c);
    expect(fnv1a32(ascii('foobar'))).toBe(0xbf9cf968);
  });

  it('MurmurHash3 x86_32, including 1–3 byte tails', () => {
    expect(murmur3x86_32(ascii(''), 0)).toBe(0);
    expect(murmur3x86_32(ascii(''), 1)).toBe(0x514e28b7);
    expect(murmur3x86_32(ascii(''), 0xffffffff)).toBe(0x81f16f39);
    expect(murmur3x86_32(new Uint8Array([0, 0, 0, 0]), 0)).toBe(0x2362f9de);
    expect(murmur3x86_32(ascii('Hello, world!'), 0x9747b28c)).toBe(0x24884cba);
    expect(murmur3x86_32(ascii('The quick brown fox jumps over the lazy dog'), 0x9747b28c)).toBe(0x2fa826cd);
  });

  it('CRC-32 check value and UTF-8 encoding', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
    expect([...utf8('é€𝐀')]).toEqual([0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9d, 0x90, 0x80]);
  });
});

describe('Bloom filter', () => {
  it('sizes m and k optimally (m = ⌈−n ln p / ln²2⌉ bytes-aligned, k = round(m/n · ln 2))', () => {
    expect(bloomParameters(300_000, 0.01)).toEqual({ ok: true, value: { m: 2_875_520, k: 7 } });
    expect(bloomParameters(300_000, 0.001)).toEqual({ ok: true, value: { m: 4_313_280, k: 10 } });
    expect(bloomParameters(0, 0.01).ok).toBe(false);
    expect(bloomParameters(10, 1).ok).toBe(false);
  });

  test.prop([fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 300 })])(
    'LAW: no false negatives',
    (keys) => {
      const filter = build(keys, 0.01);
      for (const k of keys) expect(bloomHas(filter, k)).toBe(true);
    },
  );

  it('normalises keys (NFC + case fold) as recorded in the header', () => {
    const filter = build(['Café', 'Zeitgeist'], 0.01);
    expect(bloomHas(filter, 'cafe\u0301')).toBe(true);
    expect(bloomHas(filter, 'ZEITGEIST')).toBe(true);
  });

  it('LAW: the empirical false-positive rate for n = 100 000 random strings is within tolerance of p', () => {
    const p = 0.01;
    const filter = build(randomStrings(100_000, 0x2545f491, 'in:'), p);
    const probes = randomStrings(100_000, 0x9e3779b9, 'out:');
    const fp = probes.filter((s) => bloomHas(filter, s)).length / probes.length;
    const theory = expectedFalsePositiveRate(filter.header.m, filter.header.k, filter.header.n);
    expect(theory).toBeGreaterThan(0.009);
    expect(theory).toBeLessThan(0.011);
    // Binomial standard deviation at n = 1e5, p = 0.01 is ≈ 3.1e-4; allow ±25 % (≈ 8σ).
    expect(Math.abs(fp - p)).toBeLessThan(0.25 * p);
  }, 30_000);

  it('LAW: binary serialisation round-trips', () => {
    const filter = build(randomStrings(1000, 7, 'k'), 0.02);
    const bytes = encodeBloom(filter);
    expect(bytes.length).toBe(BLOOM_HEADER_BYTES + filter.header.m / 8);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('LXBF');
    expect(decodeBloom(bytes)).toEqual({ ok: true, value: filter });
  });

  it('decoding is total: malformed inputs give typed errors', () => {
    const bytes = encodeBloom(build(['a', 'b', 'c'], 0.05));
    const corrupt = (f: (b: Uint8Array) => void): Uint8Array => {
      const copy = bytes.slice();
      f(copy);
      return copy;
    };
    const kind = (b: Uint8Array): string => {
      const r = decodeBloom(b);
      return r.ok ? 'ok' : r.error.kind;
    };
    expect(kind(bytes.subarray(0, 10))).toBe('truncated');
    expect(kind(corrupt((b) => b.set([0x58], 0)))).toBe('bad-magic');
    expect(kind(corrupt((b) => b.set([2], 4)))).toBe('unsupported-version');
    expect(kind(corrupt((b) => b.set([9], 6)))).toBe('unknown-hash');
    expect(kind(bytes.subarray(0, bytes.length - 1))).toBe('length-mismatch');
    expect(kind(corrupt((b) => b.set([(b[BLOOM_HEADER_BYTES] ?? 0) ^ 1], BLOOM_HEADER_BYTES)))).toBe('checksum');
  });
});
