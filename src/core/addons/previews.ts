/**
 * Link previews — the per-locale index of essays and labs that <ft-link-preview>
 * fetches once, on the first hover or focus of an internal link (pure).
 *
 * Built at build time (src/pages/[lang]/previews.json.ts) from the content
 * collections; parsed back in the browser with parsePreviewIndex ("parse, don't
 * validate": a fetched JSON document is untrusted input), so a stale or corrupt
 * file degrades to "no preview", never to an exception or to injected markup.
 * Keys are URL paths (base path included, trailing slash), exactly what
 * `new URL(a.href).pathname` gives for a link to the page.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { isStratum, type Stratum } from '../domain/strata.ts';

export const PREVIEW_INDEX_VERSION = 1;

export type PreviewForm = 'essay' | 'lab';

export type Preview = {
  readonly title: string;
  readonly description: string;
  readonly stratum: Stratum;
  /** Localised stratum label (shown next to the simplex glyph; never colour alone). */
  readonly stratumLabel: string;
  readonly form: PreviewForm;
  /** Localised form label ("Ensaio", "Laboratório"). */
  readonly formLabel: string;
  /** Reading time in minutes, already formatted for the locale ("12 min de leitura"), or null. */
  readonly time: string | null;
  /** BCP 47 language of the target page. */
  readonly lang: string;
};

export type PreviewIndex = {
  readonly version: typeof PREVIEW_INDEX_VERSION;
  readonly items: Readonly<Record<string, Preview>>;
};

/** Index with keys in code-unit order, so the emitted JSON is a function of the set of pages. */
export const previewIndex = (entries: readonly (readonly [path: string, preview: Preview])[]): PreviewIndex => {
  const items: Record<string, Preview> = {};
  for (const [path, preview] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) items[path] = preview;
  return { version: PREVIEW_INDEX_VERSION, items };
};

const string = (v: unknown): v is string => typeof v === 'string';

const parsePreview = (v: unknown, key: string): Result<Preview, string> => {
  if (typeof v !== 'object' || v === null) return err(`${key}: not an object`);
  const o = v as Readonly<Record<string, unknown>>;
  const { title, description, stratum, stratumLabel, form, formLabel, time, lang } = o;
  if (!string(title) || !string(description) || !string(stratumLabel) || !string(formLabel) || !string(lang))
    return err(`${key}: missing text fields`);
  if (!isStratum(stratum)) return err(`${key}: unknown stratum ${show(stratum)}`);
  if (form !== 'essay' && form !== 'lab') return err(`${key}: unknown form ${show(form)}`);
  if (time !== null && !string(time)) return err(`${key}: time must be text or null`);
  return ok({ title, description, stratum, stratumLabel, form, formLabel, time, lang });
};

/** Untrusted JSON → index. Entries that do not parse are dropped (a preview is optional). */
export const parsePreviewIndex = (v: unknown): Result<PreviewIndex, string> => {
  if (typeof v !== 'object' || v === null) return err('the preview index is not an object');
  const o = v as Readonly<Record<string, unknown>>;
  if (o['version'] !== PREVIEW_INDEX_VERSION) return err(`unsupported preview index version ${show(o['version'])}`);
  const raw = o['items'];
  if (typeof raw !== 'object' || raw === null) return err('the preview index has no items');
  const items: Record<string, Preview> = {};
  for (const [key, value] of Object.entries(raw)) {
    const p = parsePreview(value, key);
    if (p.ok && key.startsWith('/')) items[key] = p.value;
  }
  return ok({ version: PREVIEW_INDEX_VERSION, items });
};

/**
 * The index key of a link, or null when the link cannot have a preview: another
 * origin, the current page itself (an in-page fragment), or a target outside
 * the index. `href` is the resolved URL of the link, `page` the URL of the document.
 */
export const previewKey = (href: string, page: string, index: PreviewIndex): string | null => {
  let target: URL;
  let here: URL;
  try {
    target = new URL(href, page);
    here = new URL(page);
  } catch {
    return null;
  }
  if (target.origin !== here.origin) return null;
  const path = target.pathname.endsWith('/') ? target.pathname : `${target.pathname}/`;
  if (path === (here.pathname.endsWith('/') ? here.pathname : `${here.pathname}/`)) return null;
  return Object.hasOwn(index.items, path) ? path : null;
};

export type Box = { readonly top: number; readonly left: number; readonly width: number; readonly height: number };

/**
 * Where to put the card (viewport coordinates): below the link, left-aligned with
 * it, kept inside the viewport with a margin; above the link when there is no
 * room below. The card never covers the link itself, so the pointer can travel
 * from the link to the card (WCAG 2.2 SC 1.4.13 "hoverable").
 */
export const placePreview = (
  link: Box,
  card: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  gap = 8,
  margin = 8,
): { readonly top: number; readonly left: number } => {
  const below = link.top + link.height + gap;
  const above = link.top - gap - card.height;
  const fitsBelow = below + card.height <= viewport.height - margin;
  const top = fitsBelow || above < margin ? below : above;
  const maxLeft = Math.max(margin, viewport.width - margin - card.width);
  const left = Math.min(Math.max(link.left, margin), maxLeft);
  return { top, left };
};
