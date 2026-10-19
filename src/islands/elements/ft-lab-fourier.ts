/**
 * <ft-lab-fourier> — partial Fourier sums of a square, sawtooth or triangle wave and the Gibbs
 * phenomenon (src/content/labs/{pt,en}/fourier*.md).
 *
 * The curve S_N comes from `signal.wasm` (`fourier_series`, 1024 points over one period); the crest next
 * to the jump is located by src/core/labs/fourier.ts (`firstCrest`, a refined search on the same series),
 * so the readout does not depend on where the plotted points fall. The dotted Gibbs level at
 * (2/π)·Si(π) ≈ 1.179 stays put while N grows: the overshoot narrows, it does not shrink. Series are told
 * apart by stroke pattern and marker shape as well as by colour: solid partial sum, dashed wave, dotted
 * Gibbs level, circle at the crest.
 */
import { firstCrest, GIBBS_PEAK, waveform, type Waveform } from '../../core/labs/fourier.ts';
import { fixed, percent, upTo } from '../../core/labs/format.ts';
import { functionPath, polylinePath } from '../../core/labs/path.ts';
import { linearScale } from '../../core/labs/scale.ts';
import { fourierSummary } from '../../core/labs/summary.ts';
import { ticksWithin } from '../../core/labs/ticks.ts';
import type { ParamSpec, Widget } from '../../core/labs/widgets.ts';
import { loadSignal, type SignalKernel } from '../../adapters/wasm/signal.ts';
import {
  drawAxes,
  LabElement,
  legend,
  markerPath,
  plot,
  svg,
  ticks,
  type ControlOptions,
  type LabKey,
} from './ft-lab-kit.ts';

const W = 640;
const H = 320;
const POINTS = 1024;
const sx = linearScale(0, 2 * Math.PI, 52, W - 16);
const sy = linearScale(-1.5, 1.5, H - 36, 16);

/** The waveform as exact segments (its jumps drawn as vertical strokes). */
const REFERENCE: Readonly<Record<Waveform, readonly (readonly [number, number])[]>> = {
  square: [
    [0, 0],
    [0, 1],
    [Math.PI, 1],
    [Math.PI, -1],
    [2 * Math.PI, -1],
    [2 * Math.PI, 0],
  ],
  sawtooth: [
    [0, 0],
    [Math.PI, 1],
    [Math.PI, -1],
    [2 * Math.PI, 0],
  ],
  triangle: [
    [0, 0],
    [Math.PI / 2, 1],
    [(3 * Math.PI) / 2, -1],
    [2 * Math.PI, 0],
  ],
};

const PI_TICKS = [0, 0.5, 1, 1.5, 2];

class FtLabFourier extends LabElement<SignalKernel> {
  readonly widget: Widget = 'fourier';
  #axes!: SVGGElement;
  #reference!: SVGPathElement;
  #gibbs!: SVGPathElement;
  #sum!: SVGPathElement;
  #crest!: SVGPathElement;
  #peak!: HTMLElement;
  #overshoot!: HTMLElement;
  #error!: HTMLElement;

  protected load(): Promise<SignalKernel> {
    return loadSignal();
  }

  protected override controlOptions(spec: ParamSpec): ControlOptions {
    return spec.key === 'wave' ? { optionLabel: (o) => this.t(`fourier.wave.${o}` as LabKey) } : {};
  }

