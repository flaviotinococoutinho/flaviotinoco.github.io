/** Runtime: instantiation, ABI checks, URL loading and caching, arena scoping and memory growth. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ABI_VERSION,
  type CoreExports,
  check,
  instantiateFromBytes,
  instantiateFromUrl,
  KernelError,
  Status,
  withArena,
} from '../../../src/lib/wasm/runtime.ts';
import { instantiate, moduleBytes } from './helpers.ts';

/** A minimal valid module that exports `abi_version() = 2` (hand-assembled bytes). */
const WRONG_ABI = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, // type: () -> i32
  0x03, 0x02, 0x01, 0x00, // func 0: type 0
  0x05, 0x03, 0x01, 0x00, 0x01, // memory: min 1
  0x07, 0x18, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, // export "memory"
  0x0b, 0x61, 0x62, 0x69, 0x5f, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x00, 0x00, // export "abi_version"
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x02, 0x0b, // code: i32.const 2
]);

describe('instantiation', () => {
  it('instantiates a kernel from bytes and checks the ABI version', async () => {
    const k = await instantiateFromBytes(moduleBytes('signal'));
    expect(k.abi_version()).toBe(ABI_VERSION);
    expect(k.memory).toBeInstanceOf(WebAssembly.Memory);
  });

  it('rejects modules with another ABI version', async () => {
    await expect(instantiateFromBytes(WRONG_ABI)).rejects.toThrow(/ABI mismatch/);
  });

  it('rejects modules that are not kernels', async () => {
    const empty = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    await expect(instantiateFromBytes(empty)).rejects.toThrow(/not a kernel module/);
  });
});

describe('instantiateFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (type: string) => {
    const bytes = moduleBytes('information');
    return vi.fn(() =>
      Promise.resolve(new Response(bytes, { status: 200, headers: { 'Content-Type': type } })),
    );
  };

  it('streams when the server sends application/wasm', async () => {
    const fetchMock = respond('application/wasm');
    vi.stubGlobal('fetch', fetchMock);
    const streaming = vi.spyOn(WebAssembly, 'instantiateStreaming');
    const k = await instantiateFromUrl('https://example.test/streaming.wasm');
    expect(k.abi_version()).toBe(1);
    expect(streaming).toHaveBeenCalledOnce();
    streaming.mockRestore();
  });

  it('falls back to arrayBuffer() when the MIME type is wrong', async () => {
    const fetchMock = respond('application/octet-stream');
    vi.stubGlobal('fetch', fetchMock);
    const streaming = vi.spyOn(WebAssembly, 'instantiateStreaming');
    const k = await instantiateFromUrl('https://example.test/octet.wasm');
    expect(k.abi_version()).toBe(1);
    expect(streaming).not.toHaveBeenCalled();
    streaming.mockRestore();
  });

  it('caches per URL: one fetch, one instance', async () => {
    const fetchMock = respond('application/wasm');
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([
      instantiateFromUrl('https://example.test/cached.wasm'),
      instantiateFromUrl('https://example.test/cached.wasm'),
    ]);
    expect(a).toBe(b);
    expect(await instantiateFromUrl('https://example.test/cached.wasm')).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('evicts failed loads so a later call can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('missing', { status: 404 }))),
    );
    await expect(instantiateFromUrl('https://example.test/retry.wasm')).rejects.toThrow(/HTTP 404/);
    vi.stubGlobal('fetch', respond('application/wasm'));
    const k = await instantiateFromUrl('https://example.test/retry.wasm');
    expect(k.abi_version()).toBe(1);
  });
});

describe('withArena', () => {
  it('copies in and out and resets the arena afterwards', async () => {
    const k = await instantiate<CoreExports>('signal');
    const out = withArena(k, (arena) => {
      const buf = arena.from('f64', [1, 2, 3]);
      expect(buf.ptr % 8).toBe(0);
      expect(k.arena_used()).toBeGreaterThanOrEqual(24);
      return buf.read();
    });
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(k.arena_used()).toBe(0);
  });

  it('resets only when the outermost scope ends', async () => {
    const k = await instantiate<CoreExports>('signal');
    withArena(k, (outer) => {
      const a = outer.from('u32', [7, 8]);
      withArena(k, (inner) => {
        inner.alloc('f64', 100);
      });
      expect(Array.from(a.read())).toEqual([7, 8]);
      expect(k.arena_used()).toBeGreaterThan(800);
    });
    expect(k.arena_used()).toBe(0);
  });

  it('resets even when the callback throws', async () => {
    const k = await instantiate<CoreExports>('signal');
    expect(() =>
      withArena(k, (arena) => {
        arena.alloc('u8', 10);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(k.arena_used()).toBe(0);
  });

  it('refuses buffers used after their scope', async () => {
    const k = await instantiate<CoreExports>('signal');
    const leaked = withArena(k, (arena) => arena.alloc('f64', 4));
    expect(() => leaked.view()).toThrow(/after its withArena scope/);
  });

  it('refuses asynchronous callbacks', async () => {
    const k = await instantiate<CoreExports>('signal');
    expect(() => withArena(k, () => Promise.resolve(1))).toThrow(/synchronous/);
  });

  it('builds fresh views after memory grows (no stale views)', async () => {
    const k = await instantiate<CoreExports>('signal');
    withArena(k, (arena) => {
      const small = arena.from('f64', [42]);
      const stale = small.view();
      arena.alloc('u8', 4 << 20); // forces memory.grow → detaches old buffers
      expect(stale.length).toBe(0);
      expect(Array.from(small.view())).toEqual([42]);
    });
  });

  it('rejects writes longer than the buffer and invalid lengths', async () => {
    const k = await instantiate<CoreExports>('signal');
    withArena(k, (arena) => {
      expect(() => arena.alloc('f64', 2).write([1, 2, 3])).toThrow(RangeError);
      expect(() => arena.alloc('f64', -1)).toThrow(RangeError);
      expect(() => arena.alloc('f64', 0x2000_0000)).toThrow(KernelError);
    });
  });
});

describe('status codes', () => {
  it('check() passes counts through and throws KernelError on negative codes', () => {
    expect(check('f', 0)).toBe(0);
    expect(check('f', 17)).toBe(17);
    const error = (() => {
      try {
        check('fft', Status.NOT_POWER_OF_TWO);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(KernelError);
    expect(error).toMatchObject({ code: -2, fn: 'fft' });
    expect(String(error)).toMatch(/not a power of two/);
  });
});
