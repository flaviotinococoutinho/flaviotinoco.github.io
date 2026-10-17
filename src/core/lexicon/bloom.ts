/**
 * Bloom filter (B. H. Bloom, "Space/time trade-offs in hash coding with
 * allowable errors", CACM 13(7):422–426, 1970) for the future terminal tooling
 * ("is this a known Portuguese word?" → unknown-word lint and suggestions).
 *
 * Asymmetric errors, and why they fit lint but never markup: a "no" is certain
 * (no false negatives), a "yes" is wrong with probability ≈ p. So the filter may
 * power suggestions, never automatic marking — the marking dictionaries are
 * exact (docs/research/lexicon.md §2). For the pt-BR word list the research also
 * found that a minimal DAFSA (directed acyclic word graph) is an exact structure
 * of comparable size; it is the documented alternative, not implemented here.
 *
 * Design:
 *  - k hash functions by double hashing (A. Kirsch & M. Mitzenmacher, "Less
 *    hashing, same performance", ESA 2006): g_i(x) = h1(x) + i·h2(x) mod m,
 *    with h1 = FNV-1a 32-bit and h2 = MurmurHash3 x86_32 (forced odd), both over
 *    the UTF-8 bytes of the normalised key.
 *  - Optimal sizing for n keys at false-positive rate p:
 *        m = ⌈−n·ln p / (ln 2)²⌉ (rounded up to whole bytes),  k = round((m/n)·ln 2).
 *  - Keys are normalised before hashing (NFC, and the context-free case fold of
 *    text.ts when the flag is set); the flags are stored in the header so a
 *    reader can never query with different conventions.
 *
 * Binary format v1 (little-endian, 48-byte header, then the bit array):
 *   0  "LXBF" magic        4  u16 version (1)   6  u8 h1 id (1 = FNV-1a-32)
 *   7  u8 h2 id (2 = Murmur3-x86-32)            8  u8 normalisation flags (bit 0 NFC, bit 1 fold)
 *   9  u8 reserved (0)    10  u16 k            12  u32 seed (Murmur3)
 *  16  u64 m (bits)       24  u64 n (keys)     32  f64 p (target rate)
 *  40  u32 payload bytes  44  u32 CRC-32 (IEEE 802.3) of the payload
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { fold } from './text.ts';

export const BLOOM_MAGIC = 'LXBF';
export const BLOOM_VERSION = 1;
export const BLOOM_HEADER_BYTES = 48;
export const HASH_FNV1A_32 = 1;
export const HASH_MURMUR3_32 = 2;
export const NORM_NFC = 1;
export const NORM_FOLD = 2;
const DEFAULT_SEED = 0x9747b28c;

export interface BloomHeader {
  readonly version: number;
  readonly h1: number;
  readonly h2: number;
  readonly normalisation: number;
  readonly k: number;
  readonly seed: number;
  readonly m: number;
  readonly n: number;
  readonly p: number;
}

export interface BloomFilter {
  readonly header: BloomHeader;
  /** m bits, bit j at byte j >>> 3, mask 1 << (j & 7). */
  readonly bits: Uint8Array;
}

