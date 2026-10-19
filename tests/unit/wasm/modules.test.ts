/**
 * Module-level contract of the built kernels (ABI v1): zero imports, exactly the documented exports,
 * manifest integrity, and robustness — no export may trap on hostile arguments.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type CoreExports } from '../../../src/adapters/wasm/runtime.ts';
import { instantiate, type ModuleName, moduleBytes, mulberry32 } from './helpers.ts';

const ABI = ['abi_version', 'arena_alloc', 'arena_reset', 'arena_used'];

const EXPORTS: Readonly<Record<ModuleName, readonly string[]>> = {
  signal: [
    'fft',
    'ifft',
    'magnitude',
    'power_db',
    'window',
    'multiply',
    'fourier_series',
    'synth',
    'sample_sinusoid',
    'reconstruct_sinc',
    'alias_frequency',
    'spectral_entropy',
  ],
  information: [
    'histogram_u8',
    'entropy_counts',
    'entropy_bytes',
    'conditional_entropy_bytes',
    'huffman_lengths',
    'kl_divergence',
    'js_divergence',
    'binary_entropy',
    'bsc_capacity',
    'bec_capacity',
    'mutual_information',
    'intrinsic_ic',
    'lin_similarity',
  ],
  dynamics: [
    'logistic_orbit',
    'logistic_lyapunov',
    'logistic_bifurcation',
    'lyapunov_curve',
    'lorenz',
    'clt_histogram',
    'noise3',
    'flow_init',
    'flow_step',
    'flow_segments_ptr',
    'flow_count',
  ],
};

const NAMES = Object.keys(EXPORTS) as ModuleName[];

describe.each(NAMES)('%s.wasm', (name) => {
  const module = new WebAssembly.Module(moduleBytes(name));

  it('has zero imports', () => {
    expect(WebAssembly.Module.imports(module)).toHaveLength(0);
  });

  it('exports exactly memory, the ABI functions and its documented kernels', () => {
    const exports = WebAssembly.Module.exports(module);
    expect(exports.map((e) => e.name).sort()).toEqual(['memory', ...ABI, ...(EXPORTS[name] ?? [])].sort());
    for (const e of exports) expect(e.kind).toBe(e.name === 'memory' ? 'memory' : 'function');
  });

  it('carries no custom sections (names, producers, …)', () => {
    expect(WebAssembly.Module.customSections(module, 'name')).toHaveLength(0);
    expect(WebAssembly.Module.customSections(module, 'producers')).toHaveLength(0);
    expect(WebAssembly.Module.customSections(module, 'target_features')).toHaveLength(0);
  });

  it('implements ABI v1 and a working bump arena', async () => {
    const k = await instantiate<CoreExports>(name);
    expect(k.abi_version()).toBe(1);
    expect(k.arena_used()).toBe(0);
    const a = k.arena_alloc(3, 1) >>> 0;
    const b = k.arena_alloc(16, 16) >>> 0;
    expect(a).toBeGreaterThan(0);
    expect(b % 16).toBe(0);
    expect(b).toBeGreaterThanOrEqual(a + 3);
    expect(k.arena_alloc(8, 0)).toBe(0);
    expect(k.arena_alloc(8, 12)).toBe(0);
    expect(k.arena_alloc(0xffff_ffff, 8)).toBe(0);
    // Growing memory: a 1 MiB block forces memory.grow; the old buffer detaches.
    const before = k.memory.buffer;
    const big = k.arena_alloc(1 << 20, 8) >>> 0;
    expect(big).toBeGreaterThan(0);
    expect(k.memory.buffer.byteLength).toBeGreaterThanOrEqual(big + (1 << 20));
    expect(before.byteLength).toBe(0); // detached
    k.arena_reset();
    expect(k.arena_used()).toBe(0);
    expect(k.arena_alloc(8, 8) >>> 0).toBe(a + ((8 - (a % 8)) % 8));
  });

  it('never traps on hostile arguments', async () => {
    const k = await instantiate<CoreExports & Record<string, unknown>>(name);
    const random = mulberry32(0xbad5eed);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;
    const hostileInts = [0, 1, 2, 3, 7, 8, 12, 64, 1024, 65_535, 65_536, 0x7fff_ffff, 0x8000_0000, 0xffff_ffff];
    const floats = [0, -0, 1, -1, 0.5, 4, 1e-320, 1e308, -1e308, Infinity, -Infinity, NaN];
    const call = (fnName: string, args: number[]): void => {
      const fn = k[fnName] as (...a: number[]) => unknown;
      expect(fn.length, fnName).toBe(args.length);
      expect(() => fn(...args), `${fnName}(${args.join(', ')})`).not.toThrow();
    };

    // Phase 1 — empty arena: every pointer is invalid, lengths and counts are arbitrary u32s.
    for (const [fnName, roles] of Object.entries(ROLES[name])) {
      // Pointer-free iteration counts are unbounded by design (they would only take long).
      const iterations = fnName === 'logistic_lyapunov' ? 0 : fnName === 'flow_step' ? 40 : 300;
      for (let trial = 0; trial < iterations; trial++) {
        call(
          fnName,
          [...roles].map((role) => (role === 'f' ? pick(floats) : random() < 0.8 ? pick(hostileInts) : pick(floats))),
        );
      }
    }
    if (name === 'dynamics') {
      for (const r of floats) for (const x of floats) call('logistic_lyapunov', [r, x, 3, 3]);
    }

    // Phase 2 — valid buffers full of random bytes (NaN/Inf patterns, misaligned offsets).
    k.arena_reset();
    const bytes = 1 << 16;
    const base = k.arena_alloc(bytes, 16) >>> 0;
    const view = new Uint8Array(k.memory.buffer, base, bytes);
    for (let i = 0; i < bytes; i++) view[i] = Math.floor(random() * 256);
    const ptrs = [base, base + 4, base + 8, base + 1024, base + 4096, base + 32_768, base + bytes - 8, base + 3];
    const small = [0, 1, 2, 3, 4, 8, 16, 64];
    for (const [fnName, roles] of Object.entries(ROLES[name])) {
      if (fnName.startsWith('flow')) continue;
      for (let trial = 0; trial < 200; trial++) {
        call(
          fnName,
          [...roles].map((role) => {
            if (role === 'p') return random() < 0.9 ? pick(ptrs) : pick(hostileInts);
            if (role === 'f') return random() < 0.6 ? pick(floats) : pick(small);
            return pick(small); // lengths, counts and kinds stay small: they size real work
          }),
        );
      }
    }
    expect(k.abi_version()).toBe(1);
  });
});

/**
 * Parameter roles per export: `p` pointer, `n` length/count/kind (u32), `f` float. Also checks that
 * every export has the documented arity.
 */
