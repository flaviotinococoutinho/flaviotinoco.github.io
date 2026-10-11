/**
 * Design tokens: parsing (DTCG 2025.10 subset) and compilation to CSS.
 * Pure — the shell (scripts/tokens.ts) does the file I/O.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { fluidStep, phiSpace, stepName, type FluidScaleSpec } from './scale.ts';

export type Oklch = readonly [l: number, c: number, h: number];
export type ColorScheme = 'light' | 'dark' | 'light-more' | 'dark-more';
export type ColorTable = Readonly<Record<string, Oklch>>;

export interface Tokens {
  readonly colors: Readonly<Record<ColorScheme, ColorTable>>;
  readonly type: FluidScaleSpec & { readonly steps: readonly number[] };
  readonly leading: { readonly body: number; readonly heading: number; readonly ui: number };
  readonly measureCh: number;
  readonly spaceExponents: readonly number[];
  readonly durationsMs: Readonly<Record<string, number>>;
  readonly easings: Readonly<Record<string, readonly [number, number, number, number]>>;
}

type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };
const isObject = (j: Json | undefined): j is { readonly [k: string]: Json } =>
  typeof j === 'object' && j !== null && !Array.isArray(j);

const get = (j: Json | undefined, path: readonly string[]): Json | undefined =>
  path.reduce<Json | undefined>((acc, k) => (isObject(acc) ? acc[k] : undefined), j);

const num = (j: Json | undefined, where: string): Result<number, string> =>
  typeof j === 'number' && Number.isFinite(j) ? ok(j) : err(`${where}: expected a finite number`);

const numValue = (root: Json, path: readonly string[]): Result<number, string> =>
  num(get(root, [...path, '$value']), path.join('.'));

const parseOklch = (j: Json | undefined, where: string): Result<Oklch, string> => {
  const v = get(j, ['$value']);
  if (!isObject(v) || v['colorSpace'] !== 'oklch') return err(`${where}: expected {colorSpace:"oklch"}`);
  const c = v['components'];
  if (!Array.isArray(c) || c.length !== 3 || !c.every((x) => typeof x === 'number'))
    return err(`${where}: expected three numeric components`);
  const [l, ch, h] = c as unknown as Oklch;
  if (l < 0 || l > 1 || ch < 0 || ch > 0.5 || h < 0 || h >= 360) return err(`${where}: component out of range`);
  return ok([l, ch, h]);
};

const parseTable = (j: Json | undefined, where: string): Result<ColorTable, readonly string[]> => {
  if (!isObject(j)) return err([`${where}: expected an object`]);
  const out: Record<string, Oklch> = {};
  const errors: string[] = [];
  for (const [name, value] of Object.entries(j)) {
    if (name.startsWith('$')) continue;
    const r = parseOklch(value, `${where}.${name}`);
    if (r.ok) out[name] = r.value;
    else errors.push(r.error);
  }
  return errors.length ? err(errors) : ok(out);
};

/** Parses the token document, reporting every problem at once. */
export const parseTokens = (root: Json): Result<Tokens, readonly string[]> => {
  const errors: string[] = [];
  const pick = <T>(r: Result<T, string>, fallback: T): T => {
    if (r.ok) return r.value;
    errors.push(r.error);
    return fallback;
  };
  const schemes: ColorScheme[] = ['light', 'dark', 'light-more', 'dark-more'];
  const colors = {} as Record<ColorScheme, ColorTable>;
  for (const s of schemes) {
    const t = parseTable(get(root, ['color', s]), `color.${s}`);
    if (t.ok) colors[s] = t.value;
    else errors.push(...t.error);
  }
  const typ = (k: string) => pick(numValue(root, ['typography', k]), 0);
  const prop = (k: string) => pick(numValue(root, ['proportion', k]), 1);
  const steps = get(root, ['typography', 'steps', '$value']);
  const exps = get(root, ['space', 'exponents', '$value']);
  const durations: Record<string, number> = {};
  const durRoot = get(root, ['duration']);
  if (isObject(durRoot))
    for (const [k, v] of Object.entries(durRoot)) {
      if (k.startsWith('$')) continue;
      const ms = get(v, ['$value', 'value']);
      if (typeof ms === 'number' && get(v, ['$value', 'unit']) === 'ms') durations[k] = ms;
      else errors.push(`duration.${k}: expected {value, unit:"ms"}`);
    }
  const easings: Record<string, readonly [number, number, number, number]> = {};
  const easeRoot = get(root, ['easing']);
  if (isObject(easeRoot))
    for (const [k, v] of Object.entries(easeRoot)) {
      if (k.startsWith('$')) continue;
      const b = get(v, ['$value']);
      if (Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === 'number'))
        easings[k] = b as unknown as readonly [number, number, number, number];
      else errors.push(`easing.${k}: expected four numbers`);
    }
  const measure = get(root, ['typography', 'measure', '$value', 'value']);
  if (errors.length) return err(errors);
  return ok({
    colors,
    type: {
      baseMinPx: typ('base-min-px'),
      baseMaxPx: typ('base-max-px'),
      viewportMinPx: typ('viewport-min-px'),
      viewportMaxPx: typ('viewport-max-px'),
      ratioMin: prop('type-ratio-min'),
      ratioMax: prop('type-ratio-max'),
      steps: Array.isArray(steps) ? (steps as readonly number[]) : [0],
    },
    leading: { body: typ('leading-body'), heading: typ('leading-heading'), ui: typ('leading-ui') },
    measureCh: typeof measure === 'number' ? measure : 66,
    spaceExponents: Array.isArray(exps) ? (exps as readonly number[]) : [0],
    durationsMs: durations,
    easings,
  });
};