/** UTF-8 encoding (RFC 3629) of a string; lone surrogates become U+FFFD. */
export const utf8 = (s: string): Uint8Array => {
  const out: number[] = [];
  for (const ch of s) {
    let cp = ch.codePointAt(0) ?? 0xfffd;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
};

/** FNV-1a, 32-bit (G. Fowler, L. C. Noll, K.-P. Vo; offset basis 0x811c9dc5, prime 0x01000193). */
export const fnv1a32 = (bytes: Uint8Array): number => {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** MurmurHash3 x86_32 (A. Appleby, public domain reference implementation). */
export const murmur3x86_32 = (bytes: Uint8Array, seed: number): number => {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const len = bytes.length;
  const blocks = len >>> 2;
  let h = seed >>> 0;
  for (let b = 0; b < blocks; b++) {
    const i = b << 2;
    let k = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  const tail = blocks << 2;
  const rem = len & 3;
  if (rem > 0) {
    let k = 0;
    if (rem === 3) k ^= (bytes[tail + 2] ?? 0) << 16;
    if (rem >= 2) k ^= (bytes[tail + 1] ?? 0) << 8;
    k ^= bytes[tail] ?? 0;
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
  }
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320); check value of "123456789" is 0xCBF43926. */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Optimal (m, k) for n keys at false-positive rate p; m rounded up to whole bytes. */
export const bloomParameters = (n: number, p: number): Result<{ readonly m: number; readonly k: number }, string> => {
  if (!Number.isInteger(n) || n <= 0) return err(`expected item count must be a positive integer, got ${n}`);
  if (!(p > 0 && p < 1)) return err(`false-positive rate must be in (0, 1), got ${p}`);
  const raw = Math.ceil((-n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const m = Math.ceil(raw / 8) * 8;
  const k = Math.max(1, Math.round((m / n) * Math.LN2));
  return ok({ m, k });
};

/** Theoretical false-positive rate after inserting n keys: (1 − e^(−kn/m))^k. */
export const expectedFalsePositiveRate = (m: number, k: number, n: number): number => (1 - Math.exp((-k * n) / m)) ** k;

/** The normalised form of a key under the given flags. */
export const normaliseKey = (key: string, flags: number): string => {
  const nfc = flags & NORM_NFC ? key.normalize('NFC') : key;
  return flags & NORM_FOLD ? fold(nfc) : nfc;
};

/** Bit positions g_0 … g_{k−1} of a key (Kirsch–Mitzenmacher double hashing). */
export const bitPositions = (header: BloomHeader, key: string): readonly number[] => {
  const bytes = utf8(normaliseKey(key, header.normalisation));
  const a = fnv1a32(bytes) % header.m;
  const b = ((murmur3x86_32(bytes, header.seed) | 1) >>> 0) % header.m;
  const out: number[] = [];
  let x = a;
  for (let i = 0; i < header.k; i++) {
    out.push(x);
    x += b;
    if (x >= header.m) x -= header.m;
  }
  return out;
};

export interface BloomOptions {
  /** Target false-positive rate p. */
  readonly falsePositiveRate: number;
  /** Planned capacity n (defaults to the number of keys). */
  readonly capacity?: number;
  readonly seed?: number;
  /** NORM_NFC | NORM_FOLD (default both). */
  readonly normalisation?: number;
}

export const buildBloom = (keys: readonly string[], options: BloomOptions): Result<BloomFilter, string> => {
  const params = bloomParameters(options.capacity ?? Math.max(1, keys.length), options.falsePositiveRate);
  if (!params.ok) return params;
  const header: BloomHeader = {
    version: BLOOM_VERSION,
    h1: HASH_FNV1A_32,
    h2: HASH_MURMUR3_32,
    normalisation: options.normalisation ?? NORM_NFC | NORM_FOLD,
    k: params.value.k,
    seed: (options.seed ?? DEFAULT_SEED) >>> 0,
    m: params.value.m,
    n: keys.length,
    p: options.falsePositiveRate,
  };
  const bits = new Uint8Array(header.m / 8);
  for (const key of keys) {
    for (const j of bitPositions(header, key)) bits[j >>> 3] = (bits[j >>> 3] ?? 0) | (1 << (j & 7));
  }
  return ok({ header, bits });
};

/** Membership test: false is certain; true is wrong with probability ≈ p. */
export const bloomHas = (filter: BloomFilter, key: string): boolean =>
  bitPositions(filter.header, key).every((j) => ((filter.bits[j >>> 3] ?? 0) & (1 << (j & 7))) !== 0);

/** Serialises a filter (pure: returns a new buffer). */
export const encodeBloom = (filter: BloomFilter): Uint8Array => {
  const { header, bits } = filter;
  const out = new Uint8Array(BLOOM_HEADER_BYTES + bits.length);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = BLOOM_MAGIC.charCodeAt(i);
  view.setUint16(4, header.version, true);
  view.setUint8(6, header.h1);
  view.setUint8(7, header.h2);
  view.setUint8(8, header.normalisation);
  view.setUint8(9, 0);
  view.setUint16(10, header.k, true);
  view.setUint32(12, header.seed, true);
  view.setBigUint64(16, BigInt(header.m), true);
  view.setBigUint64(24, BigInt(header.n), true);
  view.setFloat64(32, header.p, true);
  view.setUint32(40, bits.length, true);
  view.setUint32(44, crc32(bits), true);
  out.set(bits, BLOOM_HEADER_BYTES);
  return out;
};

export type BloomDecodeError =
  | { readonly kind: 'truncated'; readonly length: number }
  | { readonly kind: 'bad-magic' }
  | { readonly kind: 'unsupported-version'; readonly version: number }
  | { readonly kind: 'unknown-hash'; readonly h1: number; readonly h2: number }
  | { readonly kind: 'bad-parameters'; readonly detail: string }
  | { readonly kind: 'length-mismatch'; readonly expected: number; readonly actual: number }
  | { readonly kind: 'checksum'; readonly expected: number; readonly actual: number };

/** Total parser of the binary format: every malformed input yields a typed error. */
export const decodeBloom = (bytes: Uint8Array): Result<BloomFilter, BloomDecodeError> => {
  if (bytes.length < BLOOM_HEADER_BYTES) return err({ kind: 'truncated', length: bytes.length });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic !== BLOOM_MAGIC) return err({ kind: 'bad-magic' });
  const version = view.getUint16(4, true);
  if (version !== BLOOM_VERSION) return err({ kind: 'unsupported-version', version });
  const h1 = view.getUint8(6);
  const h2 = view.getUint8(7);
  if (h1 !== HASH_FNV1A_32 || h2 !== HASH_MURMUR3_32) return err({ kind: 'unknown-hash', h1, h2 });
  const normalisation = view.getUint8(8);
  const k = view.getUint16(10, true);
  const seed = view.getUint32(12, true);
  const mBig = view.getBigUint64(16, true);
  const nBig = view.getBigUint64(24, true);
  const p = view.getFloat64(32, true);
  const payload = view.getUint32(40, true);
  const checksum = view.getUint32(44, true);
  if (mBig > BigInt(Number.MAX_SAFE_INTEGER) || nBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    return err({ kind: 'bad-parameters', detail: 'm or n exceeds 2^53' });
  }
  const m = Number(mBig);
  const n = Number(nBig);
  if (m === 0 || m % 8 !== 0 || k === 0 || (normalisation & ~(NORM_NFC | NORM_FOLD)) !== 0 || !(p > 0 && p < 1)) {
    return err({ kind: 'bad-parameters', detail: `m=${m} k=${k} normalisation=${normalisation} p=${p}` });
  }
  if (payload !== m / 8) return err({ kind: 'length-mismatch', expected: m / 8, actual: payload });
  if (bytes.length !== BLOOM_HEADER_BYTES + payload) {
    return err({ kind: 'length-mismatch', expected: BLOOM_HEADER_BYTES + payload, actual: bytes.length });
  }
  const bits = bytes.slice(BLOOM_HEADER_BYTES);
  const actual = crc32(bits);
  if (actual !== checksum) return err({ kind: 'checksum', expected: checksum, actual });
  return ok({ header: { version, h1, h2, normalisation, k, seed, m, n, p }, bits });
};
