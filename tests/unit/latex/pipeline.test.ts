/**
 * The latex stage inside the FULL site pipeline (createPipeline order, Astro's processor with
 * GFM and SmartyPants): properties that only hold once the later stages run.
 */
import { describe, expect, it } from 'vitest';
import { htmlIds, NBSP, site } from './helpers.ts';

describe('label ids and heading ids share one namespace (latex → reading)', () => {
  it('a heading slug never takes an id derived from a label, so :ref lands on the environment', async () => {
    // "## Def entropia" slugs to "def-entropia", the id of :::definition{#def:entropia}. The reading
    // stage collects the ids earlier stages set in hProperties and slugs headings around them.
    const { html } = await site(
      '## Def entropia\n\nVer :ref[def:entropia].\n\n:::definition{#def:entropia}\nD.\n:::\n\n## Def entropia\n\nFim.',
    );
    expect(html).toContain('<h2 id="def-entropia-1">Def entropia</h2>');
    expect(html).toContain('<h2 id="def-entropia-2">Def entropia</h2>');
    expect(html).toContain('<section class="env env--definition" id="def-entropia" data-label="def:entropia"');
    expect(html).toContain(
      `<a href="#def-entropia" class="xref xref--definition" data-label="def:entropia">Definição${NBSP}1</a>`,
    );
    const ids = htmlIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('also avoids the ids of labelled equations and figures, and of their generated parts', async () => {
    const { html } = await site(
      '## Eq x\n\n## Fig a\n\n## Fig a caption\n\n$$\nx \\label{eq:x}\n$$\n\n' +
        ':::figure{#fig:a title="A" source="S."}\n![a](a.png)\n:::',
    );
    const ids = htmlIds(html);
    expect(ids).toEqual(expect.arrayContaining(['eq-x', 'fig-a', 'fig-a__caption', 'eq-x-1', 'fig-a-1']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('an explicit heading {#id} equal to a label-derived id fails the build', async () => {
    await expect(site('## Título {#def-1}\n\n:::definition{#def:1}\nD.\n:::')).rejects.toThrow(
      /id "def-1" is used more than once in the page/,
    );
  });
});
