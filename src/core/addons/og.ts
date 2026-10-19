/**
 * Open Graph cards (pure): which pages have their own 1200×630 share image, where
 * it is published, and the layout tree that satori turns into SVG (the shell,
 * src/adapters/astro/og.ts, rasterises it with resvg).
 *
 * Image per route: home, essays, labs and strata have their own card; every other
 * page (indexes, concepts, about…) shares the home card of its locale, so every
 * page has an og:image. Paths mirror the route codec: the page /pt/ensaios/x/
 * has the card og/pt/ensaios/x.png, the home /pt/ has og/pt.png.
 *
 * Layout (quiet paper, as the pages): the paper and ink of the LIGHT scheme from
 * the design tokens (src/core/design/tokens.json → color.ts, never hard-coded),
 * the stratum shown by its k-simplex glyph AND its label in the stratum colour
 * (never colour alone), the title in Literata, interface text in Atkinson
 * Hyperlegible Next, a hairline above the author line. The glyph geometry is the
 * site sprite's (src/components/Glyphs.astro; a unit test keeps them equal).
 * The tree is plain data in satori's element shape ({ type, props }); text is
 * plain strings, so nothing is ever parsed as markup.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import type { Tokens } from '../design/tokens.ts';
import { STRATA, STRATUM_SPECS, type SimplexDimension, type Stratum } from '../domain/strata.ts';
import type { Route } from '../i18n/routes.ts';
import { tokenHex } from './color.ts';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Upper bound of a card's PNG, checked by the tests and the build adapter. */
export const OG_MAX_BYTES = 60 * 1024;

// ---------------------------------------------------------------- where

/** The route whose card a page uses: its own for home, essays, labs and strata; else the home card. */
export const ogRouteFor = (route: Route): Route => {
  switch (route.kind) {
    case 'home':
    case 'essay':
    case 'lab':
    case 'stratum':
      return route;
    case 'essays':
    case 'labs':
    case 'ontology':
    case 'concept':
    case 'about':
    case 'colophon':
      return { kind: 'home' };
    default:
      return absurd(route);
  }
};

/** Base-relative file of a card, from the encoded route path ("/pt/ensaios/x/" → "og/pt/ensaios/x.png"). */
export const ogImageFile = (routePath: string): string => {
  const trimmed = routePath.replace(/^\/+|\/+$/gu, '');
  return `og/${trimmed === '' ? 'index' : trimmed}.png`;
};

// ---------------------------------------------------------------- what

export type OgPalette = {
  readonly paper: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly rule: string;
  readonly stratum: Readonly<Record<Stratum, string>>;
};

/** The light-scheme colours of the card, from the design tokens (every missing token reported). */
export const ogPalette = (tokens: Tokens): Result<OgPalette, readonly string[]> => {
  const pick = (name: string) => tokenHex(tokens, 'light', name);
  const base = { paper: pick('paper'), ink: pick('ink'), inkMuted: pick('ink-muted'), rule: pick('rule') };
  const strata = STRATA.map((s) => [s, pick(STRATUM_SPECS[s].colorToken)] as const);
  const problems = [...Object.values(base), ...strata.map(([, r]) => r)].flatMap((r) => (r.ok ? [] : [r.error]));
  if (problems.length > 0) return err(problems);
  const value = (r: Result<string, string>): string => (r.ok ? r.value : '');
  return ok({
    paper: value(base.paper),
    ink: value(base.ink),
    inkMuted: value(base.inkMuted),
    rule: value(base.rule),
    stratum: Object.fromEntries(strata.map(([s, r]) => [s, value(r)])) as Record<Stratum, string>,
  });
};

export type OgCard =
  | {
      readonly kind: 'work';
      readonly title: string;
      readonly subtitle?: string;
      readonly stratum: Stratum;
      readonly stratumLabel: string;
      /** "Ensaio", "Laboratório"… shown before the stratum label. */
      readonly formLabel: string;
      /** The author line, e.g. "Flávio Tinoco · 3 de maio de 2026". */
      readonly byline: string;
    }
  | {
      readonly kind: 'stratum';
      readonly title: string;
      /** The guiding question of the stratum. */
      readonly question: string;
      readonly stratum: Stratum;
      /** e.g. "Estrato 3 de 4 · triângulo (2-simplexo)". */
      readonly position: string;
      readonly byline: string;
    }
  | {
      readonly kind: 'home';
      readonly siteName: string;
      readonly tagline: string;
      readonly strata: readonly { readonly stratum: Stratum; readonly label: string }[];
    };

// ---------------------------------------------------------------- how

/** satori's element shape (a subset of React elements: type + props). */
export type OgNode = string | OgElement;
export type OgElement = {
  readonly type: string;
  readonly props: { readonly [key: string]: unknown; readonly children?: OgNode | readonly OgNode[] };
};

export type OgShape =
  | { readonly kind: 'dot'; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: 'line'; readonly d: string; readonly width: number; readonly dash?: string };

