/**
 * Test helpers for the WebAssembly kernels: load the BUILT modules from src/wasm/ (run
 * `node scripts/build-wasm.mjs` first) and a deterministic PRNG for reproducible fixtures.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type CoreExports, instantiateFromBytes } from '../../../src/adapters/wasm/runtime.ts';

export type ModuleName = 'signal' | 'information' | 'dynamics';

/** Absolute path of a built module. */
export function modulePath(name: ModuleName): string {
  return fileURLToPath(new URL(`../../../src/wasm/${name}.wasm`, import.meta.url));
}

/** Bytes of a built module (fails with a hint when the build has not run). */
export function moduleBytes(name: ModuleName): Uint8Array<ArrayBuffer> {
  const path = modulePath(name);
  if (!existsSync(path)) throw new Error(`${path} is missing: run \`node scripts/build-wasm.mjs\` first`);
  const file = readFileSync(path);
  // Copy into a fresh ArrayBuffer (Node may pool small Buffers).
  return new Uint8Array(file);
}

/** A fresh, independent instance of a built module. */
export function instantiate<E extends CoreExports>(name: ModuleName): Promise<E> {
  return instantiateFromBytes<E>(moduleBytes(name));
}

/** Mulberry32: tiny deterministic PRNG for fixtures (uniform in [0, 1)). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `xs[i]`, failing loudly instead of yielding `undefined` (noUncheckedIndexedAccess). */
export function at(xs: ArrayLike<number>, i: number): number {
  const v = xs[i];
  if (v === undefined) throw new RangeError(`index ${i} out of bounds (length ${xs.length})`);
  return v;
}

/** Largest absolute elementwise difference. */
export function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new RangeError(`length mismatch ${a.length} vs ${b.length}`);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(at(a, i) - at(b, i)));
  return m;
}

/** Sum of an array. */
export function sum(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += at(xs, i);
  return s;
}
