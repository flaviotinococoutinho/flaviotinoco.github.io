/**
 * Share cards — the 1200 × 630 image a link to the site shows when it is pasted into a chat or a social
 * network (Open Graph `og:image`; X `summary_large_image`). Pure: this module only describes the card as
 * a tree of boxes and texts; the shell (src/adapters/astro/card.ts) hands the tree to satori, which lays
 * it out with the card fonts, and to resvg, which rasterises it.
 *
 * What a card says, in reading order: the stratum (its simplex glyph and its name, never colour alone),
 * the passage to the next stratum, the form of the work; the title; the description; the site and the
 * work's disciplines. A lab card also draws the lab's own thumbnail (src/core/labs/thumbnails.ts).
 * Long texts are cut at a word with an ellipsis, so a card never overflows whatever the title.
 */
import { absurd } from '../algebra/match.ts';
import { localeCodec, type Locale } from '../domain/locale.ts';
import type { Stratum } from '../domain/strata.ts';
import type { Thumbnail } from '../labs/thumbnails.ts';
import { simplexOf } from './room.ts';

export const CARD = { width: 1200, height: 630 } as const;

/** Characters a card shows of each text (at the sizes below, about three lines of title and three of description). */
export const TITLE_MAX = 90;
export const DESCRIPTION_MAX = 170;
/** Characters of the footer's list of disciplines, beside the site's name. */
export const DISCIPLINES_MAX = 76;

export const CARD_KINDS = ['essay', 'lab', 'site'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** Public path of a card, relative to the site base: `<lang>/card/<kind>/<slug>.png`. */
export const cardPath = (locale: Locale, kind: CardKind, slug: string): string =>
  `${localeCodec.encode(locale)}/card/${kind}/${slug}.png`;

export interface CardPalette {
  readonly paper: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkSubtle: string;
  readonly rule: string;
  readonly ruleStrong: string;
  readonly strata: Readonly<Record<Stratum, string>>;
}

export interface CardInput {
  readonly kind: CardKind;
  readonly title: string;
  readonly description: string;
  readonly siteName: string;
  /** "Ensaio", "Laboratório"; null for the site card. */
  readonly form: string | null;
  readonly stratum: Stratum | null;
  /** The stratum's name and, when the work crosses to the next one, the passage ("Formal → Valor"). */
  readonly stratumLabel: string | null;
  readonly passage: string | null;
  readonly disciplines: readonly string[];
  readonly thumbnail: Thumbnail | null;
  /** The site card shows the whole bridge instead: each stratum's glyph and name, in order. */
  readonly bridge: readonly { readonly stratum: Stratum; readonly label: string }[];
}

/** A node of the tree satori lays out (the shape of a React element, without React). */
export interface CardNode {
  readonly type: 'div' | 'img';
  readonly props: {
    readonly style?: Readonly<Record<string, string | number>>;
    readonly src?: string;
    readonly width?: number;
    readonly height?: number;
    readonly children?: string | readonly CardNode[];
  };
}

/**
 * The text cut to at most `max` characters, at the last word boundary, with an ellipsis; whitespace runs
 * collapsed. Total: an empty or short text is returned as it is.
 */
export const truncate = (text: string, max: number): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(' ');
  const head = (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/u, '');
  return `${head}…`;
};

/** As many items as fit in `max` characters, joined by `separator`; whole items only, never a cut word. */
export const joinUpTo = (items: readonly string[], separator: string, max: number): string => {
  let shown = items[0] ?? '';
  for (const item of items.slice(1)) {
    const next = `${shown}${separator}${item}`;
    if (next.length > max) break;
    shown = next;
  }
  return shown;
};

/** The simplex of a stratum as a standalone SVG (the glyphs of src/components/Glyphs.astro). */
export const glyphSvg = (stratum: Stratum, color: string): string => {
  const dot = (x: number, y: number, r: number): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
  const line = (d: string, width = 1.6, dash = ''): string =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash === '' ? '' : ` stroke-dasharray="${dash}"`}/>`;
  const body = ((): string => {
    const k = simplexOf(stratum);
    switch (k) {
      case 0:
        return dot(12, 12, 3.2);
      case 1:
        return line('M5 17 19 7') + dot(5, 17, 2.2) + dot(19, 7, 2.2);
      case 2:
        return line('M12 4.5 20 18.5H4Z') + dot(12, 4.5, 2) + dot(20, 18.5, 2) + dot(4, 18.5, 2);
      case 3:
        return (
          line('M12 3.5 20.5 17 13.5 20.5 3.5 16Z M12 3.5 13.5 20.5') +
          line('M3.5 16 20.5 17', 1.1, '1.6 1.8') +
          dot(12, 3.5, 1.8) +
          dot(20.5, 17, 1.8) +
          dot(13.5, 20.5, 1.8) +
          dot(3.5, 16, 1.8)
        );
      default:
        return absurd(k);
    }
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">${body}</svg>`;
};

