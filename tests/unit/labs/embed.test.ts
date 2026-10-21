/**
 * The embed transform: `::lab{widget=…}` becomes `<ft-lab-…>` with a fallback; the closed vocabulary is
 * enforced with every error reported; claimed nodes are left alone and the input tree is not mutated;
 * scrolly steps are checked against the widget's parameters. Also the element model and the lab index.
 */
import { describe, expect, it } from 'vitest';
import { childrenOf, type MdNode } from '../../../src/core/fold/tree.ts';
import {
  elementProperties,
  fallbackHast,
  labElementModel,
  labLinks,
  parseLabIndexEntry,
  transformEmbeds,
  type EmbedContext,
  type LabIndexEntry,
} from '../../../src/core/labs/embed.ts';
import { transformReading } from '../../../src/core/reading/transform.ts';
import { PAGE_IDS } from '../../../src/core/reading/records.ts';
import { parse } from '../reading/helpers.ts';

const entries: readonly LabIndexEntry[] = [
  { widget: 'sampling', locale: 'pt-BR', slug: 'amostragem', title: 'Amostragem', draft: false },
  { widget: 'sampling', locale: 'en', slug: 'sampling', title: 'Sampling', draft: false },
  { widget: 'fourier', locale: 'pt-BR', slug: 'fourier-rascunho', title: 'Rascunho', draft: true },
  { widget: 'fourier', locale: 'pt-BR', slug: 'fourier-e-gibbs', title: 'Fourier e Gibbs', draft: false },
  { widget: 'fourier', locale: 'pt-BR', slug: 'outro', title: 'Outro', draft: false },
];
const links = labLinks(entries, 'pt-BR', '/base/');
const ctx = (source: string): EmbedContext => ({ locale: 'pt-BR', source, links });

/** The reading stage first (it claims scrolly figures and steps), then the embeds. */
const run = (md: string) => {
  const read = transformReading(parse(md), { locale: 'pt-BR', source: md, reservedIds: PAGE_IDS });
  return transformEmbeds(read.tree, ctx(md));
};
const errors = (md: string): readonly string[] =>
  run(md)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.rule);
const find = (node: MdNode, pred: (n: MdNode) => boolean): MdNode | undefined => {
  if (pred(node)) return node;
  for (const c of childrenOf(node)) {
    const hit = find(c, pred);
    if (hit !== undefined) return hit;
  }
  return undefined;
};
const labNode = (md: string): MdNode | undefined => find(run(md).tree, (n) => n.data?.hName === 'ft-lab-sampling');

describe('lab links', () => {
  it('links each widget to its first published page of the locale', () => {
    expect(links.sampling).toEqual({ href: '/base/pt/laboratorio/amostragem/', title: 'Amostragem' });
    expect(links.fourier).toEqual({ href: '/base/pt/laboratorio/fourier-e-gibbs/', title: 'Fourier e Gibbs' });
    expect(links.entropy).toBeUndefined();
    expect(labLinks(entries, 'en', '/base').sampling?.href).toBe('/base/en/lab/sampling/');
  });

  it('reads a lab entry from untyped frontmatter and refuses incomplete ones', () => {
    const ok = parseLabIndexEntry({ widget: 'clt', lang: 'en', slug: 'central-limit', title: 'Central limit' });
    expect(ok).toEqual({
      ok: true,
      value: { widget: 'clt', locale: 'en', slug: 'central-limit', title: 'Central limit', draft: false },
    });
    expect(parseLabIndexEntry(null).ok).toBe(false);
    expect(parseLabIndexEntry({ widget: 'x', lang: 'en', slug: 's', title: 't' }).ok).toBe(false);
    expect(parseLabIndexEntry({ widget: 'clt', lang: 'fr', slug: 's', title: 't' }).ok).toBe(false);
    expect(parseLabIndexEntry({ widget: 'clt', lang: 'en', slug: 'S!', title: 't' }).ok).toBe(false);
    expect(parseLabIndexEntry({ widget: 'clt', lang: 'en', slug: 's', title: ' ' }).ok).toBe(false);
    expect(parseLabIndexEntry({ widget: 'clt', lang: 'en', slug: 's', title: 't', draft: 'yes' }).ok).toBe(false);
    expect(parseLabIndexEntry({ widget: 'clt', lang: 'en', slug: 's', title: 't', draft: true })).toMatchObject({
      ok: true,
      value: { draft: true },
    });
  });
});

