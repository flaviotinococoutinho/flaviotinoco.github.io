/**
 * Lab state strings — a codec between parameter values and text, used by scrolly steps
 * (`:::step{state="fs=6000"}`), by `::lab{state="…"}` and by the permalink in the URL hash.
 *
 * Grammar (whitespace around pairs is ignored):
 *
 *   state  = "" | pair *( ";" pair )
 *   pair   = key "=" value
 *   key    = ALPHA *( ALPHA / DIGIT )                  one of the widget's parameters (widgets.ts)
 *   value  = number | "0" | "1" | option | pct-text     by the parameter's kind
 *   number = [ "-" ] ( 1*DIGIT [ "." *DIGIT ] / "." 1*DIGIT ) [ ( "e" / "E" ) [ "+" / "-" ] 1*DIGIT ]
 *
 * Numbers must lie in [min, max] and on the parameter's step grid; text is percent-encoded
 * (RFC 3986 §2.1, as `encodeURIComponent` writes it), so `;` and `=` inside it never split a pair.
 * Errors are accumulated (every bad pair is reported), and a key may appear once.
 *
 * Laws (tests/unit/labs/state.test.ts): for every valid state s, parse(serialize(s)) = s; serialize
 * is canonical (keys in the widget's order), so serialize ∘ parse is idempotent.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import { show } from '../algebra/show.ts';
import { PARAMS, defaultState, paramSpec, type ParamSpec, type ParamValue, type Widget } from './widgets.ts';

/** A partial assignment of a widget's parameters. */
export type LabState = Readonly<Record<string, ParamValue>>;

const KEY = /^[A-Za-z][A-Za-z0-9]*$/;
const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** True when `value` is min + k·step for an integer k (relative tolerance 1e-9). */
export const onStepGrid = (value: number, min: number, step: number): boolean => {
  const k = (value - min) / step;
  return Math.abs(k - Math.round(k)) <= 1e-9 * Math.max(1, Math.abs(k));
};

/** Decodes RFC 3986 percent-encoding; a malformed sequence is an error, not an exception. */
const percentDecode = (raw: string): Result<string, string> => {
  try {
    return ok(decodeURIComponent(raw));
  } catch {
    return err('malformed percent-encoding');
  }
};

/** Checks a typed value against its specification (the single place where bounds are enforced). */
export const checkParam = (spec: ParamSpec, value: ParamValue): Result<ParamValue, string> => {
  switch (spec.kind) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return err(`${spec.key} must be a finite number`);
      if (value < spec.min || value > spec.max)
        return err(`${spec.key}=${value} is outside [${spec.min}, ${spec.max}]`);
      if (!onStepGrid(value, spec.min, spec.step))
        return err(`${spec.key}=${value} is not on the step grid ${spec.min} + k·${spec.step}`);
      return ok(value);
    case 'choice':
      return typeof value === 'string' && spec.options.includes(value)
        ? ok(value)
        : err(`${spec.key} must be one of ${spec.options.join(', ')}, got ${show(value)}`);
    case 'flag':
      return typeof value === 'boolean' ? ok(value) : err(`${spec.key} must be 0 or 1`);
    case 'text': {
      if (typeof value !== 'string') return err(`${spec.key} must be text`);
      if (value.length > spec.maxLength) return err(`${spec.key} is longer than ${spec.maxLength} characters`);
      const alphabet = spec.alphabet;
      if (alphabet !== undefined && [...value].some((c) => !alphabet.includes(c)))
        return err(`${spec.key} may only contain the characters "${alphabet}"`);
      return ok(value);
    }
    default:
      return absurd(spec);
  }
};

/** Parses the textual value of one parameter (the right-hand side of `key=value`). */
export const parseParamValue = (spec: ParamSpec, raw: string): Result<ParamValue, string> => {
  switch (spec.kind) {
    case 'number':
      return NUMBER.test(raw) ? checkParam(spec, Number(raw)) : err(`${spec.key}=${raw} is not a decimal number`);
    case 'choice':
      return checkParam(spec, raw);
    case 'flag':
      return raw === '1' ? ok(true) : raw === '0' ? ok(false) : err(`${spec.key}=${raw}: expected 0 or 1`);
    case 'text': {
      const decoded = percentDecode(raw);
      return decoded.ok ? checkParam(spec, decoded.value) : err(`${spec.key}: ${decoded.error}`);
    }
    default:
      return absurd(spec);
  }
};

