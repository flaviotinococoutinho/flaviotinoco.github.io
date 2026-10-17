/**
 * Illustrations and tables, ABNT NBR 14724:2024 §5.8–5.9: one counter per
 * designation, caption ABOVE ("Figura 1 – Título", en dash), source BELOW.
 */
import { describe, expect, it } from 'vitest';
import { failure, html, NBSP } from './helpers.ts';

const figure = (kind: string, id: string, title = 'T'): string =>
  `:::figure{#${id} kind="${kind}" title="${title}" source="Elaborado pelo autor (2026)."}\n![x](x.png)\n:::`;

describe('figures', () => {
  it('keeps one counter per kind and puts the caption above with an en dash', () => {
    const md = [
      figure('figure', 'fig:a'),
      figure('chart', 'fig:b'),
      figure('figure', 'fig:c'),
      figure('frame', 'fig:d'),
    ].join('\n\n');
    const { html: out } = html(md);
    expect(out).toContain(`<span class="figure__label">Figura${NBSP}1</span> – <span class="figure__title">T</span>`);
    expect(out).toContain(`<span class="figure__label">Gráfico${NBSP}1</span>`);
    expect(out).toContain(`<span class="figure__label">Figura${NBSP}2</span>`);
    expect(out).toContain(`<span class="figure__label">Quadro${NBSP}1</span>`);
    expect(out.indexOf('<figcaption')).toBeLessThan(out.indexOf('<img'));
    expect(out.indexOf('<img')).toBeLessThan(out.indexOf('<p class="figure__source">'));
    expect(out).toContain(
      '<p class="figure__source"><span class="figure__source-label">Fonte:</span> Elaborado pelo autor (2026).</p>',
    );
    expect(out.match(/<figcaption/g)).toHaveLength(4);
  });

  it('renders the specified figure structure', () => {
    const { html: out } = html(figure('chart', 'fig:dobramento', 'Dobramento espectral'));
    expect(out).toBe(
      '<figure class="figure figure--chart" id="fig-dobramento" data-label="fig:dobramento">' +
        `<figcaption class="figure__caption" id="fig-dobramento__caption"><span class="figure__label">Gráfico${NBSP}1</span> – ` +
        '<span class="figure__title">Dobramento espectral</span></figcaption>' +
        '<p><img src="x.png" alt="x"></p>' +
        '<p class="figure__source"><span class="figure__source-label">Fonte:</span> Elaborado pelo autor (2026).</p></figure>',
    );
  });

  it('accepts a rich title as the directive label', () => {
    const { html: out } = html(':::figure[Espectro de *x*]{source="S."}\n![x](x.png)\n:::');
    expect(out).toContain('<span class="figure__title">Espectro de <em>x</em></span>');
    expect(out).toContain('id="figure_1"');
  });

  it('localises designation and source (en)', () => {
    const { html: out } = html(figure('frame', 'fig:q'), 'en');
    expect(out).toContain(`<span class="figure__label">Box${NBSP}1</span> – `);
    expect(out).toContain('<span class="figure__source-label">Source:</span>');
  });
});

describe('tables', () => {
  it('labels the GFM table with its caption for assistive technology', () => {
    const md = ':::figure{#tab:t kind="table" title="Rates" source="Own work."}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::';
    const { html: out } = html(md, 'en');
    expect(out).toContain('<figure class="figure figure--table" id="tab-t" data-label="tab:t">');
    expect(out).toContain(
      `<figcaption class="figure__caption" id="tab-t__caption"><span class="figure__label">Table${NBSP}1</span> – `,
    );
    // The table scrolls in its own box, named by the caption and reachable by keyboard (WCAG 2.1.1).
    expect(out).toContain(
      '<div class="figure__scroll" tabindex="0" role="group" aria-labelledby="tab-t__caption"><table aria-labelledby="tab-t__caption">',
    );
    expect(out).toContain('<span class="figure__source-label">Source:</span> Own work.');
    expect(out.match(/<figcaption/g)).toHaveLength(1);
  });

  it('counts tables apart from figures', () => {
    const table = (id: string): string =>
      `:::figure{#${id} kind="table" title="T" source="S."}\n| a |\n|---|\n| 1 |\n:::`;
    const { html: out } = html([figure('figure', 'fig:a'), table('tab:a'), table('tab:b')].join('\n\n'));
    expect(out).toContain(`Figura${NBSP}1`);
    expect(out).toContain(`Tabela${NBSP}1`);
    expect(out).toContain(`Tabela${NBSP}2`);
  });
});

describe('diagnostics', () => {
  it('fails without a title, on a table kind without a table and on an unknown kind; warns without a source', () => {
    expect(failure(() => html(':::figure{#fig:x}\n![x](x.png)\n:::'))).toMatch(/needs a title/);
    expect(failure(() => html(':::figure{kind="table" title="T" source="S"}\nTexto.\n:::'))).toMatch(
      /must contain a Markdown \(GFM\) table/,
    );
    expect(failure(() => html(':::figure{kind="photo" title="T" source="S"}\n![x](x.png)\n:::'))).toMatch(
      /invalid figure kind "photo"/,
    );
    expect(failure(() => html(':::figure{title="T" legenda="L"}\n![x](x.png)\n:::'))).toMatch(
      /unknown attribute "legenda"/,
    );
    const { file } = html(':::figure{title="T"}\n![x](x.png)\n:::');
    expect(file.messages.map((m) => m.ruleId)).toEqual(['missing-source']);
    expect(file.messages[0]?.fatal).toBe(false);
  });
});
