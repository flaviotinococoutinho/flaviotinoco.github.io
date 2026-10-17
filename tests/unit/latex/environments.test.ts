/**
 * Theorem-like environments (amsthm semantics): shared counter, nesting,
 * localisation, proof heads and the QED tombstone.
 */
import { describe, expect, it } from 'vitest';
import { failure, html, NBSP } from './helpers.ts';

describe('numbering', () => {
  it('numbers every numbered kind with ONE shared counter, in document order (\\newtheorem{lemma}[theorem])', () => {
    const md = [
      ':::definition',
      'D.',
      ':::',
      ':::theorem',
      'T.',
      ':::',
      ':::remark',
      'R.',
      ':::',
      ':::lemma',
      'L.',
      ':::',
      ':::proof',
      'P.',
      ':::',
      ':::proposition',
      'P.',
      ':::',
      ':::corollary',
      'C.',
      ':::',
      ':::conjecture',
      'C.',
      ':::',
      ':::axiom',
      'A.',
      ':::',
      ':::example',
      'E.',
      ':::',
    ].join('\n\n');
    const { html: out } = html(md);
    const heads = [...out.matchAll(/<p class="env__head"[^>]*>(.*?)<\/p>/g)].map((m) =>
      (m[1] ?? '').replace(/<[^>]+>/g, ''),
    );
    expect(heads).toEqual([
      'Definição 1.',
      'Teorema 2.',
      'Observação.',
      'Lema 3.',
      'Demonstração.',
      'Proposição 4.',
      'Corolário 5.',
      'Conjectura 6.',
      'Axioma 7.',
      'Exemplo 8.',
    ]);
  });

  it('counts nested environments in document (pre-)order', () => {
    const md = '::::theorem\nA.\n\n:::lemma\nB.\n:::\n::::\n\n:::corollary\nC.\n:::';
    const { html: out } = html(md);
    expect(out).toContain('<span class="env__name">Teorema</span> <span class="env__number">1</span>');
    expect(out).toContain('<span class="env__name">Lema</span> <span class="env__number">2</span>');
    expect(out).toContain('<span class="env__name">Corolário</span> <span class="env__number">3</span>');
  });
});

describe('markup', () => {
  it('renders the specified section/head structure with id, data-label and aria-labelledby', () => {
    const { html: out } = html(':::theorem{#thm:amostragem title="Nyquist–Shannon"}\nEnunciado.\n:::');
    expect(out).toBe(
      '<section class="env env--theorem env--plain" id="thm-amostragem" data-label="thm:amostragem" aria-labelledby="thm-amostragem__head">' +
        '<p class="env__head" id="thm-amostragem__head"><span class="env__name">Teorema</span> <span class="env__number">1</span> ' +
        '<span class="env__title">(Nyquist–Shannon)</span>.</p><p>Enunciado.</p></section>',
    );
  });

  it('gives unlabelled environments a generated id that no label can produce', () => {
    const { html: out } = html(':::remark\nR.\n:::');
    expect(out).toContain('<section class="env env--remark" id="env_1" aria-labelledby="env_1__head">');
  });

  it('accepts a rich title as the directive label [..]', () => {
    const { html: out } = html(':::definition[Entropia de *Shannon*]{#def:h}\nTexto.\n:::');
    expect(out).toContain('<span class="env__title">(Entropia de <em>Shannon</em>)</span>');
    expect(out).not.toContain('<p>Entropia de');
  });

  it('marks the amsthm style of each kind', () => {
    const { html: out } = html(
      ':::corollary\nC.\n:::\n\n:::example\nE.\n:::\n\n:::remark\nR.\n:::\n\n:::proof\nP.\n:::',
    );
    expect(out).toContain('class="env env--corollary env--plain"');
    expect(out).toContain('class="env env--example env--definition"');
    expect(out).toContain('class="env env--remark"');
    expect(out).toContain('class="env env--proof"');
  });
});

