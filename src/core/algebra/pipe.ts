/**
 * Left-to-right function composition. `pipe(x, f, g)` = `g(f(x))`.
 * Overloads keep each intermediate type inferred.
 */
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): F;
export function pipe(a: unknown, ...fns: ReadonlyArray<(x: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), a);
}

/** Point-free composition: `flow(f, g)(x)` = `g(f(x))`. Endomorphisms only, to stay simple. */
export const flow =
  <T>(...fns: ReadonlyArray<(t: T) => T>) =>
  (t: T): T =>
    fns.reduce((acc, fn) => fn(acc), t);
