/**
 * <ft-lab-sampling> — sampling a sinusoid and rebuilding it by Whittaker–Shannon interpolation; aliasing
 * below the Nyquist rate (src/content/labs/{pt,en}/{amostragem,sampling}.md).
 *
 * Over a window of six periods of the tone, `signal.wasm` samples x(t) = sin(2πft + φ) at t_k = k/f_s
 * (`sample_sinusoid`) and evaluates Σ_k x_k·sinc(f_s·t − k) over the visible samples only
 * (`reconstruct_sinc`), so the edges of the window err exactly as the lab text says. The strip below
 * places f, the apparent frequency f_a (`alias_frequency`) and the Nyquist limit f_s/2 on one frequency
 * axis. Inside the essay's scrolly, each step sets f_s (state "fs=…").
 *
 * Series: dashed original tone, solid reconstruction, stems with circles for the samples; in the strip,
 * a circle for f, a square for f_a and a dashed line for f_s/2, each with its text label.
 */
import { frequency, upTo } from '../../core/labs/format.ts';
import { functionPath, polylinePath, stemsPath } from '../../core/labs/path.ts';
import { sinusoid, windowSeconds } from '../../core/labs/sampling.ts';
import { linearScale } from '../../core/labs/scale.ts';
import { samplingSummary } from '../../core/labs/summary.ts';
import { looseTicks, ticksWithin } from '../../core/labs/ticks.ts';
import type { ParamSpec, Widget } from '../../core/labs/widgets.ts';
import { loadSignal, type SignalKernel } from '../../adapters/wasm/signal.ts';
import {
  clear,
  drawAxes,
  LabElement,
  legend,
  markerPath,
  plot,
  svg,
  ticks,
  type ControlOptions,
} from './ft-lab-kit.ts';

const W = 640;
const H = 300;
const STRIP = 96;
const CURVE_POINTS = 600;
const sy = linearScale(-1.3, 1.3, H - 36, 16);

class FtLabSampling extends LabElement<SignalKernel> {
  readonly widget: Widget = 'sampling';
  #axes!: SVGGElement;
  #signal!: SVGPathElement;
  #stems!: SVGPathElement;
  #samples!: SVGPathElement;
  #rebuilt!: SVGPathElement;
  #strip!: SVGGElement;
  #nyquist!: HTMLElement;
  #alias!: HTMLElement;
  #perCycle!: HTMLElement;
  #count!: HTMLElement;

  protected load(): Promise<SignalKernel> {
    return loadSignal();
  }

  protected override controlOptions(spec: ParamSpec): ControlOptions {
    if (spec.key === 'phase') return { format: (v) => this.t('unit.degrees', { value: upTo(this.locale, v, 0) }) };
    return { format: (v) => frequency(this.locale, v) };
  }

  protected build(): void {
    const time = plot(this.plots, W, H, this.t('sampling.legend.reconstruction'), this.summaryId);
    this.#axes = svg('g', {}, time);
    this.#signal = svg('path', { class: 'lab__series lab__series--ref' }, time);
    this.#stems = svg('path', { class: 'lab__series lab__series--stem' }, time);
    this.#rebuilt = svg('path', { class: 'lab__series lab__series--main' }, time);
    this.#samples = svg('path', { class: 'lab__marker' }, time);
    this.plots.append(
      legend(
        [
          { label: this.t('sampling.legend.signal'), line: 'lab__series lab__series--ref' },
          { label: this.t('sampling.legend.reconstruction'), line: 'lab__series lab__series--main' },
          { label: this.t('sampling.legend.samples'), line: 'lab__series lab__series--stem', marker: 'circle' },
        ],
        this.t('lab.legend'),
      ),
    );
    const strip = plot(this.plots, W, STRIP, this.t('sampling.axis.frequency'), this.summaryId);
    strip.classList.add('lab__plot--strip');
    this.#strip = svg('g', {}, strip);
    this.#nyquist = this.readout(this.t('sampling.nyquist'));
    this.#alias = this.readout(this.t('sampling.alias'));
    this.#perCycle = this.readout(this.t('sampling.perCycle'));
    this.#count = this.readout(this.t('sampling.count'));
  }