describe('localisation', () => {
  it.each([
    [
      'pt-BR',
      [
        'Definição',
        'Teorema',
        'Lema',
        'Proposição',
        'Corolário',
        'Conjectura',
        'Axioma',
        'Exemplo',
        'Observação',
        'Demonstração',
      ],
      'Fim da demonstração.',
    ],
    [
      'en',
      [
        'Definition',
        'Theorem',
        'Lemma',
        'Proposition',
        'Corollary',
        'Conjecture',
        'Axiom',
        'Example',
        'Remark',
        'Proof',
      ],
      'End of proof.',
    ],
  ] as const)('names every environment in %s', (lang, names, end) => {
    const kinds = [
      'definition',
      'theorem',
      'lemma',
      'proposition',
      'corollary',
      'conjecture',
      'axiom',
      'example',
      'remark',
      'proof',
    ];
    const { html: out } = html(kinds.map((k) => `:::${k}\nX.\n:::`).join('\n\n'), lang);
    for (const name of names) expect(out).toContain(`<span class="env__name">${name}</span>`);
    expect(out).toContain(`<span class="visually-hidden">${end}</span>`);
  });
});

describe('proofs', () => {
  it('nests with more colons on the outer fence; of= names its statement; the tombstone is aria-hidden', () => {
    const md = ['::::theorem{#thm:a}', 'Enunciado.', '', ':::proof{of="thm:a"}', 'Prova.', ':::', '::::'].join('\n');
    const { html: out } = html(md);
    expect(out).toContain(
      `<span class="env__name">Demonstração do <a href="#thm-a" class="xref xref--theorem" data-label="thm:a">Teorema${NBSP}1</a></span>.`,
    );
    expect(out).toContain(
      '<p>Prova.<span class="qed"><span aria-hidden="true">∎</span><span class="visually-hidden">Fim da demonstração.</span></span></p></section></section>',
    );
    expect(out).not.toContain(':::');
  });

  it('fails on equal fences: the first ":::" closes the OUTER environment and the second is left as text', () => {
    const md = [':::theorem', 'Enunciado.', '', ':::proof', 'Prova.', ':::', 'Mais texto do teorema.', ':::'].join(
      '\n',
    );
    const message = failure(() => html(md));
    expect(message).toMatch(/stray ":::" line/);
    expect(message).toMatch(/OUTER fence needs more colons/);
  });

  it('uses the right pt-BR contraction for each statement kind', () => {
    const of = (kind: string): string => html(`:::${kind}{#x:a}\nS.\n:::\n\n:::proof{of="x:a"}\nQ.\n:::`).html;
    expect(of('proposition')).toContain('Demonstração da <a href="#x-a"');
    expect(of('definition')).toContain('Demonstração da <a');
    expect(of('conjecture')).toContain('Demonstração da <a');
    expect(of('lemma')).toContain('Demonstração do <a');
    expect(of('corollary')).toContain('Demonstração do <a');
  });

  it('localises proof-of in English and resolves forward targets', () => {
    const { html: out } = html(':::proof{of="lem:b"}\nQ.\n:::\n\n:::lemma{#lem:b}\nL.\n:::', 'en');
    expect(out).toContain(`Proof of <a href="#lem-b" class="xref xref--lemma" data-label="lem:b">Lemma${NBSP}1</a>`);
  });

  it('takes an explicit title instead of the default head, as \\begin{proof}[…]', () => {
    const { html: out } = html(':::proof{title="Esboço da prova"}\nQ.\n:::');
    expect(out).toContain('<span class="env__name"><span class="env__title">Esboço da prova</span></span>.');
  });

  it('puts the tombstone on its own line when the proof does not end with a paragraph', () => {
    const { html: out } = html(':::proof\nTexto.\n\n$$\nx\n$$\n:::', 'pt-BR', { katex: false });
    expect(out).toMatch(/<p class="qed-line"><span class="qed">/);
  });
});

describe('closed grammar', () => {
  it('fails on unknown attributes, invalid labels and of= pointing to a non-theorem', () => {
    expect(failure(() => html(':::theorem{titel="x"}\nT.\n:::'))).toMatch(/unknown attribute "titel"/);
    expect(failure(() => html(':::theorem{#Thm_X}\nT.\n:::'))).toMatch(/invalid label "Thm_X"/);
    expect(failure(() => html(':::remark{#rem:a}\nR.\n:::\n\n:::proof{of="rem:a"}\nP.\n:::'))).toMatch(
      /must name a numbered theorem-like environment/,
    );
    expect(failure(() => html(':::proof{of="thm:a" title="T"}\nP.\n:::\n\n:::theorem{#thm:a}\nT.\n:::'))).toMatch(
      /either of="…" or a title/,
    );
    expect(failure(() => html(':::theorem[A]{title="B"}\nT.\n:::'))).toMatch(/both a \[label\] and title/);
  });
});
