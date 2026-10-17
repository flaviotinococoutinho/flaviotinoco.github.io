import { describe, expect, it } from 'vitest';
import { markToDirective, markToHast, parseDirectiveMark, type Mark } from '../../../src/core/abnt/marks.ts';
import { tag } from '../lexicon/helpers.ts';

describe('marks', () => {
  it('render as the documented HTML elements', () => {
    expect(markToHast({ name: 'foreign', lang: tag('de') })).toEqual({
      tagName: 'i',
      properties: { lang: 'de', className: ['foreign'] },
    });
    expect(markToHast({ name: 'foreign', lang: tag('la') }).properties['className']).toEqual(['locution']);
    expect(markToHast({ name: 'name', category: 'person', lang: undefined })).toEqual({
      tagName: 'span',
      properties: { className: ['proper-name'], translate: 'no' },
    });
    expect(markToHast({ name: 'name', category: 'work', lang: tag('la') })).toEqual({
      tagName: 'cite',
      properties: { className: ['proper-name', 'work'], translate: 'no', lang: 'la' },
    });
    expect(markToHast({ name: 'abbr', title: 'Associação Brasileira de Normas Técnicas' }).properties['title']).toBe(
      'Associação Brasileira de Normas Técnicas',
    );
    expect(markToHast({ name: 'nowrap' }).properties['className']).toEqual(['nowrap']);
    expect(markToHast({ name: 'sc' }).properties['className']).toEqual(['sc']);
    expect(markToHast({ name: 'raw' })).toEqual({ tagName: 'span', properties: {} });
  });

  it('round-trip: a mark → its explicit directive → the same mark', () => {
    const marks: readonly Mark[] = [
      { name: 'foreign', lang: tag('grc-Latn') },
      { name: 'name', category: undefined, lang: undefined },
      { name: 'name', category: 'work', lang: tag('en') },
      { name: 'abbr', title: 'fast Fourier transform' },
      { name: 'abbr', title: undefined },
      { name: 'nowrap' },
      { name: 'sc' },
      { name: 'raw' },
    ];
    for (const mark of marks) {
      const d = markToDirective(mark);
      const back = parseDirectiveMark(d.name, d.attributes);
      expect(back.ok && back.value.mark).toEqual(
        mark.name === 'name' && mark.category !== 'work' ? { ...mark, category: undefined } : mark,
      );
    }
  });

  it('explicit directives are validated (closed language)', () => {
    expect(parseDirectiveMark('foreign', {})).toEqual({ ok: false, error: { kind: 'missing-lang' } });
    expect(parseDirectiveMark('foreign', { lang: 'eng' }).ok).toBe(false);
    expect(parseDirectiveMark('name', { category: 'scientist' }).ok).toBe(false);
    const extra = parseDirectiveMark('sc', { class: 'x' });
    expect(extra.ok && extra.value.warnings).toEqual([{ kind: 'unknown-attribute', attribute: 'class' }]);
  });
});