describe('element model', () => {
  it('carries its configuration in data-* attributes and a localised fallback', () => {
    const m = labElementModel('sampling', 'en', {
      state: 'fs=6000',
      link: { href: '/base/en/lab/sampling/', title: 'Sampling' },
      permalink: true,
      title: 'Sampling theorem',
      source: '::lab{widget=sampling state="fs=6000"}',
    });
    expect(m.tag).toBe('ft-lab-sampling');
    expect(m.attributes).toEqual({
      class: 'lab',
      'data-widget': 'sampling',
      'data-locale': 'en',
      'data-state': 'fs=6000',
      'data-href': '/base/en/lab/sampling/',
      'data-permalink': '',
      'data-title': 'Sampling theorem',
      'data-source': '::lab{widget=sampling state="fs=6000"}',
    });
    expect(m.link).toEqual({ href: '/base/en/lab/sampling/', text: 'Open the lab: Sampling' });
    expect(m.description.length).toBeGreaterThan(0);
    expect(elementProperties(m)).toMatchObject({ className: ['lab'], dataWidget: 'sampling', dataPermalink: '' });
    const bare = labElementModel('clt', 'pt-BR', { state: '', link: null });
    expect(Object.keys(bare.attributes)).toEqual(['class', 'data-widget', 'data-locale']);
    expect(bare.link).toBeNull();
    const fallback = fallbackHast(bare);
    expect(fallback.children).toHaveLength(2);
    expect(fallbackHast(m).children).toHaveLength(3);
  });
});

describe('transform', () => {
  it('claims ::lab with its attributes, state and source', () => {
    const md = '# T\n\n::lab{widget=sampling fs=6000 #fig}\n';
    const node = labNode(md);
    expect(node?.data?.hProperties).toMatchObject({
      dataWidget: 'sampling',
      dataState: 'fs=6000',
      dataHref: '/base/pt/laboratorio/amostragem/',
      dataSource: '::lab{widget=sampling fs=6000 #fig}',
      id: 'fig',
    });
    expect(node?.data?.hChildren).toHaveLength(1);
    expect(errors(md)).toEqual([]);
  });

  it('merges state="…" with attributes and rejects a parameter given twice', () => {
    const node = labNode('::lab{widget=sampling state="fs=6000" f=100}\n');
    expect(node?.data?.hProperties).toMatchObject({ dataState: 'fs=6000;f=100' });
    expect(errors('::lab{widget=sampling state="fs=6000" fs=8000}\n')).toEqual(['embeds:duplicate-param']);
  });

  it('reports every error of the closed vocabulary', () => {
    expect(errors('::lab\n')).toEqual(['embeds:missing-widget']);
    expect(errors('::lab{widget=lorenz}\n')).toEqual(['embeds:unknown-widget']);
    expect(errors('::lab[rótulo]{widget=sampling}\n')).toEqual(['embeds:label-not-allowed']);
    expect(errors('::lab{widget=sampling N=3}\n')).toEqual(['embeds:unknown-attribute']);
    expect(errors('::lab{widget=sampling fs=1}\n')).toEqual(['embeds:invalid-value']);
    expect(errors('::lab{widget=sampling state="fs=1;zz=2"}\n')).toEqual([
      'embeds:invalid-state',
      'embeds:invalid-state',
    ]);
    expect(errors(':::lab{widget=sampling}\ntexto\n:::\n')).toEqual(['embeds:not-a-leaf']);
    expect(errors('texto :lab{widget=sampling} texto\n')).toEqual(['embeds:not-a-leaf']);
  });

  it('warns when no published page of the locale exists', () => {
    const r = run('::lab{widget=entropy}\n');
    expect(r.diagnostics.map((d) => [d.severity, d.rule])).toEqual([['warning', 'embeds:no-page']]);
    const node = find(r.tree, (n) => n.data?.hName === 'ft-lab-entropy');
    expect(node?.data?.hProperties).not.toHaveProperty('dataHref');
  });

  it('checks the steps of a scrolly whose figure is the lab', () => {
    const good = '::::scrolly\n::lab{widget=sampling}\n\n:::step{state="fs=6000"}\nUm.\n:::\n::::\n';
    expect(errors(good)).toEqual([]);
    const bad =
      '::::scrolly\n::lab{widget=sampling}\n\n:::step{state="fs=1"}\nUm.\n:::\n\n:::step{state="zz=1"}\nDois.\n:::\n::::\n';
    expect(errors(bad)).toEqual(['embeds:invalid-step-state', 'embeds:invalid-step-state']);
  });

  it('is idempotent and never mutates its input', () => {
    const md = '::lab{widget=sampling fs=6000}\n\nTexto.\n';
    const input = parse(md);
    const frozen = JSON.stringify(input);
    const once = transformEmbeds(input, ctx(md));
    expect(JSON.stringify(input)).toBe(frozen);
    const twice = transformEmbeds(once.tree, ctx(md));
    expect(twice.tree).toBe(once.tree);
    expect(twice.diagnostics).toEqual([]);
  });
});
