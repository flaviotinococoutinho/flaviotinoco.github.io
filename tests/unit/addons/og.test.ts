/**
 * Open Graph cards: routing (which card a page uses, where it is published), the
 * palette from the design tokens, the glyphs equal to the site sprite, and the
 * rendered PNG — 1200×630, at most 60 KiB, identical bytes for identical input.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OG_HEIGHT,
  OG_MAX_BYTES,
  OG_WIDTH,
  SIMPLEX_SHAPES,
  ogImageFile,
  ogLayout,
  ogPalette,
  ogRouteFor,
  titleSize,
  type OgCard,
  type OgElement,
  type OgNode,
  type OgPalette,
} from '../../../src/core/addons/og.ts';
import { renderOgPng } from '../../../src/adapters/astro/og.ts';
import { parseTokens, type Tokens } from '../../../src/core/design/tokens.ts';
import { parseSlug } from '../../../src/core/domain/identifiers.ts';
import { encodeRoute, type Route } from '../../../src/core/i18n/routes.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const tokens = (): Tokens => {
  const parsed = parseTokens(
    JSON.parse(readFileSync(`${ROOT}src/core/design/tokens.json`, 'utf8')) as Parameters<typeof parseTokens>[0],
  );
  if (!parsed.ok) throw new Error(parsed.error.join('; '));
  return parsed.value;
};

const palette = (): OgPalette => {
  const p = ogPalette(tokens());
  if (!p.ok) throw new Error(p.error.join('; '));
  return p.value;
};

const slug = (s: string) => {
  const r = parseSlug(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

/** Width and height from the IHDR chunk (PNG specification §11.2.2). */
const pngSize = (png: Uint8Array): { width: number; height: number } => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(String.fromCharCode(...png.slice(12, 16))).toBe('IHDR');
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const texts = (n: OgNode | readonly OgNode[] | undefined): string[] => {
  if (n === undefined) return [];
  if (typeof n === 'string') return [n];
  if (Array.isArray(n)) return (n as readonly OgNode[]).flatMap(texts);
  return texts((n as OgElement).props.children);
};

describe('which card, where', () => {
  it('home, essays, labs and strata have their own card; other pages use the home card', () => {
    const own: readonly Route[] = [
      { kind: 'home' },
      { kind: 'essay', slug: slug('a') },
      { kind: 'lab', slug: slug('b') },
      { kind: 'stratum', stratum: 'value' },
    ];
    for (const r of own) expect(ogRouteFor(r)).toEqual(r);
    for (const r of [
      { kind: 'essays' },
      { kind: 'labs' },
      { kind: 'ontology' },
      { kind: 'about' },
      { kind: 'colophon' },
      { kind: 'concept', slug: slug('c') },
    ] as const satisfies readonly Route[])
      expect(ogRouteFor(r)).toEqual({ kind: 'home' });
  });

  it('mirrors the route path', () => {
    expect(ogImageFile(encodeRoute({ kind: 'essay', slug: slug('do-signo') }, 'pt-BR'))).toBe(
      'og/pt/ensaios/do-signo.png',
    );
    expect(ogImageFile(encodeRoute({ kind: 'home' }, 'en'))).toBe('og/en.png');
    expect(ogImageFile('/')).toBe('og/index.png');
  });
});

describe('palette and glyphs', () => {
  it('takes every colour from the light scheme of the tokens', () => {
    const p = palette();
    for (const v of [p.paper, p.ink, p.inkMuted, p.rule, ...Object.values(p.stratum)])
      expect(v).toMatch(/^#[0-9a-f]{6}$/u);
    const broken: Tokens = { ...tokens(), colors: { ...tokens().colors, light: {} } };
    const r = ogPalette(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toHaveLength(8);
  });

  it('draws the same simplices as the site sprite (src/components/Glyphs.astro)', () => {
    const sprite = readFileSync(`${ROOT}src/components/Glyphs.astro`, 'utf8');
    for (const [k, shapes] of Object.entries(SIMPLEX_SHAPES)) {
      const symbol = new RegExp(`<symbol id="simplex-${k}"[\\s\\S]*?</symbol>`, 'u').exec(sprite)?.[0] ?? '';
      expect(symbol, `simplex-${k}`).not.toBe('');
      for (const s of shapes) {
        if (s.kind === 'dot') expect(symbol).toContain(`<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"`);
        else {
          expect(symbol).toContain(`d="${s.d}"`);
          expect(symbol).toMatch(new RegExp(`stroke-width="${s.width}"`, 'u'));
          if (s.dash !== undefined) expect(symbol).toContain(`stroke-dasharray="${s.dash}"`);
        }
      }
    }
  });

  it('scales long titles down', () => {
    expect(titleSize('Curto')).toBeGreaterThan(titleSize('x'.repeat(60)));
    expect(titleSize('x'.repeat(60))).toBeGreaterThan(titleSize('x'.repeat(100)));
    expect(titleSize('x'.repeat(100))).toBeGreaterThan(titleSize('x'.repeat(200)));
  });
});

const work: OgCard = {
  kind: 'work',
  title: 'Amostrar é decidir',
  subtitle: 'o teorema de Nyquist–Shannon',
  stratum: 'formal',
  stratumLabel: 'Formal',
  formLabel: 'Ensaio',
  byline: 'Flávio Tinoco · 3 de maio de 2026',
};

describe('layout', () => {
  it('shows the stratum by glyph AND label, the title, subtitle and byline', () => {
    const tree = ogLayout(work, palette());
    expect(tree.props['style']).toMatchObject({ width: OG_WIDTH, height: OG_HEIGHT });
    expect(texts(tree)).toEqual([
      'Ensaio · Formal',
      'Amostrar é decidir',
      'o teorema de Nyquist–Shannon',
      'Flávio Tinoco · 3 de maio de 2026',
    ]);
    expect(JSON.stringify(tree)).toContain('"type":"svg"');
  });

  it('home lists the four strata with their labels', () => {
    const tree = ogLayout(
      {
        kind: 'home',
        siteName: 'Flávio Tinoco',
        tagline: 'Da questão ao produto.',
        strata: [
          { stratum: 'philosophy', label: 'Filosofia' },
          { stratum: 'theory', label: 'Teoria' },
          { stratum: 'formal', label: 'Formal' },
          { stratum: 'value', label: 'Valor' },
        ],
      },
      palette(),
    );
    expect(texts(tree)).toEqual(['Flávio Tinoco', 'Da questão ao produto.', 'Filosofia', 'Teoria', 'Formal', 'Valor']);
  });
});

describe('the PNG', () => {
  it('is 1200×630, within budget, and byte-identical for identical input', async () => {
    const tree = ogLayout(work, palette());
    const [a, b] = await Promise.all([renderOgPng(tree, ROOT), renderOgPng(tree, ROOT)]);
    expect(pngSize(a)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
    expect(a.byteLength).toBeLessThanOrEqual(OG_MAX_BYTES);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  }, 30_000);

  it('stays within budget for a long title, subtitle and extended Latin', async () => {
    const tree = ogLayout(
      {
        ...work,
        title:
          'Łukasiewicz, Gödel e Erdős: uma história da lógica polivalente, da incompletude e do acaso combinatório',
        subtitle:
          'com uma digressão sobre o significado de “verdade” em sistemas formais e na teoria da informação de Shannon',
      },
      palette(),
    );
    const png = await renderOgPng(tree, ROOT);
    expect(pngSize(png)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
    expect(png.byteLength).toBeLessThanOrEqual(OG_MAX_BYTES);
  }, 30_000);
});
