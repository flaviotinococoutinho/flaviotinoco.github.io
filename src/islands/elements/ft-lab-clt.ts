/**
 * <ft-lab-clt> — the central limit theorem for sums of uniforms (Laplace 1810;
 * src/content/labs/{pt,en}/{limite-central,central-limit}.md).
 *
 * `dynamics.wasm` draws `samples` sums of n i.i.d. U[0, 1) with PCG32 and histograms the standardised sum
 * Zₙ over [−4, 4) (`clt_histogram`, seeded: the same n, samples and seed always give the same bars). The
 * histogram is drawn as a density (bars) against the standard normal density φ (dashed curve); dotted
 * lines mark the support |Zₙ| ≤ √(3n) when it lies inside the window. The readout is the largest gap
 * between the histogram's cumulative distribution and Φ at the bin edges (src/core/labs/clt.ts).
 */
import { binEdges, CLT_RANGE, histogramDensity, ksDistance, normalPdf, supportBound } from '../../core/labs/clt.ts';
import { fixed, upTo } from '../../core/labs/format.ts';
import { barsPath, functionPath } from '../../core/labs/path.ts';
import { linearScale } from '../../core/labs/scale.ts';
import { cltSummary } from '../../core/labs/summary.ts';
import { ticksWithin } from '../../core/labs/ticks.ts';
import type { Widget } from '../../core/labs/widgets.ts';
import { loadDynamics, type DynamicsKernel } from '../../adapters/wasm/dynamics.ts';
import { drawAxes, html, LabElement, legend, plot, svg, ticks } from './ft-lab-kit.ts';

const W = 640;
const H = 320;
const BINS = 64;
const Y_MAX = 0.6;
const sx = linearScale(CLT_RANGE.min, CLT_RANGE.max, 52, W - 16);
const sy = linearScale(0, Y_MAX, H - 36, 16);
const EDGES = binEdges(BINS);

class FtLabClt extends LabElement<DynamicsKernel> {
  readonly widget: Widget = 'clt';
  #bars!: SVGPathElement;
  #support!: SVGPathElement;
  #ks!: HTMLElement;
  #bound!: HTMLElement;

  protected load(): Promise<DynamicsKernel> {
    return loadDynamics();
  }

  protected build(): void {
    const chart = plot(this.plots, W, H, this.t('clt.legend.histogram'), this.summaryId);
    const axes = svg('g', {}, chart);
    const xt = ticksWithin(CLT_RANGE.min, CLT_RANGE.max, 9);
    const yt = ticksWithin(0, Y_MAX, 4);
    drawAxes(
      axes,
      sx,
      sy,
      ticks(xt.ok ? xt.value.values : [], (v) => upTo(this.locale, v, 0)),
      ticks(yt.ok ? yt.value.values : [], (v) => upTo(this.locale, v, 1)),
      { x: this.t('clt.axis.z') },
    );
    this.#bars = svg('path', { class: 'lab__bar' }, chart);
    this.#support = svg('path', { class: 'lab__series lab__series--limit' }, chart);
    svg('path', { class: 'lab__series lab__series--ref', d: functionPath(normalPdf, -4, 4, 241, sx, sy) }, chart);
    this.plots.append(
      legend(
        [
          { label: this.t('clt.legend.histogram'), marker: 'square', markerClass: 'lab__bar' },
          { label: this.t('clt.legend.normal'), line: 'lab__series lab__series--ref' },
          { label: this.t('clt.support'), line: 'lab__series lab__series--limit' },
        ],
        this.t('lab.legend'),
      ),
    );
    const redraw = html('button', { type: 'button', class: 'lab__button' }, this.t('clt.redraw'));
    redraw.addEventListener('click', () => {
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      this.set({ seed: (r[0] ?? 0) % 1_000_000 });
    });
    this.actions.prepend(redraw);
    this.#ks = this.readout(this.t('clt.ks'));
    this.#bound = this.readout(this.t('clt.support'));
  }

  protected render(kernel: DynamicsKernel): string {
    const n = this.num('n');
    const samples = this.num('samples');
    const counts = kernel.cltHistogram({ seed: this.num('seed'), terms: n, samples, bins: BINS });
    const width = (CLT_RANGE.max - CLT_RANGE.min) / BINS;
    const density = histogramDensity(counts, samples, width).map((d) => Math.min(Y_MAX, d));
    this.#bars.setAttribute('d', barsPath(EDGES, density, sx, sy));
    const bound = supportBound(n);
    this.#support.setAttribute(
      'd',
      bound < CLT_RANGE.max ? `M${sx.map(-bound)} ${sy.map(0)}V${sy.map(Y_MAX)}M${sx.map(bound)} ${sy.map(0)}V${sy.map(Y_MAX)}` : '',
    );
    const distance = ksDistance(counts, samples, EDGES);
    this.#ks.textContent = fixed(this.locale, distance, 4);
    this.#bound.textContent = fixed(this.locale, bound, 3);
    return cltSummary(this.locale, { n, samples, distance, bound });
  }
}

if (!customElements.get('ft-lab-clt')) customElements.define('ft-lab-clt', FtLabClt);