/** A lab thumbnail as a standalone SVG, with the stroke and fill of each role (labs.css, .lab-thumb__*). */
export const thumbnailSvg = (t: Thumbnail, accent: string, palette: CardPalette): string => {
  const paint = (role: Thumbnail['shapes'][number]['role']): string => {
    switch (role) {
      case 'axis':
        return `fill="none" stroke="${palette.ruleStrong}" stroke-width="1"`;
      case 'reference':
        return `fill="none" stroke="${palette.inkMuted}" stroke-width="1" stroke-dasharray="4 3"`;
      case 'curve':
        return `fill="none" stroke="${accent}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`;
      case 'accent':
        return `fill="none" stroke="${palette.ink}" stroke-width="1.25" stroke-linecap="round"`;
      case 'bars':
      case 'points':
        return `fill="${accent}" stroke="none"`;
      default:
        return absurd(role);
    }
  };
  const paths = t.shapes.map((s) => `<path d="${s.d}" ${paint(s.role)}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.width} ${t.height}" width="${t.width * 2}" height="${t.height * 2}">${paths}</svg>`;
};

export const svgDataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const text = (content: string, style: Readonly<Record<string, string | number>>): CardNode => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children: content },
});

const box = (style: Readonly<Record<string, string | number>>, children: readonly CardNode[]): CardNode => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

/** The card as a tree of boxes: fonts are named "Literata" (titles) and "Atkinson" (the rest). */
export const cardTree = (input: CardInput, palette: CardPalette): CardNode => {
  const accent = input.stratum === null ? palette.ink : palette.strata[input.stratum];
  const kicker: CardNode[] = [];
  if (input.stratum !== null) {
    kicker.push({
      type: 'img',
      props: { src: svgDataUri(glyphSvg(input.stratum, accent)), width: 44, height: 44 },
    });
  }
  const kickerText = [input.stratumLabel, input.passage].filter((s): s is string => s !== null && s !== '');
  if (kickerText.length > 0) kicker.push(text(kickerText.join('  ·  '), { color: palette.inkMuted }));
  for (const { stratum, label } of input.bridge) {
    kicker.push(
      box({ alignItems: 'center', gap: 10, marginRight: 18 }, [
        { type: 'img', props: { src: svgDataUri(glyphSvg(stratum, palette.strata[stratum])), width: 40, height: 40 } },
        text(label, { color: palette.inkMuted }),
      ]),
    );
  }
  if (input.form !== null) kicker.push(text(input.form, { marginLeft: 'auto', color: palette.inkMuted }));

  const words: CardNode = box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 24 }, [
    text(truncate(input.title, TITLE_MAX), {
      fontFamily: 'Literata',
      fontSize: input.kind === 'site' ? 60 : 62,
      lineHeight: 1.12,
      color: palette.ink,
      letterSpacing: -0.5,
    }),
    text(truncate(input.description, DESCRIPTION_MAX), { fontSize: 28, lineHeight: 1.38, color: palette.inkMuted }),
  ]);
  const middle: CardNode =
    input.thumbnail === null
      ? box({ flexGrow: 1 }, [words])
      : box({ flexGrow: 1, gap: 48, alignItems: 'flex-start' }, [
          words,
          box({ flexShrink: 0, padding: 16, border: `2px solid ${palette.rule}`, borderRadius: 4 }, [
            {
              type: 'img',
              props: {
                src: svgDataUri(thumbnailSvg(input.thumbnail, accent, palette)),
                width: 320,
                height: Math.round((320 * input.thumbnail.height) / input.thumbnail.width),
              },
            },
          ]),
        ]);

  const footer = box({ alignItems: 'baseline', gap: 24, paddingTop: 24, borderTop: `2px solid ${palette.rule}` }, [
    text(input.siteName, { fontFamily: 'Literata', fontSize: 34, color: palette.ink }),
    text(joinUpTo(input.disciplines, '  ·  ', DISCIPLINES_MAX), { fontSize: 22, color: palette.inkSubtle }),
  ]);

  return box(
    {
      width: CARD.width,
      height: CARD.height,
      backgroundColor: palette.paper,
      fontFamily: 'Atkinson',
      fontSize: 26,
    },
    [
      // The stratum's band: its glyph and name are in the kicker, so the colour is never alone.
      box({ width: 14, height: CARD.height, backgroundColor: accent }, []),
      box({ flexDirection: 'column', flexGrow: 1, padding: '56px 72px 52px 64px', gap: 36 }, [
        box({ alignItems: 'center', gap: 16, minHeight: 44 }, kicker),
        middle,
        footer,
      ]),
    ],
  );
};
