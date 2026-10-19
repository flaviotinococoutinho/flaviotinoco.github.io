import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parseNames, type Name } from '../../../src/core/bibliography/bibtex/names.ts';

/** Compact view: family|given|particle|suffix, or {corporate}. */
const show = (n: Name): string =>
  n.kind === 'corporate'
    ? `{${n.name.text}}`
    : [n.family.text, n.given?.text ?? '', n.particle?.text ?? '', n.suffix?.text ?? ''].join('|');

const names = (raw: string): readonly string[] => parseNames(raw).value.names.map(show);

describe('parseNames', () => {
  it.each([
    ['Shannon, Claude Elwood', ['Shannon|Claude Elwood||']],
    ['Claude Elwood Shannon', ['Shannon|Claude Elwood||']],
    ['Jo{\\~a}o da Silva', ['Silva|João|da|']],
    ['da Silva, Jo{\\~a}o', ['Silva|João|da|']],
    ['Silva, Jo{\\~a}o da', ['Silva|João da||']],
    ['Ludwig van Beethoven', ['Beethoven|Ludwig|van|']],
    ['van der Waals, Johannes Diderik', ['Waals|Johannes Diderik|van der|']],
    ['Ford, Jr., Henry', ['Ford|Henry||Jr.']],
    ['Assaf Neto, Alexandre', ['Assaf Neto|Alexandre||']],
    ['{World Wide Web Consortium}', ['{World Wide Web Consortium}']],
    ["{Associa{\\c c}{\\~a}o Brasileira de Normas T{\\'e}cnicas}", ['{Associação Brasileira de Normas Técnicas}']],
    ['Per Brinch~Hansen', ['Brinch\u00A0Hansen|Per||']],
    [
      "Charles Louis Xavier Joseph de la Vall{\\'e}e~Poussin",
      ['Vallée\u00A0Poussin|Charles Louis Xavier Joseph|de la|'],
    ],
    ["{\\'E}mile Durkheim", ['Durkheim|Émile||']],
    ['De la Fontaine, Jean', ['De la Fontaine|Jean||']],
    ['Della Robbia, Luca', ['Della Robbia|Luca||']],
    ['Luca della Robbia', ['Robbia|Luca|della|']],
    ["{L{\\'o}pez de M{\\'a}ntaras}, Ram{\\'o}n", ['López de Mántaras|Ramón||']],
    ['Plato', ['Plato|||']],
    ['Brayner, A. R. A. and Medeiros, C. B.', ['Brayner|A. R. A.||', 'Medeiros|C. B.||']],
    ['Doe, J. AND Roe, R.', ['Doe|J.||', 'Roe|R.||']],
    ['Jean-Paul Sartre', ['Sartre|Jean-Paul||']],
  ])('%s', (raw, expected) => {
    expect(names(raw)).toEqual(expected);
  });

  it('turns a final "and others" into the et al. flag', () => {
    const r = parseNames('A. Smith and B. Jones and others');
    expect(r.value.others).toBe(true);
    expect(r.value.names).toHaveLength(2);
  });

  it('records "and" inside braces as part of a name', () => {
    expect(names('{Barnes and Noble}')).toEqual(['{Barnes and Noble}']);
  });

  it('reports empty names, too many commas and a misplaced "others" as errors', () => {
    expect(parseNames('A and and B').problems.map((p) => p.code)).toEqual(['name:empty']);
    expect(parseNames('a, b, c, d').problems.map((p) => p.code)).toEqual(['name:too-many-commas']);
    expect(parseNames('others and B').problems.map((p) => p.code)).toEqual(['name:misplaced-others']);
    expect(parseNames(', First').problems.map((p) => p.code)).toEqual(['name:empty']);
  });

  it('returns an empty list for an empty field', () => {
    expect(parseNames('  ').value).toEqual({ names: [], others: false });
  });

  test.prop([fc.string({ maxLength: 80 })], { numRuns: 500 })('never throws on arbitrary strings', (raw) => {
    expect(() => parseNames(raw)).not.toThrow();
  });

  test.prop(
    [
      fc.array(fc.tuple(fc.stringMatching(/^[A-Z][a-z]{1,8}$/), fc.stringMatching(/^[A-Z][a-z]{1,8}$/)), {
        minLength: 1,
        maxLength: 5,
      }),
    ],
    { numRuns: 200 },
  )('"Last, First" lists round-trip', (people) => {
    const raw = people.map(([last, first]) => `${last}, ${first}`).join(' and ');
    expect(names(raw)).toEqual(people.map(([last, first]) => `${last}|${first}||`));
  });
});
