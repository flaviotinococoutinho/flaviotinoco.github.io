/**
 * Exhaustiveness for algebraic data types.
 *
 * `absurd` is the eliminator of the empty type (ex falso quodlibet). If a new
 * variant is added to a union and a `switch` forgets it, the call site no longer
 * type-checks — the compiler, not the reader, proves the case analysis complete.
 */
export const absurd = (value: never): never => value;

/**
 * Total lookup in a record keyed by a finite union: the type guarantees every
 * key exists, so no `undefined` branch leaks out.
 */
export const select = <K extends PropertyKey, V>(table: Readonly<Record<K, V>>, key: K): V => table[key];
