/**
 * Result — a total, exception-free representation of fallible computations.
 *
 * Pattern: sum type (tagged union) + functor/monad operations. The functional
 * core never throws; failure is a value that the imperative shell decides how
 * to report. Cf. "Parse, don't validate" (A. King, 2019) and Railway-Oriented
 * Programming (S. Wlaschin, 2014).
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Functor map: transforms the success channel. */
export const map = <T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> => (r.ok ? ok(f(r.value)) : r);

/** Transforms the error channel. */
export const mapErr = <T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F> => (r.ok ? r : err(f(r.error)));

/** Monadic bind (Kleisli composition step). */
export const flatMap = <T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> => (r.ok ? f(r.value) : r);

/** Eliminator (catamorphism) for Result. */
export const fold = <T, E, R>(r: Result<T, E>, onOk: (t: T) => R, onErr: (e: E) => R): R =>
  r.ok ? onOk(r.value) : onErr(r.error);

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);

/**
 * Traverses a list of results, accumulating ALL errors (applicative validation)
 * rather than stopping at the first — so a content author sees every problem at once.
 */
export const collect = <T, E>(rs: readonly Result<T, E>[]): Result<readonly T[], readonly E[]> => {
  const values: T[] = [];
  const errors: E[] = [];
  for (const r of rs) {
    if (r.ok) values.push(r.value);
    else errors.push(r.error);
  }
  return errors.length === 0 ? ok(values) : err(errors);
};

/** Lifts a predicate into a parser. */
export const fromPredicate =
  <T, E>(predicate: (t: T) => boolean, onFalse: (t: T) => E) =>
  (t: T): Result<T, E> =>
    predicate(t) ? ok(t) : err(onFalse(t));
