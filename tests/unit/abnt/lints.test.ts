import { describe, expect, it } from 'vitest';
import type { DocBlock, DocView, Occurrence } from '../../../src/core/abnt/document.ts';
import { runLints } from '../../../src/core/abnt/engine.ts';
import { ABNT_RULES, LINT_RULES } from '../../../src/core/abnt/rules.ts';
import type { AcronymEntry, HomographEntry } from '../../../src/core/lexicon/types.ts';
import { loadFixtureLexicon } from '../lexicon/helpers.ts';

const lexicon = loadFixtureLexicon();
const entry = <T>(term: string): T => lexicon.entries.find((e) => e.term === term) as T;

let anchor = 0;
const block = (
  text: string,
  occurrences: readonly Occurrence[] = [],
  kind: DocBlock['kind'] = 'paragraph',
): DocBlock => ({
  kind,
  anchor: anchor++,
  text,
  occurrences,
});
const doc = (blocks: readonly DocBlock[], locale: DocView['locale'] = 'pt-BR'): DocView => ({ locale, blocks });
const ids = (d: DocView): readonly string[] => runLints(d).map((f) => `${f.ruleId}:${f.message}`);

const acronym = (term: string, start: number): Occurrence => ({
  kind: 'acronym',
  anchor: anchor++,
  start,
  end: start + term.length,
  term,
  entry: entry<AcronymEntry>(term),
  title: undefined,
});

describe('lint rules (report, never rewrite)', () => {
  it('every rule is documented data: id, references, description, locales', () => {
    for (const r of ABNT_RULES) {
      expect(r.id).toMatch(/^[A-Z]+(-[A-Z0-9]+)+$/u);
      expect(r.references.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(10);
      expect(r.appliesTo.length).toBeGreaterThan(0);
    }
    expect(new Set(ABNT_RULES.map((r) => r.id)).size).toBe(ABNT_RULES.length);
  });

  it('CIT-02: period inside the quotation before the call', () => {
    expect(ids(doc([block('“Não se mova, faça de conta que está morta.” (Clarac; Bonnin, 1985, p. 72).')]))).toEqual([
      'CIT-02:lint.cit02',
    ]);
    expect(ids(doc([block('“Não se mova, faça de conta que está morta” (Clarac; Bonnin, 1985, p. 72).')]))).toEqual([]);
    expect(ids(doc([block('“Quem sou eu?” (Silva, 2001, p. 3).')]))).toEqual([]);
  });

  it('CIT-23: grifo/tradução placement, deprecated and non-normative forms', () => {
    expect(ids(doc([block('(Souto, 1916, p. 46, grifo nosso)')]))).toEqual([]);
    expect(ids(doc([block('(Brody; Harnad, 2004, p. 2, tradução nossa, grifo nosso)')]))).toEqual([]);
    expect(ids(doc([block('(Souto, 1916, grifo nosso, p. 46)')]))).toEqual(['CIT-23:lint.cit23.last']);
    expect(ids(doc([block('(Brody, 2004, tradução nossa, p. 2)')]))).toEqual(['CIT-23:lint.cit23.order']);
    expect(ids(doc([block('(Souto, 1916, p. 46, grifo do autor)')]))).toEqual(['CIT-23:lint.cit23.author']);
    expect(ids(doc([block('(Souto, 1916, p. 46, destaque nosso)')]))).toEqual(['CIT-23:lint.cit23.notInNorm']);
    expect(ids(doc([block('(Souto, 1916, p. 46) (grifo nosso)')]))).toEqual(['CIT-23:lint.cit23.outside']);
  });

  it('CIT-11: one et al. policy per document', () => {
    const etAl = block('Moura et al. (2018) mostram…');
    const full = block('(Moura; Torres; Cadete; Cunha, 2018)');
    expect(ids(doc([etAl]))).toEqual([]);
    expect(ids(doc([full]))).toEqual([]);
    const both = runLints(doc([etAl, full]));
    expect(both.map((f) => f.ruleId)).toEqual(['CIT-11']);
    expect(both[0]?.anchor).toBe(full.anchor);
    expect(ids(doc([block('Moura, Torres, Cadete e Cunha (2018) e (Silva et al., 2020)')]))).toEqual([
      'CIT-11:lint.cit11.mixed',
    ]);
  });

  it('ACAD-06: first use of an acronym needs its full form in the same paragraph; headings do not count', () => {
    const heading = block('A FFT', [acronym('FFT', 2)], 'heading');
    const bare = block('Usamos a FFT.', [acronym('FFT', 9)]);
    const expanded = block('A transformada rápida de Fourier (FFT) e a FFT.', [acronym('FFT', 34), acronym('FFT', 42)]);
    expect(ids(doc([heading, bare]))).toEqual(['ACAD-06:lint.acad06.firstUseForeign']);
    expect(ids(doc([heading, expanded, bare]))).toEqual([]);
    expect(ids(doc([block('Fast Fourier Transform (FFT).', [acronym('FFT', 24)])]))).toEqual([]);
    expect(ids(doc([block('A ABNT.', [acronym('ABNT', 2)])]))).toEqual(['ACAD-06:lint.acad06.firstUse']);
    const en = runLints(doc([block('The ABNT.', [acronym('ABNT', 4)])], 'en'));
    expect(en.map((f) => f.message)).toEqual(['lint.acad06.firstUseForeign']);
    expect(en[0]?.params['original']).toBe('Associação Brasileira de Normas Técnicas');
  });

  it('LEX-HOMOGRAPH: one finding per homograph per document, with its count', () => {
    const data = entry<HomographEntry>('data');
    const hit = (start: number): Occurrence => ({
      kind: 'homograph',
      anchor: anchor++,
      start,
      end: start + 4,
      surface: 'data',
      entry: data,
    });
    const findings = runLints(doc([block('a data e a data', [hit(2), hit(11)]), block('data', [hit(0)])]));
    expect(findings.map((f) => [f.ruleId, f.params['count']])).toEqual([['LEX-HOMOGRAPH', 3]]);
  });

  it('rules are filtered by locale: the NBR 10520 citation lints are pt-BR only', () => {
    const quote = block('“está morta.” (Clarac; Bonnin, 1985, p. 72).');
    expect(ids(doc([quote], 'en'))).toEqual([]);
    expect(LINT_RULES.filter((r) => r.appliesTo.includes('en')).map((r) => r.id)).toEqual([
      'ACAD-06',
      'LEX-HOMOGRAPH',
      'LEX-HAND-ITALIC',
    ]);
  });
});