  protected render(kernel: SignalKernel): string {
    const f = this.num('f');
    const fs = this.num('fs');
    const phase = this.num('phase');
    const seconds = windowSeconds(f);
    const ms = seconds * 1000;
    const sx = linearScale(0, ms, 52, W - 16);
    const xt = looseTicks(0, ms, 6);
    const tickValues = (xt.ok ? xt.value.values : []).filter((v) => v <= ms + 1e-9);
    drawAxes(
      this.#axes,
      sx,
      sy,
      ticks(tickValues, (v) => upTo(this.locale, v, 3)),
      ticks([-1, 0, 1], (v) => upTo(this.locale, v, 0)),
      { x: this.t('sampling.axis.time') },
    );

    const tone = sinusoid(f, phase);
    this.#signal.setAttribute(
      'd',
      functionPath((t) => tone(t / 1000), 0, ms, CURVE_POINTS, sx, sy),
    );
    const { t, x } = kernel.sampleSinusoid(f, (phase * Math.PI) / 180, fs, seconds);
    const tMs = Array.from(t, (v) => v * 1000);
    this.#stems.setAttribute('d', stemsPath(tMs, x, sx, sy));
    this.#samples.setAttribute(
      'd',
      tMs.map((v, i) => markerPath('circle', sx.map(v), sy.map(x[i] ?? 0), 3.5)).join(''),
    );
    const rebuilt = x.length > 0 ? kernel.reconstructSinc(x, fs, 0, seconds, CURVE_POINTS) : new Float64Array(0);
    this.#rebuilt.setAttribute(
      'd',
      polylinePath(
        Array.from({ length: rebuilt.length }, (_, i) => (ms * i) / Math.max(1, rebuilt.length - 1)),
        rebuilt,
        sx,
        sy,
      ),
    );

    const alias = kernel.aliasFrequency(f, fs);
    this.#drawStrip(f, fs, alias);
    this.#nyquist.textContent = frequency(this.locale, fs / 2);
    this.#alias.textContent = frequency(this.locale, alias);
    this.#perCycle.textContent = upTo(this.locale, fs / f, 2);
    this.#count.textContent = upTo(this.locale, x.length, 0);
    const amplitude = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    return samplingSummary(this.locale, { f, fs, phase, alias, amplitude });
  }

  #drawStrip(f: number, fs: number, alias: number): void {
    const g = this.#strip;
    clear(g);
    const top = 30;
    const base = 62;
    const maxKhz = (Math.max(f, fs) * 1.08) / 1000;
    const sx = linearScale(0, maxKhz, 52, W - 16);
    const xt = ticksWithin(0, maxKhz, 7);
    for (const v of xt.ok ? xt.value.values : []) {
      const x = sx.map(v);
      svg('path', { class: 'lab__axis', d: `M${x} ${base}v5` }, g);
      svg('text', { class: 'lab__tick', x, y: base + 20, 'text-anchor': 'middle' }, g).textContent = upTo(
        this.locale,
        v,
        2,
      );
    }
    svg('path', { class: 'lab__axis', d: `M52 ${base}H${W - 16}` }, g);
    svg('text', { class: 'lab__axis-title', x: W - 16, y: base + 34, 'text-anchor': 'end' }, g).textContent =
      this.t('sampling.axis.frequency');
    const label = (x: number, y: number, text: string): void => {
      svg('text', { class: 'lab__mark-label', x, y, 'text-anchor': 'middle' }, g).textContent = text;
    };
    const nyquist = sx.map(fs / 2000);
    svg('path', { class: 'lab__series lab__series--limit', d: `M${nyquist} ${top - 14}V${base}` }, g);
    label(nyquist, top - 18, this.t('sampling.mark.nyquist'));
    const xs = sx.map(fs / 1000);
    svg('path', { class: 'lab__axis', d: `M${xs} ${base - 6}V${base + 6}` }, g);
    label(xs, base - 10, this.t('sampling.mark.fs'));
    const xf = sx.map(f / 1000);
    svg('path', { class: 'lab__marker', d: markerPath('circle', xf, base, 5) }, g);
    label(xf, top + 2, this.t('sampling.mark.f'));
    const xa = sx.map(alias / 1000);
    svg('path', { class: 'lab__marker lab__marker--alt', d: markerPath('square', xa, base, 4.5) }, g);
    label(xa, top + 16, this.t('sampling.mark.alias'));
  }
}

if (!customElements.get('ft-lab-sampling')) customElements.define('ft-lab-sampling', FtLabSampling);