  protected build(): void {
    const svgEl = plot(this.plots, W, H, this.t('fourier.legend.sum'), this.summaryId);
    this.#axes = svg('g', {}, svgEl);
    this.#gibbs = svg('path', { class: 'lab__series lab__series--level' }, svgEl);
    this.#reference = svg('path', { class: 'lab__series lab__series--ref' }, svgEl);
    this.#sum = svg('path', { class: 'lab__series lab__series--main' }, svgEl);
    this.#crest = svg('path', { class: 'lab__marker' }, svgEl);
    this.plots.append(
      legend(
        [
          { label: this.t('fourier.legend.sum'), line: 'lab__series lab__series--main' },
          { label: this.t('fourier.legend.wave'), line: 'lab__series lab__series--ref' },
          { label: this.t('fourier.legend.gibbs'), line: 'lab__series lab__series--level' },
          { label: this.t('fourier.legend.crest'), marker: 'circle' },
        ],
        this.t('lab.legend'),
      ),
    );
    this.#peak = this.readout(this.t('fourier.peak'));
    this.#overshoot = this.readout(this.t('fourier.overshoot'));
    this.readout(this.t('fourier.limit')).textContent = percent(this.locale, (GIBBS_PEAK - 1) / 2, 2);
    this.#error = this.readout(this.t('fourier.error'));
    const yTicks = ticksWithin(-1.5, 1.5, 7);
    drawAxes(
      this.#axes,
      sx,
      sy,
      ticks(
        PI_TICKS.map((k) => k * Math.PI),
        (v) => {
          const k = v / Math.PI;
          return k === 0 ? '0' : k === 1 ? 'π' : k === 2 ? '2π' : `${upTo(this.locale, k * 2, 0)}π/2`;
        },
      ),
      ticks(yTicks.ok ? yTicks.value.values : [], (v) => upTo(this.locale, v, 1)),
      { x: this.t('fourier.axis.x') },
    );
  }

  protected render(kernel: SignalKernel): string {
    const wave = this.str('wave') as Waveform;
    const n = this.num('N');
    const sigma = this.flag('sigma');
    const values = kernel.fourierSeries(wave, n, POINTS, { sigma, cycles: 1 });
    const xs = Array.from({ length: POINTS + 1 }, (_, j) => (2 * Math.PI * j) / POINTS);
    const ys = Array.from({ length: POINTS + 1 }, (_, j) => values[j % POINTS] ?? 0);
    this.#sum.setAttribute('d', polylinePath(xs, ys, sx, sy));
    const ref = REFERENCE[wave];
    this.#reference.setAttribute(
      'd',
      polylinePath(
        ref.map((p) => p[0]),
        ref.map((p) => p[1]),
        sx,
        sy,
      ),
    );
    const crest = firstCrest(wave, n, sigma);
    const hasJump = wave !== 'triangle';
    this.#gibbs.setAttribute(
      'd',
      hasJump
        ? `${functionPath(() => GIBBS_PEAK, 0, 2 * Math.PI, 2, sx, sy)}${functionPath(() => -GIBBS_PEAK, 0, 2 * Math.PI, 2, sx, sy)}`
        : '',
    );
    this.#crest.setAttribute('d', crest === null ? '' : markerPath('circle', sx.map(crest.x), sy.map(crest.peak), 4.5));
    // Error away from the jumps (at least π/4 from each): there it shrinks as N grows; at a jump the
    // series converges to the midpoint, and next to it the overshoot persists.
    const jumps = wave === 'square' ? [0, Math.PI, 2 * Math.PI] : wave === 'sawtooth' ? [Math.PI] : [];
    let maxError = 0;
    for (let j = 0; j < POINTS; j++) {
      const x = xs[j] ?? 0;
      if (jumps.some((at) => Math.abs(x - at) < Math.PI / 4)) continue;
      maxError = Math.max(maxError, Math.abs((values[j] ?? 0) - waveform(wave, x)));
    }
    this.#peak.textContent = crest === null ? this.t('unit.none') : fixed(this.locale, crest.peak, 4);
    this.#overshoot.textContent = crest === null ? this.t('unit.none') : percent(this.locale, crest.fraction, 2);
    this.#error.textContent = fixed(this.locale, maxError, 3);
    return fourierSummary(this.locale, { wave, harmonics: n, sigma, crest, maxError });
  }
}

if (!customElements.get('ft-lab-fourier')) customElements.define('ft-lab-fourier', FtLabFourier);