/** Prints one value so that {@link parseParamValue} reads it back unchanged. */
export const formatParamValue = (spec: ParamSpec, value: ParamValue): string => {
  switch (spec.kind) {
    case 'number':
      return String(value);
    case 'choice':
      return String(value);
    case 'flag':
      return value === true ? '1' : '0';
    case 'text':
      return encodeURIComponent(String(value));
    default:
      return absurd(spec);
  }
};

/** Parses a state string of `widget`, accumulating every problem. */
export const parseLabState = (widget: Widget, source: string): Result<LabState, readonly string[]> => {
  const text = source.trim();
  if (text === '') return ok({});
  const errors: string[] = [];
  const out: Record<string, ParamValue> = {};
  for (const pair of text.split(';')) {
    const trimmed = pair.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      errors.push(`"${trimmed}" is not a key=value pair`);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const spec = KEY.test(key) ? paramSpec(widget, key) : undefined;
    if (spec === undefined) {
      errors.push(
        `unknown parameter "${key}" for the ${widget} lab (expected ${PARAMS[widget].map((p) => p.key).join(', ')})`,
      );
      continue;
    }
    if (Object.hasOwn(out, key)) {
      errors.push(`parameter "${key}" is given more than once`);
      continue;
    }
    const value = parseParamValue(spec, raw);
    if (value.ok) out[key] = value.value;
    else errors.push(value.error);
  }
  return errors.length > 0 ? err(errors) : ok(out);
};

/** Canonical text of a (partial) state: the widget's parameter order, unknown keys dropped. */
export const serializeLabState = (widget: Widget, state: LabState): string =>
  PARAMS[widget]
    .flatMap((spec) => {
      const value = state[spec.key];
      return value === undefined ? [] : [`${spec.key}=${formatParamValue(spec, value)}`];
    })
    .join(';');

/** Checks a whole state object (e.g. assembled from directive attributes). */
export const checkLabState = (widget: Widget, state: LabState): Result<LabState, readonly string[]> => {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(state)) {
    const spec = paramSpec(widget, key);
    if (spec === undefined) errors.push(`unknown parameter "${key}" for the ${widget} lab`);
    else {
      const r = checkParam(spec, value);
      if (!r.ok) errors.push(r.error);
    }
  }
  return errors.length > 0 ? err(errors) : ok(state);
};

/** Every parameter: the defaults overridden by `base`, then by `patch`. */
export const resolveState = (widget: Widget, base: LabState, patch: LabState = {}): LabState => ({
  ...defaultState(widget),
  ...base,
  ...patch,
});

/** Nearest valid value of a number parameter (for controls fed by free input). */
export const snapNumber = (spec: ParamSpec & { readonly kind: 'number' }, value: number): number => {
  if (!Number.isFinite(value)) return spec.default;
  const k = Math.round((Math.min(spec.max, Math.max(spec.min, value)) - spec.min) / spec.step);
  const snapped = spec.min + k * spec.step;
  // Printing with the step's decimals removes binary noise (0.1 + 0.2), keeping values on the grid.
  const decimals = Math.max(0, -Math.floor(Math.log10(spec.step) + 1e-9));
  return Math.min(spec.max, Number(snapped.toFixed(Math.min(20, decimals))));
};

/** The URL fragment of a lab state: `widget:state` (RFC 3986 §3.5 allows `:`, `;` and `=` there). */
export const encodeLabHash = (widget: Widget, state: LabState): string =>
  `${widget}:${serializeLabState(widget, state)}`;

/**
 * Reads a lab state from a URL fragment (with or without the leading `#`). Returns null when the
 * fragment belongs to something else (a heading id, another lab).
 */
export const decodeLabHash = (widget: Widget, fragment: string): Result<LabState, readonly string[]> | null => {
  const hash = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const prefix = `${widget}:`;
  return hash.startsWith(prefix) ? parseLabState(widget, hash.slice(prefix.length)) : null;
};
