/**
 * Deterministic string order (UTF-16 code units), independent of the ICU
 * collation data of the running Node: reports must be byte-identical across
 * machines so CI logs can be diffed.
 */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
