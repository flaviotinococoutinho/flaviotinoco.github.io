/**
 * Terminal presentation: ANSI styles and aligned tables (pure).
 *
 * Colour policy (https://no-color.org): styles are applied only when stdout is
 * an interactive terminal AND the NO_COLOR variable is absent or empty AND
 * `--no-color` was not given. Colour never carries meaning alone — every
 * severity is also spelled out ("erro", "aviso"), as on the site (WCAG 1.4.1).
 */

export interface Style {
  readonly enabled: boolean;
  readonly bold: (s: string) => string;
  readonly dim: (s: string) => string;
  readonly italic: (s: string) => string;
  readonly red: (s: string) => string;
  readonly yellow: (s: string) => string;
  readonly green: (s: string) => string;
  readonly cyan: (s: string) => string;
}

const sgr =
  (open: number, close: number) =>
  (s: string): string =>
    `\u001b[${open}m${s}\u001b[${close}m`;

const identity = (s: string): string => s;

export const style = (enabled: boolean): Style =>
  enabled
    ? {
        enabled,
        bold: sgr(1, 22),
        dim: sgr(2, 22),
        italic: sgr(3, 23),
        red: sgr(31, 39),
        yellow: sgr(33, 39),
        green: sgr(32, 39),
        cyan: sgr(36, 39),
      }
    : {
        enabled,
        bold: identity,
        dim: identity,
        italic: identity,
        red: identity,
        yellow: identity,
        green: identity,
        cyan: identity,
      };

export const colourEnabled = (
  isTTY: boolean,
  env: Readonly<Record<string, string | undefined>>,
  noColorFlag: boolean,
): boolean => isTTY && !noColorFlag && (env['NO_COLOR'] === undefined || env['NO_COLOR'] === '');

// eslint-disable-next-line no-control-regex -- the ANSI escape (ECMA-48 SGR) is the pattern
const ANSI = /\u001b\[[0-9;]*m/g;
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Display width: grapheme clusters of the text without ANSI escapes (East Asian wide forms are not used). */
export const width = (s: string): number => [...graphemes.segment(s.replace(ANSI, ''))].length;

const pad = (s: string, w: number, align: 'left' | 'right'): string => {
  const fill = ' '.repeat(Math.max(0, w - width(s)));
  return align === 'left' ? s + fill : fill + s;
};

/**
 * Aligned columns separated by two spaces; `align` gives the alignment per column
 * (numbers right-aligned). The last column is not padded (no trailing spaces).
 */
export const table = (
  rows: readonly (readonly string[])[],
  align: readonly ('left' | 'right')[] = [],
): readonly string[] => {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const widths = Array.from({ length: columns }, (_, c) => Math.max(0, ...rows.map((r) => width(r[c] ?? ''))));
  return rows.map((r) =>
    r
      .map((cell, c) => {
        const a = align[c] ?? 'left';
        return c === r.length - 1 && a === 'left' ? cell : pad(cell, widths[c] ?? 0, a);
      })
      .join('  '),
  );
};
