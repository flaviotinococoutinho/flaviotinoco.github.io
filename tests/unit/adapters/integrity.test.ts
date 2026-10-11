import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { toString } from 'mdast-util-to-string';
import { remarkIntegrity } from '../../../src/adapters/unified/remark-integrity.ts';
import type { PipelineContext } from '../../../src/adapters/unified/context.ts';

const context = {} as PipelineContext;
const html = (md: string): string =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkIntegrity, { context })
      .use(remarkRehype)
      .use(rehypeStringify)
      .processSync(md),
  );
const text = (md: string): string => {
  const processor = unified().use(remarkParse).use(remarkDirective).use(remarkIntegrity, { context });
  return toString(processor.runSync(processor.parse(md), md));
};
const plain = (md: string): string => toString(unified().use(remarkParse).parse(md));

describe('remarkIntegrity', () => {
  it('restores prose that remark-directive mistakes for directives', () => {
    expect(html('Começa às 10:30 e termina às 11:45.')).toContain('às 10:30 e termina às 11:45');
    expect(html('Proporção 1:2, porta http://x.y:8080.')).toContain('1:2');
  });

  it('fails the build on unknown block directives instead of dropping them', () => {
    expect(() => html(':::teorem\nTexto.\n:::')).toThrow(/unknown container directive "teorem"/);
    expect(() => html('::lab{name=x}')).toThrow(/unknown leaf directive "lab"/);
  });

  test.prop([fc.string({ maxLength: 120 })], { numRuns: 400 })(
    'never changes the plain text of documents without block directives',
    (s) => {
      fc.pre(!/^\s*:{2,}/m.test(s));
      expect(text(s)).toBe(plain(s));
    },
  );
});
