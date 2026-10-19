/**
 * The PNG encoder of the share cards is lossless: decoding its output (zlib
 * inflate + the PNG filters, PNG §7.3/§9) gives back exactly the input pixels,
 * in indexed colour when ≤ 256 opaque colours, in RGBA otherwise. Every chunk
 * carries a correct CRC-32.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { crc32, encodePng, indexColours } from '../../../src/core/addons/png.ts';

const deflate = (d: Uint8Array): Uint8Array => deflateSync(d, { level: 9 });

type Chunk = { readonly type: string; readonly data: Uint8Array; readonly crcOk: boolean };

const chunks = (png: Uint8Array): Chunk[] => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const typeAndData = png.subarray(at + 4, at + 8 + length);
    const type = String.fromCharCode(...typeAndData.subarray(0, 4));
    out.push({ type, data: typeAndData.subarray(4), crcOk: crc32(typeAndData) === view.getUint32(at + 8 + length) });
    at += 12 + length;
  }
  return out;
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Reference decoder (8-bit, colour types 3 and 6, no interlace) → RGBA. */
const decode = (png: Uint8Array): { width: number; height: number; rgba: Uint8Array } => {
  const cs = chunks(png);
  for (const c of cs) expect(c.crcOk, c.type).toBe(true);
  const header = cs[0];
  if (header?.type !== 'IHDR') throw new Error('no IHDR');
  const hv = new DataView(header.data.buffer, header.data.byteOffset, 13);
  const width = hv.getUint32(0);
  const height = hv.getUint32(4);
  const colourType = header.data[9];
  const bpp = colourType === 3 ? 1 : 4;
  const raw = inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = width * bpp;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= bpp ? (pixels[y * stride + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (pixels[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (pixels[(y - 1) * stride + x - bpp] ?? 0) : 0;
      const p = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter] ?? 0;
      pixels[y * stride + x] = (v + p) & 255;
    }
  }
  if (colourType === 6) return { width, height, rgba: pixels };
  const palette = cs.find((c) => c.type === 'PLTE')?.data ?? new Uint8Array();
  const rgba = new Uint8Array(width * height * 4);
  pixels.forEach((index, i) =>
    rgba.set([palette[index * 3] ?? 0, palette[index * 3 + 1] ?? 0, palette[index * 3 + 2] ?? 0, 255], i * 4),
  );
  return { width, height, rgba };
};

const image = (opaque: boolean, colours: number) =>
  fc
    .record({ width: fc.integer({ min: 1, max: 12 }), height: fc.integer({ min: 1, max: 12 }) })
    .chain(({ width, height }) =>
      fc
        .array(fc.integer({ min: 0, max: colours - 1 }), { minLength: width * height, maxLength: width * height })
        .map((ix) => {
          const rgba = new Uint8Array(width * height * 4);
          ix.forEach((k, i) =>
            rgba.set([(k * 37) & 255, (k * 91) & 255, (k * 13) & 255, opaque ? 255 : (k * 7) & 255], i * 4),
          );
          return { width, height, rgba };
        }),
    );

describe('encodePng', () => {
  test.prop([image(true, 40)])('indexed colour: decode ∘ encode = id', ({ width, height, rgba }) => {
    const png = encodePng(rgba, width, height, deflate);
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
    expect(decode(png)).toEqual({ width, height, rgba });
  });

  test.prop([image(false, 300)])('RGBA fallback: decode ∘ encode = id', ({ width, height, rgba }) => {
    const png = encodePng(rgba, width, height, deflate);
    expect(decode(png)).toEqual({ width, height, rgba });
  });

  it('starts with the PNG signature and is deterministic', () => {
    const rgba = Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 255]);
    const a = encodePng(rgba, 2, 1, deflate);
    expect([...a.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(a).toEqual(encodePng(rgba, 2, 1, deflate));
  });

  it('builds the palette in order of first appearance and refuses more than 256 colours', () => {
    const r = indexColours(Uint8Array.from([9, 9, 9, 255, 1, 1, 1, 255, 9, 9, 9, 255]));
    expect(r && [...r.palette]).toEqual([9, 9, 9, 1, 1, 1]);
    expect(r && [...r.indices]).toEqual([0, 1, 0]);
    const many = new Uint8Array(257 * 4);
    for (let i = 0; i < 257; i++) many.set([i & 255, i >> 8, 0, 255], i * 4);
    expect(indexColours(many)).toBeNull();
    expect(indexColours(Uint8Array.from([0, 0, 0, 128]))).toBeNull();
  });

  it('computes the standard CRC-32 (check value of "123456789")', () => {
    expect(crc32(Uint8Array.from('123456789', (c) => c.charCodeAt(0)))).toBe(0xcbf43926);
  });
});
