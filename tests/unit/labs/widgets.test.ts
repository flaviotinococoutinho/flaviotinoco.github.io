/** The closed set of widgets and their parameter table: every default is a valid value of its own spec. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BITS,
  PARAMS,
  WIDGETS,
  WIDGET_KERNEL,
  defaultState,
  isWidget,
  paramSpec,
  parseWidget,
  widgetTag,
} from '../../../src/core/labs/widgets.ts';
import { checkParam } from '../../../src/core/labs/state.ts';

describe('widgets', () => {
  it('recognises the six widgets and refuses anything else', () => {
    for (const w of WIDGETS) {
      expect(isWidget(w)).toBe(true);
      expect(parseWidget(w)).toEqual({ ok: true, value: w });
      expect(widgetTag(w)).toBe(`ft-lab-${w}`);
      expect(['signal', 'information', 'dynamics']).toContain(WIDGET_KERNEL[w]);
    }
    expect(isWidget('lorenz')).toBe(false);
    expect(parseWidget(42).ok).toBe(false);
    expect(parseWidget('lorenz')).toMatchObject({ ok: false });
  });

  it('declares each parameter once, with a default that satisfies its own specification', () => {
    for (const w of WIDGETS) {
      const keys = PARAMS[w].map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const spec of PARAMS[w]) {
        expect(paramSpec(w, spec.key)).toBe(spec);
        expect(checkParam(spec, spec.default)).toEqual({ ok: true, value: spec.default });
      }
      expect(Object.keys(defaultState(w))).toEqual(keys);
    }
    expect(paramSpec('fourier', 'phase')).toBeUndefined();
    expect(DEFAULT_BITS).toMatch(/^[01]{32}$/);
  });
});
