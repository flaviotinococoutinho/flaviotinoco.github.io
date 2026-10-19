/**
 * Total rendering of an arbitrary value for error messages.
 *
 * `String(v)` is not total: it throws for objects whose toString/valueOf are not
 * callable (e.g. `{ toString: [] }`) or for Symbol in template literals. Parsers
 * report the offending input, so they need a renderer that never throws.
 */
const MAX = 80;

export const show = (v: unknown): string => {
  switch (typeof v) {
    case 'string':
      return v;
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
      return String(v);
    case 'symbol':
      return v.description === undefined ? 'Symbol()' : `Symbol(${v.description})`;
    case 'function':
      return '[function]';
    case 'object': {
      if (v === null) return 'null';
      try {
        const json = JSON.stringify(v);
        if (json === undefined) return '[object]';
        return json.length > MAX ? `${json.slice(0, MAX - 1)}…` : json;
      } catch {
        return '[object]';
      }
    }
  }
};
