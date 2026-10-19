/**
 * JSON-LD embedding (W3C JSON-LD 1.1, §6 "Embedding JSON-LD in HTML documents").
 *
 * A JSON-LD block lives in `<script type="application/ld+json">`, whose content
 * the HTML parser reads as raw text until the first `</script` (WHATWG HTML,
 * "script data state"). JSON.stringify does not escape `<`, so a title such as
 * "a </script><script>…" would end the block early and inject markup. Escaping
 * `<`, `>` and `&` as <, >, & keeps the text inert and parses
 * back to the same value (JSON string escapes are part of the grammar, RFC 8259
 * §7), so the transform is information-preserving: JSON.parse ∘ serialize = id
 * on JSON values. U+2028/U+2029 are escaped too, for consumers that evaluate
 * the block as JavaScript (they were not valid in ECMAScript strings before ES2019).
 */

export type JsonLdValue =
  string | number | boolean | null | readonly JsonLdValue[] | { readonly [key: string]: JsonLdValue };

const ESCAPES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** Text for the body of a `<script type="application/ld+json">` element. */
export const serializeJsonLd = (value: JsonLdValue): string =>
  JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, (c) => ESCAPES[c] ?? c);

/** Wraps nodes into one document with a shared @context (schema.org by default). */
export const jsonLdGraph = (
  nodes: readonly { readonly [key: string]: JsonLdValue }[],
  context: JsonLdValue = 'https://schema.org',
): JsonLdValue =>
  nodes.length === 1 ? { '@context': context, ...nodes[0] } : { '@context': context, '@graph': nodes };
