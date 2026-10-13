/**
 * Runtime for the WebAssembly kernels (ABI version 1, docs/adr/0003-wasm-kernels.md).
 *
 * - {@link instantiateFromBytes} / {@link instantiateFromUrl} load a kernel module (zero imports) and
 *   check `abi_version() === 1`. URL loads are cached per URL, so a page fetches each module once.
 * - {@link withArena} scopes arena allocations: buffers are copied in, the kernel runs, results are
 *   copied out, and the arena is reset when the outermost scope ends.
 * - Linear memory may grow during any kernel call, which detaches every `ArrayBuffer` view of it.
 *   {@link ArenaBuffer} therefore never caches a view: {@link ArenaBuffer.view} builds a fresh one on
 *   each call (valid until the next kernel call), and {@link ArenaBuffer.read} returns a detached copy.
 *
 * Runs unchanged in browsers (Vite) and in Node ≥ 22 (tests).
 */

/** Version of the binary interface this runtime speaks. */
export const ABI_VERSION = 1;

/** Status codes returned by fallible kernel functions (`i32`). */
export const Status = {
  OK: 0,
  INVALID_LENGTH: -1,
  NOT_POWER_OF_TWO: -2,
  OUT_OF_MEMORY: -3,
  INVALID_PARAMETER: -4,
} as const;

/** One of the {@link Status} codes. */
export type StatusCode = (typeof Status)[keyof typeof Status];

const STATUS_NAMES: Readonly<Record<number, string>> = {
  [Status.INVALID_LENGTH]: 'invalid length',
  [Status.NOT_POWER_OF_TWO]: 'length is not a power of two',
  [Status.OUT_OF_MEMORY]: 'out of memory',
  [Status.INVALID_PARAMETER]: 'invalid parameter',
};

/** A kernel function reported a negative status code. */
export class KernelError extends Error {
  /** The status code (see {@link Status}). */
  readonly code: number;
  /** The kernel export that failed. */
  readonly fn: string;

  constructor(fn: string, code: number) {
    super(`${fn}: ${STATUS_NAMES[code] ?? 'unknown error'} (status ${code})`);
    this.name = 'KernelError';
    this.code = code;
    this.fn = fn;
  }
}

/** Throws a {@link KernelError} when `code` is negative; returns it otherwise (counts are `≥ 0`). */
export function check(fn: string, code: number): number {
  if (code < 0) throw new KernelError(fn, code);
  return code;
}

/** Exports shared by every kernel module (ABI v1). Pointers and sizes are `u32` byte offsets. */
export interface CoreExports {
  /** The module's linear memory (its `buffer` is replaced whenever memory grows). */
  readonly memory: WebAssembly.Memory;
  /** ABI version implemented by the module (`1`). */
  readonly abi_version: () => number;
  /** Bump-allocates `bytes` bytes aligned to `align` (a power of two); returns the offset or `0`. */
  readonly arena_alloc: (bytes: number, align: number) => number;
  /** Frees every transient arena allocation. */
  readonly arena_reset: () => void;
  /** Bytes currently allocated in the arena. */
  readonly arena_used: () => number;
}

function asKernel<E extends CoreExports>(instance: WebAssembly.Instance): E {
  const exports = instance.exports as unknown as E;
  if (!(exports.memory instanceof WebAssembly.Memory) || typeof exports.abi_version !== 'function') {
    throw new TypeError('not a kernel module: missing memory or abi_version export');
  }
  const version = exports.abi_version() >>> 0;
  if (version !== ABI_VERSION) {
    throw new Error(`kernel ABI mismatch: module implements v${version}, runtime expects v${ABI_VERSION}`);
  }
  return exports;
}

/**
 * Compiles and instantiates a kernel module from its bytes (no imports are provided: kernels have
 * none) and checks its ABI version.
 */
export async function instantiateFromBytes<E extends CoreExports = CoreExports>(bytes: BufferSource): Promise<E> {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return asKernel<E>(instance);
}

