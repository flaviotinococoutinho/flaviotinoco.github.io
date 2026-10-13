/**
 * Information preservation (docs/arquitetura.md §2.4) for the whole reading
 * stage: the text a reader would see is recoverable from the transformed tree,
 * recoverText(T(x)) = recoverText(x), for generated documents that use every
 * directive (valid or not) and for arbitrary strings.
 */
import { describe, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parse } from './helpers.ts';
import { recoverText } from '../../../src/core/reading/recover.ts';
import { transformReading } from '../../../src/core/reading/transform.ts';
import { childrenOf, type MdNode } from '../../../src/core/fold/tree.ts';
import { PAGE_IDS } from '../../../src/core/reading/records.ts';

const run = (md: string) => {
  const tree = parse(md);
  return { tree, result: transformReading(tree, { locale: 'pt-BR', source: md, reservedIds: PAGE_IDS }) };
};

const word = fc.oneof(
  fc.stringMatching(/^[A-Za-zÀ-ú]{1,8}$/),
  fc.constantFrom('10:30', 'a:b', '1:2', '{1, 2}', '{x}', 'R$ 5,00', '*ênfase*', '`código`', '$$x^2$$', 'guarda-chuva', '“aspas”'),
);
const prose = fc.array(word, { minLength: 1, maxLength: 6 }).map((ws) => ws.join(' '));
const ident = fc.stringMatching(/^[a-z][a-z0-9]{0,5}(?::[a-z]{1,4})?$/);
const kind = fc.constantFrom('question', 'definition', 'premise', 'claim', 'objection', 'reply', 'tese');
const attrs = fc.oneof(
  fc.constant(''),
  ident.map((id) => ` {#${id}}`),
  fc.tuple(ident, kind).map(([id, k]) => ` {#${id} .${k}}`),
  fc.tuple(ident, kind, ident).map(([id, k, d]) => ` {#${id} .${k} depends="${d}"}`),
  fc.constantFrom(' {1, 2}', ' \\{.claim}', '{#colado}', ' {.a.b}'),
);
const block = fc.oneof(
  fc.tuple(fc.integer({ min: 1, max: 4 }), prose, attrs).map(([d, t, a]) => `${'#'.repeat(d)} ${t}${a}`),
  prose,
  fc.tuple(prose, prose, prose).map(([a, b, c]) => `${a}:sidenote[${b}] ${c} :marginnote[${a}]`),
  fc.tuple(prose, prose).map(([l, b]) => `:::stretch{label="${l}"}\n${b}\n:::`),
  fc.tuple(prose, prose).map(([l, b]) => `:::stretch[${l}]\n${b}\n:::`),
  fc.tuple(prose, prose).map(([a, b]) => `::::scrolly\n![${a}](x.png)\n\n:::step{state="s"}\n${b}\n:::\n::::`),
  fc.tuple(prose, prose, prose).map(([l, a, b]) => `::::horizontal{label="${l}"}\n:::panel\n${a}\n:::\n\n:::panel\n${b}\n:::\n::::`),
  fc.tuple(prose, prose).map(([s, q]) => `:::epigraph[${s}]\n${q}\n:::`),
  fc.tuple(prose, prose).map(([s, q]) => `:::epigraph{source="${s}"}\n${q}\n:::`),
  fc.tuple(prose, prose).map(([l, q]) => `:::aside{label="${l}"}\n${q}\n:::`),
  fc.constant('::toc'),
  prose.map((p) => `:::step\n${p}\n:::`),
);
const document = fc.array(block, { minLength: 1, maxLength: 8 }).map((bs) => bs.join('\n\n'));

describe('injectivity of the reading stage', () => {
  test.prop([document], { numRuns: 300 })('recoverText(T(x)) = recoverText(x) for documents using every directive', (md) => {
    const { tree, result } = run(md);
    expect(recoverText(result.tree, md)).toBe(recoverText(tree, md));
  });

  test.prop([fc.string({ maxLength: 160 })], { numRuns: 300 })('recoverText(T(x)) = recoverText(x) for arbitrary strings', (md) => {
    const { tree, result } = run(md);
    expect(recoverText(result.tree, md)).toBe(recoverText(tree, md));
  });

  test.prop([fc.array(prose, { minLength: 1, maxLength: 5 })])('plain headings keep their children untouched', (titles) => {
    const md = titles.map((t) => `## ${t}`).join('\n\n');
    const { tree, result } = run(md);
    const headings = (n: MdNode): readonly MdNode[] =>
      n.type === 'heading' ? [n] : childrenOf(n).flatMap((c) => headings(c));
    const before = headings(tree).map((h) => childrenOf(h));
    const after = headings(result.tree).map((h) => childrenOf(h));
    expect(after).toEqual(before);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