const ROLES: Readonly<Record<ModuleName, Readonly<Record<string, string>>>> = {
  signal: {
    fft: 'ppn',
    ifft: 'ppn',
    magnitude: 'pppn',
    power_db: 'pppnf',
    window: 'npn',
    multiply: 'pppn',
    fourier_series: 'nnnpnf',
    synth: 'pppnfpn',
    sample_sinusoid: 'ffffppn',
    reconstruct_sinc: 'pnffpnf',
    alias_frequency: 'ff',
    spectral_entropy: 'pn',
  },
  information: {
    histogram_u8: 'pnp',
    entropy_counts: 'pn',
    entropy_bytes: 'pn',
    conditional_entropy_bytes: 'pn',
    huffman_lengths: 'pnp',
    kl_divergence: 'ppn',
    js_divergence: 'ppn',
    binary_entropy: 'f',
    bsc_capacity: 'f',
    bec_capacity: 'f',
    mutual_information: 'pnn',
    intrinsic_ic: 'pnnp',
    lin_similarity: 'fff',
  },
  dynamics: {
    logistic_orbit: 'ffnp',
    logistic_lyapunov: 'ffnn',
    logistic_bifurcation: 'ffnnnnp',
    lyapunov_curve: 'ffnnnp',
    lorenz: 'ffffnfffp',
    clt_histogram: 'nnnnnp',
    noise3: 'fffn',
    flow_init: 'nnff',
    flow_step: 'ffff',
    flow_segments_ptr: '',
    flow_count: '',
  },
};

describe('src/wasm/manifest.json', () => {
  const path = fileURLToPath(new URL('../../../src/wasm/manifest.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as readonly {
    name: string;
    bytes: number;
    gzipBytes: number;
    sha256: string;
  }[];

  it('describes every built module exactly ({ name, bytes, gzipBytes, sha256 })', () => {
    expect(manifest.map((m) => m.name).sort()).toEqual([...NAMES].sort());
    for (const entry of manifest) {
      expect(Object.keys(entry).sort()).toEqual(['bytes', 'gzipBytes', 'name', 'sha256']);
      const bytes = moduleBytes(entry.name as ModuleName);
      expect(entry.bytes).toBe(bytes.length);
      expect(entry.gzipBytes).toBe(gzipSync(bytes).length);
      expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('keeps every module within the hard size budget (48 KiB raw)', () => {
    for (const entry of manifest) expect(entry.bytes).toBeLessThanOrEqual(48 * 1024);
  });
});
