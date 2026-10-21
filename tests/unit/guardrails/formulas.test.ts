/**
 * Every formula has a version in words (ADR 0011), checked against the
 * repository itself: every display equation of the content is labelled, every
 * label is bound to a registered formula of its locale and every registered
 * label is used, and every concept notation has its formula. The registry is
 * built exactly as the build builds it (concepts and bibliography included).
 */
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadBibliography } from '../../../src/adapters/unified/load-bibliography.ts';
import { loadConcepts } from '../../../src/adapters/unified/load-concepts.ts';
import { FORMULAS_DIR, conceptFacts, readRawFormulas } from '../../../src/adapters/unified/load-formulas.ts';
import { LOCALES, type Locale } from '../../../src/core/domain/locale.ts';
import { buildFormulaRegistry, type FormulaRegistry } from '../../../src/core/formulas/index.ts';
import { extractLabels } from '../../../src/core/latex/math-transform.ts';

const ROOT = new URL('../../../', import.meta.url);
const FOLDER_LOCALE: Readonly<Record<string, Locale>> = { pt: 'pt-BR', en: 'en' };

interface Display {
  readonly file: string;
  readonly locale: Locale;
  readonly tex: string;
  readonly labels: readonly string[];
}

/** Every `$$` block of the essays and labs, with its labels. */
const displays = async (): Promise<readonly Display[]> => {
  const out: Display[] = [];
  for (const collection of ['essays', 'labs']) {
    for (const [folder, locale] of Object.entries(FOLDER_LOCALE)) {
      const dir = new URL(`src/content/${collection}/${folder}/`, ROOT);
      for (const name of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
        const text = await readFile(new URL(name, dir), 'utf8');
        for (const m of text.matchAll(/^\$\$\n([\s\S]*?)\n\$\$/gm)) {
          const tex = m[1] ?? '';
          out.push({
            file: `src/content/${collection}/${folder}/${name}`,
            locale,
            tex,
            labels: extractLabels(tex).labels,
          });
        }
      }
    }
  }
  return out;
};

const registry = async (): Promise<FormulaRegistry> => {
  const [concepts, bibliography, raw] = await Promise.all([
    loadConcepts(ROOT),
    loadBibliography(ROOT),
    readRawFormulas(new URL(FORMULAS_DIR, ROOT)),
  ]);
  const built = buildFormulaRegistry(raw, { concepts: conceptFacts(concepts), sources: bibliography });
  if (!built.ok) throw new Error(built.error.join('\n'));
  return built.value;
};

describe('every formula has a version in words', () => {
  it('every display equation of the content carries exactly one \\label', async () => {
    const unlabelled = (await displays()).filter((d) => d.labels.length !== 1).map((d) => `${d.file}: ${d.tex}`);
    expect(unlabelled).toEqual([]);
  });

  it('every label of the content is a registered formula of its locale, and every registered label is used', async () => {
    const reg = await registry();
    const all = await displays();
    for (const locale of LOCALES) {
      const used = new Set(all.filter((d) => d.locale === locale).flatMap((d) => d.labels));
      const registered = new Set<string>(reg.formulas.flatMap((f) => f.labels[locale]));
      expect(
        [...used].filter((l) => !registered.has(l)),
        `${locale}: labels without a formula`,
      ).toEqual([]);
      expect(
        [...registered].filter((l) => !used.has(l)),
        `${locale}: registered labels no document uses`,
      ).toEqual([]);
    }
  });

  it('every concept notation is the formula of exactly one entry of the registry', async () => {
    const [reg, concepts] = await Promise.all([registry(), loadConcepts(ROOT)]);
    const withNotation = concepts.ontology.graph.ids.filter(
      (id) => concepts.ontology.graph.concepts.get(id)?.notation !== null,
    );
    expect(
      withNotation.filter((id) => !reg.byConcept.has(id)),
      'concepts whose notation has no formula',
    ).toEqual([]);
    expect(
      [...reg.byConcept.keys()].filter((id) => !withNotation.includes(id)),
      'formulas bound to concepts without notation',
    ).toEqual([]);
  });

  it('every registered formula names at least one concept (its own or a related one)', async () => {
    const reg = await registry();
    expect(reg.formulas.filter((f) => f.concept === null && f.concepts.length === 0).map((f) => f.id)).toEqual([]);
  });
});
