import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { jsonLdGraph, serializeJsonLd, type JsonLdValue } from '../../../src/core/web/json-ld.ts';

const json: fc.Arbitrary<JsonLdValue> = fc.jsonValue() as fc.Arbitrary<JsonLdValue>;

describe('JSON-LD embedding', () => {
  test.prop([json])('JSON.parse ∘ serializeJsonLd = id on JSON values', (v) => {
    expect(JSON.parse(serializeJsonLd(v))).toEqual(JSON.parse(JSON.stringify(v)));
  });

  test.prop([json])('never contains characters that can end or alter a script data block', (v) => {
    expect(serializeJsonLd(v)).not.toMatch(/[<>&\u2028\u2029]/u);
  });

  test.prop([fc.string()])('a hostile string stays inside the block', (s) => {
    const text = serializeJsonLd({ name: `${s}</script><script>alert(1)</script>` });
    expect(text.toLowerCase()).not.toContain('</script');
  });

  test.prop([fc.array(fc.dictionary(fc.string(), fc.string()), { minLength: 1, maxLength: 4 })])(
    'one node is inlined, several share an @graph',
    (nodes) => {
      const doc = jsonLdGraph(nodes) as Record<string, JsonLdValue>;
      expect(doc['@context']).toBe('https://schema.org');
      if (nodes.length === 1) expect(doc['@graph']).toBeUndefined();
      else expect(doc['@graph']).toEqual(nodes);
    },
  );
});