/** The k-simplex glyphs of the sprite (src/components/Glyphs.astro), 24-unit grid. */
export const SIMPLEX_SHAPES: Readonly<Record<SimplexDimension, readonly OgShape[]>> = {
  0: [{ kind: 'dot', cx: 12, cy: 12, r: 3.2 }],
  1: [
    { kind: 'line', d: 'M5 17 19 7', width: 1.6 },
    { kind: 'dot', cx: 5, cy: 17, r: 2.2 },
    { kind: 'dot', cx: 19, cy: 7, r: 2.2 },
  ],
  2: [
    { kind: 'line', d: 'M12 4.5 20 18.5H4Z', width: 1.6 },
    { kind: 'dot', cx: 12, cy: 4.5, r: 2 },
    { kind: 'dot', cx: 20, cy: 18.5, r: 2 },
    { kind: 'dot', cx: 4, cy: 18.5, r: 2 },
  ],
  3: [
    { kind: 'line', d: 'M12 3.5 20.5 17 13.5 20.5 3.5 16Z M12 3.5 13.5 20.5', width: 1.6 },
    { kind: 'line', d: 'M3.5 16 20.5 17', width: 1.1, dash: '1.6 1.8' },
    { kind: 'dot', cx: 12, cy: 3.5, r: 1.8 },
    { kind: 'dot', cx: 20.5, cy: 17, r: 1.8 },
    { kind: 'dot', cx: 13.5, cy: 20.5, r: 1.8 },
    { kind: 'dot', cx: 3.5, cy: 16, r: 1.8 },
  ],
};

const el = (type: string, style: Readonly<Record<string, unknown>>, children: readonly OgNode[] = []): OgElement => ({
  type,
  props: { style, children: children.length === 1 ? (children[0] as OgNode) : [...children] },
});

export const glyph = (stratum: Stratum, color: string, size: number): OgElement => ({
  type: 'svg',
  props: {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    style: { flexShrink: 0 },
    children: SIMPLEX_SHAPES[STRATUM_SPECS[stratum].simplex].map((s): OgElement =>
      s.kind === 'dot'
        ? { type: 'circle', props: { cx: s.cx, cy: s.cy, r: s.r, fill: color } }
        : {
            type: 'path',
            props: {
              d: s.d,
              fill: 'none',
              stroke: color,
              strokeWidth: s.width,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              ...(s.dash !== undefined ? { strokeDasharray: s.dash } : {}),
            },
          },
    ),
  },
});

/** Title size by length (characters): long titles get smaller type so three lines suffice. */
export const titleSize = (title: string): number => {
  const n = [...title].length;
  return n <= 40 ? 72 : n <= 70 ? 64 : n <= 110 ? 54 : 46;
};

const INNER = { width: OG_WIDTH - 2 * 80, height: OG_HEIGHT - 2 * 64 };

const page = (palette: OgPalette, children: readonly OgNode[]): OgElement =>
  el(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      boxSizing: 'border-box',
      padding: '64px 80px',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: palette.paper,
      color: palette.ink,
      fontFamily: 'Literata',
    },
    children,
  );

const kicker = (palette: OgPalette, stratum: Stratum, text: string): OgElement =>
  el(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      width: INNER.width,
      fontFamily: 'Atkinson Hyperlegible Next',
      fontSize: 28,
      fontWeight: 700,
      color: palette.stratum[stratum],
    },
    [glyph(stratum, palette.stratum[stratum], 48), el('div', { marginLeft: 16 }, [text])],
  );

const body = (palette: OgPalette, title: string, sub: string | undefined): OgElement =>
  el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
      width: INNER.width,
    },
    [
      el(
        'div',
        {
          display: 'block',
          width: INNER.width,
          fontSize: titleSize(title),
          fontWeight: 600,
          lineHeight: 1.15,
          lineClamp: 3,
        },
        [title],
      ),
      ...(sub === undefined || sub === ''
        ? []
        : [
            el(
              'div',
              {
                display: 'block',
                width: INNER.width,
                marginTop: 24,
                fontSize: 34,
                fontWeight: 400,
                lineHeight: 1.3,
                color: palette.inkMuted,
                lineClamp: 2,
              },
              [sub],
            ),
          ]),
    ],
  );

const footer = (palette: OgPalette, children: readonly OgNode[]): OgElement =>
  el(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
      width: INNER.width,
      paddingTop: 24,
      borderTop: `2px solid ${palette.rule}`,
      fontFamily: 'Atkinson Hyperlegible Next',
      fontSize: 26,
      fontWeight: 700,
      color: palette.ink,
    },
    children,
  );

/** The layout tree of a card. */
export const ogLayout = (card: OgCard, palette: OgPalette): OgElement => {
  switch (card.kind) {
    case 'work':
      return page(palette, [
        kicker(palette, card.stratum, `${card.formLabel} · ${card.stratumLabel}`),
        body(palette, card.title, card.subtitle),
        footer(palette, [card.byline]),
      ]);
    case 'stratum':
      return page(palette, [
        kicker(palette, card.stratum, card.position),
        body(palette, card.title, card.question),
        footer(palette, [card.byline]),
      ]);
    case 'home':
      return page(palette, [
        body(palette, card.siteName, card.tagline),
        footer(
          palette,
          card.strata.map((s, i) =>
            el(
              'div',
              {
                display: 'flex',
                alignItems: 'center',
                marginLeft: i === 0 ? 0 : 40,
                fontWeight: 400,
                color: palette.stratum[s.stratum],
              },
              [glyph(s.stratum, palette.stratum[s.stratum], 36), el('div', { marginLeft: 10 }, [s.label])],
            ),
          ),
        ),
      ]);
    default:
      return absurd(card);
  }
};
