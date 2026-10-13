/**
 * Formatter: model × locale → reader-facing strings.
 *
 * Every word comes from the catalog (src/core/i18n/catalogs/latex.ts); this
 * module only decides which message applies to which model value. Templates
 * with a `{ref}` slot are split into segments so the caller can put a link
 * node in the slot instead of flattening it to text.
 */
import { absurd } from '../algebra/match.ts';
import type { Locale } from '../domain/locale.ts';
import messages from '../i18n/catalogs/latex.ts';
import { format } from '../i18n/messages.ts';
import type { EnvKind, FigureKind, Target, TheoremKind } from './model.ts';

export type LatexMessageKey = keyof (typeof messages)['pt-BR'];

export const message = (locale: Locale, key: LatexMessageKey, params?: Readonly<Record<string, string>>): string =>
  format(messages[locale][key], params);

export const envName = (locale: Locale, kind: EnvKind): string => message(locale, `env.${kind}`);

export const figureName = (locale: Locale, kind: FigureKind): string => message(locale, `figure.${kind}`);

export const equationName = (locale: Locale): string => message(locale, 'equation.name');

/** Text of `:ref[label]` — "Teorema 2", "Figura 1", "Equação (3)". Unnumbered targets have no reference text. */
export const refText = (locale: Locale, target: Target): string | undefined => {
  switch (target.type) {
    case 'environment':
      return message(locale, 'ref.numbered', { name: envName(locale, target.kind), number: target.number });
    case 'figure':
      return message(locale, 'ref.numbered', { name: figureName(locale, target.kind), number: target.number });
    case 'equation':
      return message(locale, 'ref.equation', { name: equationName(locale), number: target.number });
    case 'unnumbered':
      return undefined;
    default:
      return absurd(target);
  }
};

/** Number of a target as it appears in text, or undefined when it has none. */
export const targetNumber = (target: Target): string | undefined =>
  target.type === 'unnumbered' ? undefined : target.number;

/** Text of `:eqref[label]` — "(3)". */
export const eqrefText = (locale: Locale, number: string): string => message(locale, 'ref.eqref', { number });

/** Figure caption label — "Figura 1". */
export const captionLabel = (locale: Locale, kind: FigureKind, number: string): string =>
  message(locale, 'ref.numbered', { name: figureName(locale, kind), number });

export type Segment =
  { readonly type: 'text'; readonly value: string } | { readonly type: 'slot'; readonly name: string };

const SLOT = /\{([a-zA-Z0-9_]+)\}/g;

/** Splits a template into literal text and `{slot}` segments (lossless: joining them back gives the template). */
export const segments = (template: string): readonly Segment[] => {
  const out: Segment[] = [];
  let last = 0;
  for (const match of template.matchAll(SLOT)) {
    const index = match.index;
    if (index > last) out.push({ type: 'text', value: template.slice(last, index) });
    out.push({ type: 'slot', name: match[1] ?? '' });
    last = index + match[0].length;
  }
  if (last < template.length) out.push({ type: 'text', value: template.slice(last) });
  return out;
};

/** "Demonstração do {ref}" / "Proof of {ref}" for the kind of the proved statement. */
export const proofOfTemplate = (locale: Locale, kind: TheoremKind): readonly Segment[] =>
  segments(messages[locale][`proof.of.${kind}`]);

/**
 * Long date from an ISO 8601 calendar date (YYYY-MM-DD), without Date or Intl
 * so the result cannot depend on the host's time zone or ICU data.
 */
export const longDate = (locale: Locale, iso: string): string | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m === null) return undefined;
  const [, year = '', month = '', day = ''] = m;
  const monthKey = MONTHS[Number(month) - 1];
  if (monthKey === undefined) return undefined;
  return message(locale, 'date.long', { day: String(Number(day)), month: message(locale, monthKey), year });
};

const MONTHS = [
  'month.1',
  'month.2',
  'month.3',
  'month.4',
  'month.5',
  'month.6',
  'month.7',
  'month.8',
  'month.9',
  'month.10',
  'month.11',
  'month.12',
] as const satisfies readonly LatexMessageKey[];
