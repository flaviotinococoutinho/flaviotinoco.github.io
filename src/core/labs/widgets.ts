/**
 * The closed set of laboratory widgets and the parameters each one accepts.
 *
 * One table drives everything that names a parameter: the `::lab{…}` directive attributes and scrolly
 * `state` strings checked at build time (src/core/labs/embed.ts), the state parser and serialiser
 * (state.ts), the permalink in the URL hash, and the controls the islands draw (their bounds, step and
 * default). A parameter that is not listed here cannot be set anywhere.
 *
 * Units: sampling frequencies in hertz, phases in degrees, probabilities as fractions. The defaults put
 * each lab in the first situation its "What to observe" list describes (src/content/labs/**).
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

export const WIDGETS = ['fourier', 'sampling', 'entropy', 'channel', 'logistic', 'clt'] as const;
export type Widget = (typeof WIDGETS)[number];

export type KernelName = 'signal' | 'information' | 'dynamics';

/** Which WebAssembly module each widget runs on (docs/adr/0003-wasm-kernels.md). */
export const WIDGET_KERNEL: Readonly<Record<Widget, KernelName>> = {
  fourier: 'signal',
  sampling: 'signal',
  entropy: 'information',
  channel: 'information',
  logistic: 'dynamics',
  clt: 'dynamics',
};

export const isWidget = (value: unknown): value is Widget =>
  typeof value === 'string' && (WIDGETS as readonly string[]).includes(value);

export const parseWidget = (value: unknown): Result<Widget, string> =>
  isWidget(value) ? ok(value) : err(`unknown lab widget ${show(value)} (expected one of ${WIDGETS.join(', ')})`);

/** The custom element of a widget (one module per tag in src/islands/elements/). */
export const widgetTag = (widget: Widget): `ft-lab-${Widget}` => `ft-lab-${widget}`;

export interface NumberParam {
  readonly kind: 'number';
  readonly key: string;
  readonly min: number;
  readonly max: number;
  /** Values are min + k·step (k integer); also the step of the range control. */
  readonly step: number;
  readonly default: number;
}
export interface ChoiceParam {
  readonly kind: 'choice';
  readonly key: string;
  readonly options: readonly string[];
  readonly default: string;
}
export interface FlagParam {
  readonly kind: 'flag';
  readonly key: string;
  readonly default: boolean;
}
export interface TextParam {
  readonly kind: 'text';
  readonly key: string;
  /** Maximum length in UTF-16 code units. */
  readonly maxLength: number;
  /** When present, the only characters allowed. */
  readonly alphabet?: string;
  readonly default: string;
}
export type ParamSpec = NumberParam | ChoiceParam | FlagParam | TextParam;
export type ParamValue = number | string | boolean;

const number = (key: string, min: number, max: number, step: number, value: number): NumberParam => ({
  kind: 'number',
  key,
  min,
  max,
  step,
  default: value,
});

/** Default bit string of the channel lab: 32 bits with runs of every length from 1 to 4. */
export const DEFAULT_BITS = '10110011100011110000101001101011';

export const PARAMS: Readonly<Record<Widget, readonly ParamSpec[]>> = {
  fourier: [
    { kind: 'choice', key: 'wave', options: ['square', 'sawtooth', 'triangle'], default: 'square' },
    number('N', 1, 200, 1, 5),
    { kind: 'flag', key: 'sigma', default: false },
  ],
  sampling: [number('fs', 500, 24000, 50, 12000), number('f', 100, 9000, 10, 3000), number('phase', 0, 360, 1, 0)],
  entropy: [
    { kind: 'choice', key: 'unit', options: ['char', 'byte'], default: 'char' },
    // An empty text means "the localised sample sentence" (src/core/i18n/catalogs/labs.ts).
    { kind: 'text', key: 'text', maxLength: 2000, default: '' },
  ],
  channel: [
    number('p', 0, 1, 0.001, 0.1),
    { kind: 'text', key: 'bits', maxLength: 64, alphabet: '01', default: DEFAULT_BITS },
    number('seed', 0, 999999, 1, 1),
  ],
  logistic: [number('r', 2.5, 4, 0.001, 2.8), number('x0', 0.01, 0.99, 0.01, 0.2)],
  clt: [number('n', 1, 50, 1, 1), number('samples', 1000, 200000, 1000, 20000), number('seed', 0, 999999, 1, 42)],
};

/** The specification of `key` in `widget`, or undefined. */
export const paramSpec = (widget: Widget, key: string): ParamSpec | undefined =>
  PARAMS[widget].find((p) => p.key === key);

/** Every parameter of the widget at its default value. */
export const defaultState = (widget: Widget): Readonly<Record<string, ParamValue>> =>
  Object.fromEntries(PARAMS[widget].map((p) => [p.key, p.default]));