async function fetchAndInstantiate(url: string): Promise<CoreExports> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: HTTP ${response.status}`);
  const type = response.headers.get('Content-Type') ?? '';
  // Streaming compilation requires the application/wasm MIME type; otherwise buffer the body.
  if (typeof WebAssembly.instantiateStreaming === 'function' && /^application\/wasm\b/i.test(type)) {
    const { instance } = await WebAssembly.instantiateStreaming(response, {});
    return asKernel(instance);
  }
  return instantiateFromBytes(await response.arrayBuffer());
}

const instances = new Map<string, Promise<CoreExports>>();

/**
 * Fetches, compiles and instantiates the kernel at `url` (streaming when the server sends
 * `application/wasm`, buffered otherwise). Results are cached per URL; a failed load is evicted so
 * that a later call can retry.
 */
export function instantiateFromUrl<E extends CoreExports = CoreExports>(url: string): Promise<E> {
  let pending = instances.get(url);
  if (pending === undefined) {
    pending = fetchAndInstantiate(url);
    instances.set(url, pending);
    pending.catch(() => instances.delete(url));
  }
  // The URL identifies the module, so every caller of a URL asks for the same export shape.
  return pending as Promise<E>;
}

/** Element types that can live in the arena. */
export type ElementType = 'u8' | 'u32' | 'f32' | 'f64';

/** Typed-array class for each {@link ElementType}. */
export interface TypedArrayOf {
  u8: Uint8Array;
  u32: Uint32Array;
  f32: Float32Array;
  f64: Float64Array;
}

const ELEMENT_BYTES: Readonly<Record<ElementType, number>> = { u8: 1, u32: 4, f32: 4, f64: 8 };

function makeView<K extends ElementType>(memory: WebAssembly.Memory, type: K, ptr: number, length: number) {
  const buffer = memory.buffer;
  const views = {
    u8: () => new Uint8Array(buffer, ptr, length),
    u32: () => new Uint32Array(buffer, ptr, length),
    f32: () => new Float32Array(buffer, ptr, length),
    f64: () => new Float64Array(buffer, ptr, length),
  } satisfies { [T in ElementType]: () => TypedArrayOf[T] };
  return views[type]() as TypedArrayOf[K];
}

/** A typed region of the arena. Valid only inside the {@link withArena} scope that created it. */
export class ArenaBuffer<K extends ElementType> {
  /** Byte offset in linear memory (pass this to kernel functions). */
  readonly ptr: number;
  /** Number of elements. */
  readonly length: number;
  /** Element type. */
  readonly type: K;
  readonly #arena: Arena;

  constructor(arena: Arena, type: K, ptr: number, length: number) {
    this.#arena = arena;
    this.type = type;
    this.ptr = ptr;
    this.length = length;
  }

  /**
   * A fresh view over the current `memory.buffer`. It is invalidated (detached) by the next kernel
   * call that grows memory, so never keep it across calls: call `view()` again.
   */
  view(): TypedArrayOf[K] {
    return makeView(this.#arena.memory(), this.type, this.ptr, this.length);
  }

  /** A copy of the contents, independent of linear memory. */
  read(): TypedArrayOf[K] {
    return this.view().slice() as TypedArrayOf[K];
  }

  /** Copies `data` (at most `length` elements) into the buffer, starting at element 0. */
  write(data: ArrayLike<number>): this {
    if (data.length > this.length) throw new RangeError(`cannot write ${data.length} elements into ${this.length}`);
    this.view().set(data);
    return this;
  }
}

/** Allocation interface handed to {@link withArena} callbacks. */
export class Arena {
  readonly #kernel: CoreExports;
  #open = true;

  constructor(kernel: CoreExports) {
    this.#kernel = kernel;
  }

  /** The kernel's memory, after checking that the scope is still open. */
  memory(): WebAssembly.Memory {
    if (!this.#open) throw new Error('arena buffer used after its withArena scope ended');
    return this.#kernel.memory;
  }

  /** Allocates `length` uninitialised elements of `type` (naturally aligned). */
  alloc<K extends ElementType>(type: K, length: number): ArenaBuffer<K> {
    this.memory();
    if (!Number.isSafeInteger(length) || length < 0) throw new RangeError(`invalid length ${length}`);
    const size = ELEMENT_BYTES[type];
    const bytes = length * size;
    if (bytes > 0xffff_ffff) throw new KernelError('arena_alloc', Status.OUT_OF_MEMORY);
    const ptr = this.#kernel.arena_alloc(bytes, size) >>> 0;
    if (ptr === 0) throw new KernelError('arena_alloc', Status.OUT_OF_MEMORY);
    return new ArenaBuffer(this, type, ptr, length);
  }

  /** Allocates a buffer of `type` holding a copy of `data`. */
  from<K extends ElementType>(type: K, data: ArrayLike<number>): ArenaBuffer<K> {
    return this.alloc(type, data.length).write(data);
  }

  /** Marks the arena closed; buffers then refuse access. */
  close(): void {
    this.#open = false;
  }
}

const depth = new WeakMap<CoreExports, number>();

/**
 * Runs `fn` with an {@link Arena} on `kernel` and resets the kernel's arena when the outermost scope
 * ends (nested scopes share it). `fn` must be synchronous: copy results out (e.g. with
 * {@link ArenaBuffer.read}) before returning, because every buffer is invalid afterwards.
 */
export function withArena<E extends CoreExports, R>(kernel: E, fn: (arena: Arena) => R): R {
  const level = depth.get(kernel) ?? 0;
  const arena = new Arena(kernel);
  depth.set(kernel, level + 1);
  try {
    const result = fn(arena);
    if (result instanceof Promise) throw new TypeError('withArena callbacks must be synchronous');
    return result;
  } finally {
    arena.close();
    depth.set(kernel, level);
    if (level === 0) kernel.arena_reset();
  }
}

/** Throws a `RangeError` unless `x` is a finite number. */
export function assertFinite(name: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be a finite number, got ${x}`);
}

/** Throws a `RangeError` unless `n` is an integer in `[min, 2^32 − 1]`. */
export function assertU32(name: string, n: number, min = 0): void {
  if (!Number.isInteger(n) || n < min || n > 0xffff_ffff) {
    throw new RangeError(`${name} must be an integer in [${min}, 4294967295], got ${n}`);
  }
}

/** Throws a `RangeError` unless every element is an integer in `[0, 2^32 − 1]`. */
export function assertU32Array(name: string, values: ArrayLike<number>): void {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === undefined || !Number.isInteger(v) || v < 0 || v > 0xffff_ffff) {
      throw new RangeError(`${name}[${i}] must be an integer in [0, 4294967295], got ${v}`);
    }
  }
}