const oklchCss = ([l, c, h]: Oklch): string => `oklch(${+(l * 100).toFixed(2)}% ${c} ${h})`;
const declarations = (table: ColorTable, indent = '  '): string =>
  Object.entries(table)
    .map(([name, value]) => `${indent}--${name}: ${oklchCss(value)};`)
    .join('\n');

/**
 * Compiles tokens to CSS custom properties. Theme resolution:
 *   explicit [data-theme] on <html>  >  prefers-color-scheme  >  light.
 *   explicit [data-contrast="more"]  or  prefers-contrast: more  → *-more overrides.
 */
export const compileCss = (t: Tokens): string => {
  const lines: string[] = [
    '/* GENERATED by scripts/tokens.ts from src/core/design/tokens.json — do not edit by hand. */',
    '',
    ':root {',
    ...t.type.steps.map((n) => `  --step-${stepName(n)}: ${fluidStep(t.type, n)};`),
    ...t.spaceExponents.map((n) => `  --space-${stepName(n)}: ${phiSpace(n)};`),
    `  --leading-body: ${t.leading.body};`,
    `  --leading-heading: ${t.leading.heading};`,
    `  --leading-ui: ${t.leading.ui};`,
    `  --measure: ${t.measureCh}ch;`,
    ...Object.entries(t.durationsMs).map(([k, ms]) => `  --duration-${k}: ${ms}ms;`),
    ...Object.entries(t.easings).map(([k, b]) => `  --ease-${k}: cubic-bezier(${b.join(', ')});`),
    '}',
    '',
    ':root,',
    ':root[data-theme="light"] {',
    '  color-scheme: light;',
    declarations(t.colors.light),
    '}',
    '',
    ':root[data-theme="dark"] {',
    '  color-scheme: dark;',
    declarations(t.colors.dark),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    '    color-scheme: dark;',
    declarations(t.colors.dark, '    '),
    '  }',
    '}',
    '',
    ':root[data-contrast="more"]:not([data-theme="dark"]) {',
    declarations(t.colors['light-more']),
    '}',
    ':root[data-contrast="more"][data-theme="dark"] {',
    declarations(t.colors['dark-more']),
    '}',
    '@media (prefers-contrast: more) {',
    '  :root:not([data-contrast="normal"]):not([data-theme="dark"]) {',
    declarations(t.colors['light-more'], '    '),
    '  }',
    '  :root:not([data-contrast="normal"])[data-theme="dark"] {',
    declarations(t.colors['dark-more'], '    '),
    '  }',
    '}',
    '@media (prefers-contrast: more) and (prefers-color-scheme: dark) {',
    '  :root:not([data-contrast="normal"]):not([data-theme="light"]) {',
    declarations(t.colors['dark-more'], '    '),
    '  }',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root[data-contrast="more"]:not([data-theme="light"]) {',
    declarations(t.colors['dark-more'], '    '),
    '  }',
    '}',
    '',
  ];
  return lines.join('\n');
};
