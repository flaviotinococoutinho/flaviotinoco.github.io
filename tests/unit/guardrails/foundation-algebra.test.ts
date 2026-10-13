/**
 * Laws of the shared vocabulary (src/core/algebra). These back the coverage
 * gate of the functional core (vitest.config.ts) for the foundation modules,
 * which shipped without tests; they belong next to the modules they prove
 * (tests/unit/core/) once the core team adopts them.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  collect,
  err,
  flatMap,
  fold,
  fromPredicate,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrapOr,
  type Result,
} from '../../../src/core/algebra/result.ts';
import { flow, pipe } from '../../../src/core/algebra/pipe.ts';
import { absurd, select } from '../../../src/core/algebra/match.ts';
import { unsafeBrand } from '../../../src/core/algebra/brand.ts';

const resultArb: fc.Arbitrary<Result<number, string>> = fc.oneof(fc.integer().map(ok), fc.string().map(err));
const f = (n: number): number => n * 2 + 1;
const g = (n: number): number => n - 3;
const k1 = (n: number): Result<number, string> => (n % 2 === 0 ? ok(n / 2) : err(`odd ${n}`));
const k2 = (n: number): Result<number, string> => (n > 0 ? ok(n - 1) : err(`non-positive ${n}`));

describe('Result', () => {
  test.prop([resultArb])('functor identity: map(r, id) = r', (r) => {
    expect(map(r, (x) => x)).toEqual(r);
  });

  test.prop([resultArb])('functor composition: map(map(r, f), g) = map(r, g ∘ f)', (r) => {
    expect(map(map(r, f), g)).toEqual(map(r, (x) => g(f(x))));
  });

  test.prop([fc.integer()])('monad left identity: flatMap(ok(a), k) = k(a)', (a) => {
    expect(flatMap(ok(a), k1)).toEqual(k1(a));
  });

  test.prop([resultArb])('monad right identity: flatMap(r, ok) = r', (r) => {
    expect(flatMap(r, ok)).toEqual(r);
  });

  test.prop([resultArb])('monad associativity', (r) => {
    expect(flatMap(flatMap(r, k1), k2)).toEqual(flatMap(r, (x) => flatMap(k1(x), k2)));
  });

  test.prop([resultArb])('fold is the eliminator; predicates partition', (r) => {
    expect(fold(r, () => 'ok', () => 'err')).toBe(r.ok ? 'ok' : 'err');
    expect(isOk(r)).toBe(!isErr(r));
    expect(unwrapOr(r, 42)).toBe(r.ok ? r.value : 42);
    expect(mapErr(r, (e) => e.length)).toEqual(r.ok ? r : err(r.error.length));
  });

  test.prop([fc.array(resultArb, { maxLength: 12 })])(
    'collect keeps every value in order, or accumulates every error in order',
    (rs) => {
      const c = collect(rs);
      const errors = rs.flatMap((r) => (r.ok ? [] : [r.error]));
      const values = rs.flatMap((r) => (r.ok ? [r.value] : []));
      expect(c).toEqual(errors.length === 0 ? ok(values) : err(errors));
    },
  );

  test.prop([fc.integer()])('fromPredicate lifts a predicate into a parser', (n) => {
    const even = fromPredicate<number, string>(
      (x) => x % 2 === 0,
      (x) => `${x} is odd`,
    );
    expect(even(n)).toEqual(n % 2 === 0 ? ok(n) : err(`${n} is odd`));
  });
});

describe('pipe and flow', () => {
  test.prop([fc.integer({ min: -1000, max: 1000 })])('pipe applies left to right, for every arity', (x) => {
    const inc = (n: number): number => n + 1;
    expect(pipe(x)).toBe(x);
    expect(pipe(x, f)).toBe(f(x));
    expect(pipe(x, f, g)).toBe(g(f(x)));
    expect(pipe(x, f, g, inc)).toBe(inc(g(f(x))));
    expect(pipe(x, f, g, inc, f)).toBe(f(inc(g(f(x)))));
    expect(pipe(x, f, g, inc, f, String)).toBe(String(f(inc(g(f(x))))));
  });

  test.prop([fc.integer({ min: -1000, max: 1000 })])('flow is associative composition with identity', (x) => {
    expect(flow<number>()(x)).toBe(x);
    expect(flow(f, g)(x)).toBe(g(f(x)));
    expect(flow(flow(f, g), f)(x)).toBe(flow(f, flow(g, f))(x));
  });
});

describe('match and brand', () => {
  it('select is a total lookup over a finite key set', () => {
    const table = { a: 1, b: 2 } as const;
    expect(select(table, 'b')).toBe(2);
  });

  it('absurd only exists to make the compiler prove exhaustiveness', () => {
    const impossible = 'unreachable' as never;
    expect(absurd(impossible)).toBe('unreachable');
  });

  test.prop([fc.string()])('branding changes the type, never the value', (s) => {
    expect(unsafeBrand<string, 'Test'>(s)).toBe(s);
  });
});
