/**
 * Palette guardrail (runs in CI). Fails the build if any colour token violates:
 *
 *  1. Gamut      every token is inside sRGB (out-of-gamut colours are clipped
 *                differently by each browser: an uncontrolled loss of information).
 *  2. Text       WCAG 2.2 contrast (1.4.6 AAA ≥ 7:1 for body/secondary/link text,
 *                1.4.3 ≥ 4.5:1 for subtle text and stratum labels) and APCA |Lc|
 *                (APCA-W3 0.1.9; ≥ 75 body text minimum per the APCA bronze levels).
 *  3. Softness   body text ≤ 16:1 in the normal schemes (no harsh pure black/white);
 *                the *-more schemes are exempt by design.
 *  4. Non-text   WCAG 1.4.11 ≥ 3:1 for control borders and the focus indicator.
 *  5. CVD        the four stratum colours remain mutually distinguishable under
 *                simulated protanopia, deuteranopia and tritanopia (Machado et al.
 *                2009): min pairwise CIEDE2000 ≥ 8 (and ≥ 15 for typical vision);
 *                under achromatopsia their lightness is strictly monotone in the
 *                order of the strata (the ordinal survives without hue).
 *
 * Colour is never the only carrier of meaning (WCAG 1.4.1): strata are also
 * encoded by simplex glyphs and labels. These thresholds make the redundant
 * channel robust, not the sole one.
 */
import { readFile } from 'node:fs/promises';
import Color from 'colorjs.io';
import { parseTokens, type ColorTable, type Oklch } from '../src/core/design/tokens.ts';
import { CVD_TYPES, simulateLinear, type Vec3 } from '../src/core/design/cvd.ts';
import { STRATA } from '../src/core/domain/strata.ts';

const tokens = parseTokens(JSON.parse(await readFile(new URL('../src/core/design/tokens.json', import.meta.url), 'utf8')));
if (!tokens.ok) {
  console.error(tokens.error.join('\n'));
  process.exit(1);
}
const { colors } = tokens.value;

const toColor = ([l, c, h]: Oklch): Color => new Color('oklch', [l, c, h]);
const resolve = (scheme: 'light' | 'dark' | 'light-more' | 'dark-more'): ColorTable =>
  scheme === 'light-more'
    ? { ...colors.light, ...colors['light-more'] }
    : scheme === 'dark-more'
      ? { ...colors.dark, ...colors['dark-more'] }
      : colors[scheme];

const failures: string[] = [];
const rows: string[][] = [];
const check = (ok: boolean, label: string, value: string, rule: string): void => {
  rows.push([ok ? 'ok ' : 'FAIL', label, value, rule]);
  if (!ok) failures.push(`${label}: ${value} (${rule})`);
};

const wcag = (fg: Color, bg: Color): number => bg.contrast(fg, 'WCAG21');
const apca = (fg: Color, bg: Color): number => Math.abs(bg.contrast(fg, 'APCA'));

const TEXT_AAA = ['ink', 'ink-muted', 'link'] as const;
const SURFACES = ['paper', 'paper-raised', 'paper-sunken'] as const;

for (const scheme of ['light', 'dark', 'light-more', 'dark-more'] as const) {
  const t = resolve(scheme);
  const c = (name: string): Color => {
    const v = t[name];
    if (!v) throw new Error(`missing token ${scheme}.${name}`);
    return toColor(v);
  };

  for (const [name, value] of Object.entries(t)) {
    check(toColor(value).inGamut('srgb'), `${scheme}.${name}`, 'in sRGB', 'gamut');
  }

  for (const fg of TEXT_AAA)
    for (const bg of SURFACES) {
      const r = wcag(c(fg), c(bg));
      check(r >= 7, `${scheme} ${fg}/${bg}`, `${r.toFixed(2)}:1`, 'WCAG 1.4.6 ≥ 7');
    }
  const body = apca(c('ink'), c('paper'));
  check(body >= 75, `${scheme} ink/paper`, `Lc ${body.toFixed(1)}`, 'APCA ≥ 75');
  if (scheme === 'light' || scheme === 'dark') {
    const r = wcag(c('ink'), c('paper'));
    check(r <= 16, `${scheme} ink/paper`, `${r.toFixed(2)}:1`, 'softness ≤ 16');
  }
  const subtle = wcag(c('ink-subtle'), c('paper'));
  check(subtle >= 4.5, `${scheme} ink-subtle/paper`, `${subtle.toFixed(2)}:1`, 'WCAG 1.4.3 ≥ 4.5');
  const marked = wcag(c('ink'), c('mark'));
  check(marked >= 7, `${scheme} ink/mark`, `${marked.toFixed(2)}:1`, 'WCAG 1.4.6 ≥ 7');
  for (const ui of ['rule-strong', 'focus'] as const) {
    const r = wcag(c(ui), c('paper'));
    check(r >= 3, `${scheme} ${ui}/paper`, `${r.toFixed(2)}:1`, 'WCAG 1.4.11 ≥ 3');
  }
  for (const s of STRATA) {
    const r = wcag(c(`stratum-${s}`), c('paper'));
    check(r >= 4.5, `${scheme} stratum-${s}/paper`, `${r.toFixed(2)}:1`, 'WCAG 1.4.3 ≥ 4.5');
  }

  // CVD separability of the categorical (stratum) palette.
  const strata = STRATA.map((s) => c(`stratum-${s}`));
  const linear = strata.map((col) => col.to('srgb-linear').coords as unknown as Vec3);
  const asColor = (v: Vec3): Color => new Color('srgb-linear', [v[0], v[1], v[2]]);
  const minPairwise = (cols: readonly Color[]): number => {
    let m = Infinity;
    for (let i = 0; i < cols.length; i++)
      for (let j = i + 1; j < cols.length; j++) m = Math.min(m, cols[i]!.deltaE(cols[j]!, '2000'));
    return m;
  };
  const normal = minPairwise(strata);
  check(normal >= 15, `${scheme} strata (typical vision)`, `min ΔE00 ${normal.toFixed(1)}`, 'ΔE00 ≥ 15');
  for (const type of CVD_TYPES) {
    const simulated = linear.map((v) => asColor(simulateLinear(v, type)));
    if (type === 'achromatopsia') {
      const ys = simulated.map((col) => col.coords[0] ?? 0);
      const increasing = ys.every((y, i) => i === 0 || y > ys[i - 1]!);
      const decreasing = ys.every((y, i) => i === 0 || y < ys[i - 1]!);
      check(
        increasing || decreasing,
        `${scheme} strata (achromatopsia)`,
        `Y = ${ys.map((y) => y.toFixed(3)).join(' → ')}`,
        'monotone lightness',
      );
    } else {
      const m = minPairwise(simulated);
      check(m >= 8, `${scheme} strata (${type})`, `min ΔE00 ${m.toFixed(1)}`, 'ΔE00 ≥ 8');
    }
  }
}

const width = [4, 44, 34, 22];
for (const r of rows) console.log(r.map((cell, i) => cell.padEnd(width[i] ?? 10)).join(' '));
if (failures.length) {
  console.error(`\n${failures.length} palette violation(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`\nPalette verified: ${rows.length} checks passed.`);
