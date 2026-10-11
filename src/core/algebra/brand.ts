/**
 * Nominal (branded) types over structural TypeScript.
 *
 * A `ConceptId` and a `Slug` are both strings at runtime, but mixing them is a
 * category error. Branding makes the compiler reject accidental substitution,
 * which removes a whole class of silent misinterpretations. Values can only be
 * obtained through the parser of each domain module (smart constructors).
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

/**
 * Unsafe cast reserved for smart constructors that have ALREADY validated the
 * value. Never call it outside a parser.
 */
export const unsafeBrand = <T, B extends string>(value: T): Brand<T, B> => value as Brand<T, B>;
