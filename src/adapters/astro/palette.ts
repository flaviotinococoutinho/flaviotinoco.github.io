/**
 * Shell: the quick-navigation entries of the command palette for one locale —
 * every entry that is the same on every page of that locale (home, sections,
 * strata, formulas, about, colophon). They are served as /<lang>/palette.json (ADR 0009)
 * and fetched by <ft-command-palette> when the dialog opens; the entry for
 * this page in the other language is page-specific and stays in the HTML
 * (CommandPalette.astro).
 */
import type { PaletteEntry } from '../../core/chrome/palette-entries.ts';
import type { Locale } from '../../core/domain/locale.ts';
import { STRATA, STRATUM_SPECS } from '../../core/domain/strata.ts';
import chrome from '../../core/i18n/catalogs/chrome.ts';
import common from '../../core/i18n/catalogs/common.ts';
import { href, useTranslations } from './i18n.ts';
import type { FormulaRegistry } from '../../core/formulas/index.ts';

export const paletteEntries = (locale: Locale, formulas: FormulaRegistry): readonly PaletteEntry[] => {
  const t = useTranslations(common, locale);
  const c = useTranslations(chrome, locale);
  const page = c('palette.kind.page');
  const section = c('palette.kind.section');
  const entry = (e: Omit<PaletteEntry, 'stratum' | 'hreflang'> & Partial<PaletteEntry>): PaletteEntry => ({
    stratum: null,
    hreflang: null,
    ...e,
  });
  return [
    entry({
      label: c('palette.home'),
      href: href({ kind: 'home' }, locale),
      kind: page,
      keywords: `${t('site.name')} ${t('nav.home')}`,
      glyph: 'simplex-3',
    }),
    entry({
      label: t('nav.essays'),
      href: href({ kind: 'essays' }, locale),
      kind: section,
      keywords: t('form.essay'),
      glyph: 'form-essay',
    }),
    entry({
      label: t('nav.labs'),
      href: href({ kind: 'labs' }, locale),
      kind: section,
      keywords: t('form.lab'),
      glyph: 'form-lab',
    }),
    entry({
      label: t('nav.ontology'),
      href: href({ kind: 'ontology' }, locale),
      kind: section,
      keywords: `${t('form.concept')} ${t('form.map')}`,
      glyph: 'form-map',
    }),
    entry({
      label: t('nav.formulas'),
      href: href({ kind: 'formulas' }, locale),
      kind: section,
      keywords: t('form.formula'),
      glyph: 'form-formula',
    }),
    ...STRATA.map((s) =>
      entry({
        label: t(`strata.${s}`),
        href: href({ kind: 'stratum', stratum: s }, locale),
        kind: c('palette.kind.stratum'),
        keywords: `${t('strata.label')} ${c(`simplex.${STRATUM_SPECS[s].simplex}`)}`,
        glyph: STRATUM_SPECS[s].glyph,
        stratum: s,
      }),
    ),
    entry({
      label: t('nav.about'),
      href: href({ kind: 'about' }, locale),
      kind: page,
      keywords: '',
      glyph: 'form-note',
    }),
    entry({
      label: t('nav.colophon'),
      href: href({ kind: 'colophon' }, locale),
      kind: page,
      keywords: '',
      glyph: 'form-note',
    }),
    ...formulas.formulas.map((f) =>
      entry({
        label: f.name[locale],
        href: href({ kind: 'formula', slug: f.slug[locale] }, locale),
        kind: c('palette.kind.formula'),
        keywords: `${t('form.formula')} ${f.tex}`,
        glyph: STRATUM_SPECS[f.stratum].glyph,
        stratum: f.stratum,
      }),
    ),
  ];
};
