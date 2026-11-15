/**
 * Share cards (src/core/chrome/card.ts) and the OKLCH → sRGB conversion they use (src/core/design/oklch.ts).
 */
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  CARD,
  DESCRIPTION_MAX,
  TITLE_MAX,
  cardPath,
  cardTree,
  glyphSvg,
  joinUpTo,
  truncate,
  type CardInput,
  type CardNode,
  type CardPalette,
} from '../../../src/core/chrome/card.ts';
import { hexOf, oklchToSrgb } from '../../../src/core/design/oklch.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import { thumbnail } from '../../../src/core/labs/thumbnails.ts';

const palette: CardPalette = {
  paper: '#f9f6f2',
  ink: '#2b2622',
  inkMuted: '#4a443e',
  inkSubtle: '#6a645e',
  rule: '#d8d2ca',
  ruleStrong: '#8a847e',
  strata: { philosophy: '#22306b', theory: '#1d4f6e', formal: '#126e5f', value: '#b5482f' },
};

const input = (over: Partial<CardInput> = {}): CardInput => ({
  kind: 'essay',
  title: 'O pipeline não cria informação',
  description: 'Um pipeline de ETL lido como cadeia de Markov.',
  siteName: 'Flávio Tinoco',
  form: 'Ensaio',
  stratum: 'formal',
  stratumLabel: 'Formal',
  passage: 'Passagem de Formal para Valor',
  disciplines: ['Engenharia de dados e ETL', 'Teoria da informação'],
  thumbnail: null,
  bridge: [],
  ...over,
});

/** Every string the card shows, in document order. */
const texts = (node: CardNode): readonly string[] =>
  typeof node.props.children === 'string'
    ? [node.props.children]
    : (node.props.children ?? []).flatMap((child) => texts(child));

const images = (node: CardNode): readonly CardNode[] =>
  node.type === 'img'
    ? [node]
    : typeof node.props.children === 'string'
      ? []
      : (node.props.children ?? []).flatMap(images);

describe('OKLCH → sRGB', () => {
  test.prop([
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 0.12, noNaN: true }),
    fc.double({ min: 0, max: 359.99, noNaN: true }),
  ])('agrees with colorjs.io within one 8-bit step wherever the colour is in gamut', (l, c, h) => {
    const reference = new Color('oklch', [l, c, h]);
    fc.pre(reference.inGamut('srgb'));
    const [r, g, b] = oklchToSrgb([l, c, h]);
    const [er = 0, eg = 0, eb = 0] = reference.to('srgb').coords.map((x) => x ?? 0);
    expect(Math.abs(r - er)).toBeLessThan(1 / 255);
    expect(Math.abs(g - eg)).toBeLessThan(1 / 255);
    expect(Math.abs(b - eb)).toBeLessThan(1 / 255);
  });

  it('maps the extremes to black and white', () => {
    expect(hexOf([0, 0, 0])).toBe('#000000');
    expect(hexOf([1, 0, 0])).toBe('#ffffff');
  });

  test.prop([
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 0.4, noNaN: true }),
    fc.double({ min: 0, max: 359.99, noNaN: true }),
  ])('always gives a well-formed hex colour, clamping what is out of gamut', (l, c, h) => {
    expect(hexOf([l, c, h])).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('truncate', () => {
  test.prop([fc.string(), fc.integer({ min: 2, max: 200 })])('never exceeds the limit', (s, max) => {
    expect(truncate(s, max).length).toBeLessThanOrEqual(max);
  });

  test.prop([fc.string({ maxLength: 40 })])('leaves a short text as it is (whitespace collapsed)', (s) => {
    expect(truncate(s, 200)).toBe(s.replace(/\s+/g, ' ').trim());
  });

  it('cuts at a word and marks the cut', () => {
    expect(truncate('Quanto custa uma decisão de engenharia', 20)).toBe('Quanto custa uma…');
  });
});

describe('joinUpTo', () => {
  it('keeps whole items only', () => {
    expect(joinUpTo(['Engenharia de dados e ETL', 'Teoria da informação', 'Sistemas de informação'], ' · ', 50)).toBe(
      'Engenharia de dados e ETL · Teoria da informação',
    );
    expect(joinUpTo([], ' · ', 10)).toBe('');
  });

  test.prop([
    fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 6 }),
    fc.integer({ min: 30, max: 120 }),
  ])('is a prefix of the full list and fits whenever its first item fits', (items, max) => {
    const all = items.join(' · ');
    const shown = joinUpTo(items, ' · ', max);
    expect(all.startsWith(shown)).toBe(true);
    if ((items[0]?.length ?? 0) <= max) expect(shown.length).toBeLessThanOrEqual(max);
  });
});

describe('card tree', () => {
  it('is the size of an Open Graph image and names the stratum in words, not only by colour', () => {
    const tree = cardTree(input(), palette);
    expect(tree.props.style).toMatchObject({ width: CARD.width, height: CARD.height });
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Formal  ·  Passagem de Formal para Valor', 'Ensaio', 'Flávio Tinoco']),
    );
    expect(images(tree)).toHaveLength(1);
  });

  test.prop([fc.string({ maxLength: 400 }), fc.string({ maxLength: 600 })])(
    'never shows more text than the card holds',
    (title, description) => {
      const shown = texts(cardTree(input({ title, description }), palette));
      expect(shown.every((s) => s.length <= Math.max(TITLE_MAX, DESCRIPTION_MAX, 80))).toBe(true);
    },
  );

  it('draws the lab thumbnail and the whole bridge on the site card', () => {
    expect(images(cardTree(input({ kind: 'lab', thumbnail: thumbnail('pipeline') }), palette))).toHaveLength(2);
    const site = cardTree(
      input({
        kind: 'site',
        stratum: null,
        stratumLabel: null,
        passage: null,
        form: null,
        bridge: STRATA.map((s) => ({ stratum: s, label: s })),
      }),
      palette,
    );
    expect(images(site)).toHaveLength(4);
    expect(texts(site)).toEqual(expect.arrayContaining([...STRATA]));
  });

  it('gives every stratum its own glyph, as standalone SVG', () => {
    const glyphs = STRATA.map((s) => glyphSvg(s, '#000'));
    expect(new Set(glyphs).size).toBe(4);
    for (const g of glyphs) expect(g).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it('puts the card under the locale segment', () => {
    expect(cardPath('pt-BR', 'essay', 'a-segunda-flag')).toBe('pt/card/essay/a-segunda-flag.png');
    expect(cardPath('en', 'site', 'index')).toBe('en/card/site/index.png');
  });
});
