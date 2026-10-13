/**
 * Text keys for matching labels. Three deliberately different equivalences:
 *
 *   labelKey   — authoring lookup (:concept[entropia]): Unicode NFC, locale-aware
 *                lower case, whitespace collapsed, and the typographic forms that
 *                SmartyPants introduces before our stage (’ “ ” – —) folded back
 *                to ASCII. Accents are SIGNIFICANT (pt-BR "sábia"/"sabia" differ).
 *   searchKey  — reader search box: labelKey plus diacritics removed (NFD and
 *                \p{M} stripped), so "informacao" finds "informação".
 *   slugify    — the URL slug a label would produce (ASCII, hyphen-separated),
 *                used to check that each locale's slug comes from its own labels.
 *
 * All three are pure and total; NFC follows UAX #15 (canonical composition).
 */
import type { Locale } from '../domain/locale.ts';

const TYPOGRAPHIC: Readonly<Record<string, string>> = {
  '‘': "'",
  '’': "'",
  'ʼ': "'",
  '“': '"',
  '”': '"',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '–': '-',
  '—': '-',
  '−': '-',
  ' ': ' ',
  ' ': ' ',
};
const TYPOGRAPHIC_RE = /[‘’ʼ“”‐-—−  ]/gu;

/** Key for exact (accent-sensitive, case-insensitive) label lookup in one locale. */
export const labelKey = (label: string, locale: Locale): string =>
  label
    .normalize('NFC')
    .replace(TYPOGRAPHIC_RE, (c) => TYPOGRAPHIC[c] ?? c)
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase(locale);

/** Removes combining marks after canonical decomposition ("ç" → "c"). */
export const stripDiacritics = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** Key for forgiving search: case- and accent-insensitive. */
export const searchKey = (s: string, locale: Locale): string => stripDiacritics(labelKey(s, locale));

/** ASCII slug of a label: "Sentido e referência" → "sentido-e-referencia". */
export const slugify = (label: string): string =>
  stripDiacritics(label.normalize('NFKC'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
