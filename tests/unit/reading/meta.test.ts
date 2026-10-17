import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { fixture, parse, render } from './helpers.ts';
import { countWords, readingMinutes, WORDS_PER_MINUTE } from '../../../src/core/fold/words.ts';
import { foldDocument, parseDocumentMeta } from '../../../src/core/fold/meta.ts';
import { transformReading } from '../../../src/core/reading/transform.ts';
import { fillToc } from '../../../src/core/reading/toc.ts';
import { PAGE_IDS } from '../../../src/core/reading/records.ts';
import type { Locale } from '../../../src/core/domain/locale.ts';

const samples = JSON.parse(fixture('words.json')) as Record<Locale, readonly { text: string; words: number }[]>;

describe('countWords (Intl.Segmenter with the document locale)', () => {
  for (const locale of ['pt-BR', 'en'] as const) {
    it.each(samples[locale].map((s) => [s.text, s.words] as const))(`${locale}: %j has %i words`, (text, words) => {
      expect(countWords(text, locale)).toBe(words);
    });
  }
  test.prop([fc.array(fc.stringMatching(/^[a-zà-öø-ú]{1,10}$/), { maxLength: 40 })])(
    'counts space-separated words exactly',
    (ws) => {
      expect(countWords(ws.join(' '), 'pt-BR')).toBe(ws.length);
    },
  );
  test.prop([fc.string({ maxLength: 80 }), fc.string({ maxLength: 80 })])(
    'is additive over a block boundary',
    (a, b) => {
      // A line break is a mandatory word boundary (UAX #29, WB3a/WB3b), so blocks never glue.
      expect(countWords(`${a}\n\n${b}`, 'en')).toBe(countWords(a, 'en') + countWords(b, 'en'));
    },
  );
});

describe('readingMinutes (Brysbaert 2019: 238 words/min, rounded up, at least 1)', () => {
  it('uses 238 words per minute', () => {
    expect(WORDS_PER_MINUTE).toBe(238);
    expect([0, 1, 238, 239, 476, 477, 2380].map((w) => readingMinutes(w))).toEqual([1, 1, 1, 2, 2, 3, 10]);
  });
  test.prop([fc.nat(100_000)])('is monotone and never under-estimates', (w) => {
    const m = readingMinutes(w);
    expect(m).toBeGreaterThanOrEqual(1);
    expect(m * WORDS_PER_MINUTE).toBeGreaterThanOrEqual(w);
    expect(readingMinutes(w + 1)).toBeGreaterThanOrEqual(m);
  });
});

describe('the meta fold', () => {
  const fold = (md: string, locale: Locale = 'pt-BR') => {
    const reading = transformReading(parse(md), { locale, source: md, reservedIds: PAGE_IDS });
    return foldDocument(fillToc(reading.tree, md), { locale, source: md });
  };

  it('excludes code, math, image alt, generated labels and the table of contents', () => {
    const md =
      '::toc\n\n## Título\n\nTexto com `código` e $$x^2$$ fórmula ![alt longo aqui](a.png).\n\n```js\nconst nada = 1;\n```\n\n$$\ny = x\n$$';
    expect(fold(md).wordCount).toBe(1 + 4);
  });
  it('counts notes and footnotes as separate texts, and stretchtext as expandable', () => {
    const md =
      'Palavra:sidenote[nota lateral] fim.\n\n:::stretch{label="Mais"}\nTrês palavras aqui.\n:::\n\nTexto[^1].\n\n[^1]: Nota de rodapé.';
    const meta = fold(md);
    expect(meta.wordCount).toBe(2 + 2 + 3 + 1 + 3);
    expect(meta.expandableWordCount).toBe(3);
    expect(meta.sidenoteCount).toBe(1);
  });
  it('restores prose that remark-directive mistook for directives before counting', () => {
    expect(fold('Às 10:30 em ponto.').wordCount).toBe(5);
  });
  it('exports the outline, the argument graph, embeds and math', () => {
    const meta = fold(fixture('ensaio.md'));
    expect(meta.outline.map((o) => o.id)).toEqual([
      'questao',
      'def:entropia',
      'premissa-ruido',
      'tese',
      'objecao',
      'nível-sintático',
    ]);
    expect(meta.argument.edges).toContainEqual({ from: 'premissa-ruido', to: 'tese' });
    expect(meta.argument.nodes.find((n) => n.id === 'tese')).toEqual({
      id: 'tese',
      kind: 'claim',
      title: 'Há um limite de transmissão',
      depends: ['def:entropia', 'premissa-ruido'],
    });
    expect(meta.embeds).toEqual(['ft-horizontal', 'ft-scrolly']);
    expect(meta.hasEmbeds).toBe(true);
    expect(meta.hasMath).toBe(true);
    expect(meta.marginnoteCount).toBe(1);
  });
  it('marks headings outside the main flow and finds ft-* tags in raw HTML', () => {
    const meta = fold(':::aside\n## Lateral\n:::\n\n<ft-lab-demo></ft-lab-demo>');
    expect(meta.outline).toEqual([{ depth: 2, id: 'lateral', text: 'Lateral', inToc: false }]);
    expect(meta.embeds).toEqual(['ft-lab-demo']);
  });
  it('is deterministic', () => {
    const md = fixture('ensaio.md');
    expect(fold(md)).toEqual(fold(md));
  });
});

describe('remarkMeta → remarkPluginFrontmatter → parseDocumentMeta', () => {
  it('exports every field, keeps the frontmatter, and decodes losslessly (decode ∘ encode = id)', async () => {
    const { frontmatter } = await render(fixture('ensaio.md'));
    expect(frontmatter['lang']).toBe('pt-BR');
    const decoded = parseDocumentMeta(JSON.parse(JSON.stringify(frontmatter)));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const { lang: _lang, ...meta } = frontmatter;
      expect(decoded.value).toEqual(meta);
    }
  });
  it('reports every malformed field', () => {
    const r = parseDocumentMeta({ wordCount: -1, outline: [{}], argument: { nodes: [{ kind: 'tese' }], edges: [1] } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual(
        expect.arrayContaining([
          'wordCount: expected a non-negative integer',
          'outline: malformed entry',
          expect.stringMatching(/^argument.nodes: malformed node/),
          'argument.edges: malformed edge',
          'embeds: expected an array of strings',
          'hasMath: expected a boolean',
        ]),
      );
    }
    expect(parseDocumentMeta(null)).toEqual({ ok: false, error: ['document metadata is not an object'] });
  });
});
