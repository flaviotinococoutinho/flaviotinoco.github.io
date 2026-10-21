/**
 * Lab state strings: parse(serialize(s)) = s for every valid state, canonical order, accumulated errors,
 * bounds and step grid, text alphabets, URL hashes.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  checkLabState,
  checkParam,
  decodeLabHash,
  encodeLabHash,
  formatParamValue,
  onStepGrid,
  parseLabState,
  parseParamValue,
  resolveState,
  serializeLabState,
  snapNumber,
  type LabState,
} from '../../../src/core/labs/state.ts';
import { PARAMS, WIDGETS, defaultState, type ParamSpec, type Widget } from '../../../src/core/labs/widgets.ts';

/** A valid value of a parameter: on the grid for numbers, in the alphabet for text. */
const valueArb = (spec: ParamSpec): fc.Arbitrary<string | number | boolean> => {
  switch (spec.kind) {
    case 'number': {
      const steps = Math.round((spec.max - spec.min) / spec.step);
      return fc.integer({ min: 0, max: steps }).map((k) => snapNumber(spec, spec.min + k * spec.step));
    }
    case 'choice':
      return fc.constantFrom(...spec.options);
    case 'flag':
      return fc.boolean();
    case 'text':
      return spec.alphabet === undefined
        ? fc.string({ maxLength: Math.min(40, spec.maxLength) })
        : fc.stringMatching(new RegExp(`^[${spec.alphabet}]{0,${Math.min(40, spec.maxLength)}}$`));
  }
};

/** A partial state of a widget: any subset of its parameters with valid values. */
const stateArb = (widget: Widget): fc.Arbitrary<LabState> =>
  fc
    .tuple(...PARAMS[widget].map((spec) => fc.option(valueArb(spec), { nil: undefined })))
    .map((values) =>
      Object.fromEntries(PARAMS[widget].flatMap((spec, i) => (values[i] === undefined ? [] : [[spec.key, values[i]]]))),
    );

describe('state codec', () => {
  for (const widget of WIDGETS) {
    test.prop([stateArb(widget)])(`${widget}: parse ∘ serialize = id, serialize ∘ parse idempotent`, (state) => {
      const text = serializeLabState(widget, state);
      const back = parseLabState(widget, text);
      expect(back).toEqual({ ok: true, value: state });
      expect(serializeLabState(widget, back.ok ? back.value : {})).toBe(text);
      expect(checkLabState(widget, state)).toEqual({ ok: true, value: state });
    });
  }

  it('writes keys in the widget order and drops unknown ones', () => {
    expect(serializeLabState('fourier', { sigma: true, N: 10, foo: 1 })).toBe('N=10;sigma=1');
    expect(serializeLabState('entropy', { text: 'a;b=c', unit: 'byte' })).toBe('unit=byte;text=a%3Bb%3Dc');
    expect(parseLabState('entropy', 'text=a%3Bb%3Dc')).toEqual({ ok: true, value: { text: 'a;b=c' } });
    expect(parseLabState('sampling', '  ')).toEqual({ ok: true, value: {} });
    expect(parseLabState('sampling', ' fs = 6000 ; f=100 ')).toEqual({ ok: true, value: { fs: 6000, f: 100 } });
  });

  it('accumulates every problem', () => {
    const r = parseLabState('fourier', 'N=0;wave=round;sigma=2;x;=1;zeta=1;N');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toHaveLength(7);
    expect(r.error.join('\n')).toMatch(/outside \[1, 200\]/);
    expect(r.error.join('\n')).toMatch(/must be one of square, sawtooth, triangle/);
    expect(r.error.join('\n')).toMatch(/expected 0 or 1/);
    expect(r.error.join('\n')).toMatch(/unknown parameter "zeta"/);
    expect(r.error.filter((e) => /not a key=value pair/.test(e))).toHaveLength(3);
    expect(parseLabState('fourier', 'N=5;N=3')).toEqual({
      ok: false,
      error: ['parameter "N" is given more than once'],
    });
  });

  it('checks numbers against bounds and grid, text against length and alphabet', () => {
    const N = PARAMS.fourier[1] as ParamSpec & { readonly kind: 'number' };
    expect(checkParam(N, 2.5).ok).toBe(false);
    expect(checkParam(N, 201).ok).toBe(false);
    expect(checkParam(N, Number.NaN).ok).toBe(false);
    expect(checkParam(N, 'x').ok).toBe(false);
    expect(checkParam(N, 7)).toEqual({ ok: true, value: 7 });
    const bits = PARAMS.channel[1] as ParamSpec;
    expect(checkParam(bits, '0102').ok).toBe(false);
    expect(checkParam(bits, '0'.repeat(65)).ok).toBe(false);
    expect(checkParam(bits, 7).ok).toBe(false);
    const wave = PARAMS.fourier[0] as ParamSpec;
    expect(checkParam(wave, 'sine').ok).toBe(false);
    const sigma = PARAMS.fourier[2] as ParamSpec;
    expect(checkParam(sigma, 'yes').ok).toBe(false);
    expect(parseParamValue(N, '1e1')).toEqual({ ok: true, value: 10 });
    expect(parseParamValue(N, 'ten').ok).toBe(false);
    expect(parseParamValue(bits, '%E0%A4%A').ok).toBe(false);
    expect(formatParamValue(sigma, false)).toBe('0');
    expect(onStepGrid(0.3, 0, 0.1)).toBe(true);
    expect(onStepGrid(0.35, 0, 0.1)).toBe(false);
  });

  it('resolves defaults, base and patch in that order', () => {
    expect(resolveState('clt', { n: 5 }, { n: 7, seed: 1 })).toEqual({ ...defaultState('clt'), n: 7, seed: 1 });
    expect(checkLabState('clt', { n: 0 }).ok).toBe(false);
    expect(checkLabState('clt', { x: 1 }).ok).toBe(false);
  });

  it('snaps free input to the nearest grid value inside the bounds', () => {
    const p = PARAMS.channel[0] as ParamSpec & { readonly kind: 'number' };
    expect(snapNumber(p, 0.12345)).toBe(0.123);
    expect(snapNumber(p, 5)).toBe(1);
    expect(snapNumber(p, -1)).toBe(0);
    expect(snapNumber(p, Number.NaN)).toBe(p.default);
    const N = PARAMS.fourier[1] as ParamSpec & { readonly kind: 'number' };
    expect(snapNumber(N, 2.4)).toBe(2);
  });

  it('encodes and decodes the URL hash of a lab', () => {
    expect(encodeLabHash('sampling', { fs: 6000 })).toBe('sampling:fs=6000');
    expect(decodeLabHash('sampling', '#sampling:fs=6000')).toEqual({ ok: true, value: { fs: 6000 } });
    expect(decodeLabHash('sampling', 'sampling:fs=1')).toMatchObject({ ok: false });
    expect(decodeLabHash('sampling', '#fourier:N=3')).toBeNull();
    expect(decodeLabHash('sampling', '#a-heading')).toBeNull();
  });
});
