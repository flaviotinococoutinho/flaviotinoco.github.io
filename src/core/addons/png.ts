/**
 * A small, lossless PNG encoder for the Open Graph cards (pure; the zlib
 * compressor is injected by the shell).
 *
 * Why: resvg writes 8-bit RGBA, but a card is flat paper, a few ink colours and
 * their anti-aliasing ramps — fewer than a hundred distinct colours in practice.
 * PNG's indexed colour (colour type 3, one byte per pixel and a PLTE chunk) stores
 * exactly the same pixels in a third to a half of the bytes, which keeps every
 * card under its 60 KiB budget without losing a single pixel.
 *
 * Format: W3C PNG Specification (Third Edition), §5 datastream (signature,
 * IHDR, PLTE, IDAT, IEND, each chunk = length · type · data · CRC-32 of type+data),
 * §11.2 critical chunks, §7.3 filtering, §12.8 filter selection: "filter type 0
 * for indexed-colour images" and, for truecolour, the per-row heuristic that
 * minimises the sum of absolute differences. Images with more than 256 colours,
 * or with any transparency, fall back to RGBA with adaptive filtering.
 * The palette is ordered by first appearance in raster order, so the output is a
 * function of the pixels alone (deterministic).
 */

export type Deflate = (data: Uint8Array) => Uint8Array;

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/** CRC-32 (ISO 3309 / ITU-T V.42 polynomial 0xEDB88320), as PNG §5.5 specifies. */
const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (n: number): Uint8Array => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = Uint8Array.from(type, (c) => c.charCodeAt(0));
  return concat([u32(data.length), typeBytes, data, u32(crc32(concat([typeBytes, data])))]);
};

const ihdr = (width: number, height: number, colourType: 2 | 3 | 6): Uint8Array =>
  chunk('IHDR', concat([u32(width), u32(height), Uint8Array.of(8, colourType, 0, 0, 0)]));

/** Palette (≤ 256 opaque colours) and the index of every pixel, or null when the image does not qualify. */
export const indexColours = (
  rgba: Uint8Array,
): { readonly palette: Uint8Array; readonly indices: Uint8Array } | null => {
  const lookup = new Map<number, number>();
  const palette: number[] = [];
  const indices = new Uint8Array(rgba.length / 4);
  for (let p = 0, i = 0; i < rgba.length; i += 4, p++) {
    if (rgba[i + 3] !== 255) return null;
    const key = ((rgba[i] ?? 0) << 16) | ((rgba[i + 1] ?? 0) << 8) | (rgba[i + 2] ?? 0);
    let index = lookup.get(key);
    if (index === undefined) {
      if (lookup.size === 256) return null;
      index = lookup.size;
      lookup.set(key, index);
      palette.push(key >> 16, (key >> 8) & 255, key & 255);
    }
    indices[p] = index;
  }
  return { palette: Uint8Array.from(palette), indices };
};

/** Paeth predictor (PNG §7.3, filter type 4). */
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Scanlines with the adaptive filter of §12.8 (minimum sum of absolute differences per row). */
const adaptiveFilter = (pixels: Uint8Array, width: number, height: number, bpp: number): Uint8Array => {
  const stride = width * bpp;
  const out = new Uint8Array((stride + 1) * height);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let best = 0;
    let bestSum = Number.POSITIVE_INFINITY;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const at = y * stride + x;
        const v = pixels[at] ?? 0;
        const a = x >= bpp ? (pixels[at - bpp] ?? 0) : 0;
        const b = y > 0 ? (pixels[at - stride] ?? 0) : 0;
        const c = x >= bpp && y > 0 ? (pixels[at - stride - bpp] ?? 0) : 0;
        const predicted = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0;
        const r = (v - predicted) & 255;
        sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const v = pixels[at] ?? 0;
      const a = x >= bpp ? (pixels[at - bpp] ?? 0) : 0;
      const b = y > 0 ? (pixels[at - stride] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (pixels[at - stride - bpp] ?? 0) : 0;
      const predicted = best === 1 ? a : best === 2 ? b : best === 3 ? (a + b) >> 1 : best === 4 ? paeth(a, b, c) : 0;
      row[x] = (v - predicted) & 255;
    }
    out[y * (stride + 1)] = best;
    out.set(row, y * (stride + 1) + 1);
  }
  return out;
};

/** Scanlines with filter type 0 (none), the recommendation for indexed colour. */
const unfiltered = (indices: Uint8Array, width: number, height: number): Uint8Array => {
  const out = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) out.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return out;
};

/** Encodes 8-bit RGBA pixels (row-major, width × height × 4 bytes) as a PNG datastream. */
export const encodePng = (rgba: Uint8Array, width: number, height: number, deflate: Deflate): Uint8Array => {
  const indexed = indexColours(rgba);
  const body =
    indexed === null
      ? [ihdr(width, height, 6), chunk('IDAT', deflate(adaptiveFilter(rgba, width, height, 4)))]
      : [
          ihdr(width, height, 3),
          chunk('PLTE', indexed.palette),
          chunk('IDAT', deflate(unfiltered(indexed.indices, width, height))),
        ];
  return concat([SIGNATURE, ...body, chunk('IEND', new Uint8Array(0))]);
};
