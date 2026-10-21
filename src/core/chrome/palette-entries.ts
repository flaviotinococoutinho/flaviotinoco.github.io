/**
 * Quick-navigation entries of the command palette — the data behind
 * /<lang>/palette.json (ADR 0009: chrome on demand).
 *
 *   encode : readonly PaletteEntry[] → string          (build time, one file per locale)
 *   decode : unknown → Result<readonly PaletteEntry[]>  (browser, when the palette opens)
 *   law    : decode(JSON.parse(encode(xs))) = ok(xs)    (tests/unit/chrome/chrome-data.test.ts)
 *
 * The entries used to be rendered as a list of links inside the palette dialog
 * of every page (≈ 6.7 KiB of HTML that only works with JavaScript). They are
 * now fetched by <ft-command-palette>, which the islands registry loads only
 * when the dialog opens; the page-specific entry (this page in the other
 * language) stays in the HTML, since it is not the same on every page.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { isLocale, type Locale } from '../domain/locale.ts';
import { isStratum, type Stratum } from '../domain/strata.ts';

export const PALETTE_ENTRIES_VERSION = 1;

export interface PaletteEntry {
  readonly label: string;
  /** Base-aware URL (absolute path). */
  readonly href: string;
  /** Localised kind shown beside the label ("Página", "Seção", "Estrato"). */
  readonly kind: string;
  /** Extra searchable words (synonyms, the other language's name). */
  readonly keywords: string;
  /** Id of a symbol of the glyph sprite (Glyphs.astro). */
  readonly glyph: string;
  readonly stratum: Stratum | null;
  readonly hreflang: Locale | null;
}

export interface PaletteEntriesDocument {
  readonly version: number;
  readonly entries: readonly PaletteEntry[];
}

export const encodePaletteEntries = (entries: readonly PaletteEntry[]): string =>
  JSON.stringify({ version: PALETTE_ENTRIES_VERSION, entries } satisfies PaletteEntriesDocument);

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown): v is string => typeof v === 'string';

const parseEntry = (v: unknown, index: number): Result<PaletteEntry, string> => {
  if (!isRecord(v)) return err(`entry ${index}: not an object (${show(v)})`);
  const { label, href, kind, keywords, glyph, stratum, hreflang } = v;
  if (!text(label) || label.length === 0) return err(`entry ${index}: label must be a non-empty string`);
  if (!text(href) || href.length === 0) return err(`entry ${index}: href must be a non-empty string`);
  if (!text(kind)) return err(`entry ${index}: kind must be a string`);
  if (!text(keywords)) return err(`entry ${index}: keywords must be a string`);
  if (!text(glyph) || glyph.length === 0) return err(`entry ${index}: glyph must be a non-empty string`);
  if (stratum !== null && !isStratum(stratum)) return err(`entry ${index}: unknown stratum ${show(stratum)}`);
  if (hreflang !== null && !isLocale(hreflang)) return err(`entry ${index}: unknown hreflang ${show(hreflang)}`);
  return ok({ label, href, kind, keywords, glyph, stratum, hreflang });
};

/** Decodes a palette.json payload; any malformed entry fails the whole document (never a partial list). */
export const decodePaletteEntries = (raw: unknown): Result<readonly PaletteEntry[], string> => {
  if (!isRecord(raw) || raw['version'] !== PALETTE_ENTRIES_VERSION || !Array.isArray(raw['entries'])) {
    return err('malformed palette entries payload');
  }
  const entries: PaletteEntry[] = [];
  for (const [index, v] of (raw['entries'] as readonly unknown[]).entries()) {
    const parsed = parseEntry(v, index);
    if (!parsed.ok) return parsed;
    entries.push(parsed.value);
  }
  return ok(entries);
};
