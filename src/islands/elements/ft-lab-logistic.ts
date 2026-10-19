/**
 * <ft-lab-logistic> — the logistic map x ↦ r·x·(1 − x): bifurcation diagram, cobweb orbit and Lyapunov
 * exponent (May 1976; Feigenbaum 1978; src/content/labs/{pt,en}/{mapa-logistico,logistic-map}.md).
 *
 * `dynamics.wasm` computes the attractor density over r ∈ [2.5, 4] (`logistic_bifurcation`), drawn on a
 * canvas, the only dense image of the labs: counts are tone-mapped (src/core/labs/logistic.ts `toneMap`)
 * into the alpha of the ink colour read from CSS at run time (getComputedStyle; CanvasText in forced
 * colours), so the paper shows through in every theme. The image does not depend on r and is recomputed
 * only on resize or theme change. Over it, an SVG layer marks the current r (solid) and the
 * period-doubling points 3 and 1 + √6 ≈ 3.449 (dashed, labelled). The cobweb (`logistic_orbit`) and λ(r)
 * (`lyapunov_curve`, `logistic_lyapunov`) are SVG; the sign of λ is printed as words.
 */
import { fixed, upTo } from '../../core/labs/format.ts';
import { detectPeriod, exponentSign, PERIOD_DOUBLINGS, toneMap } from '../../core/labs/logistic.ts';
import { cobwebPoints, functionPath, polylinePath } from '../../core/labs/path.ts';
import { linearScale } from '../../core/labs/scale.ts';
import { logisticSummary } from '../../core/labs/summary.ts';
import { ticksWithin } from '../../core/labs/ticks.ts';
import type { ParamSpec, Widget } from '../../core/labs/widgets.ts';
import { loadDynamics, type DynamicsKernel } from '../../adapters/wasm/dynamics.ts';
import {
  drawAxes,
  html,
  LabElement,
  legend,
  markerPath,
  plot,
  rgba,
  svg,
  ticks,
  type ControlOptions,
  type LabKey,
} from './ft-lab-kit.ts';

const R_MIN = 2.5;
const R_MAX = 4;
const BW = 640;
const BH = 320;
const COB = 320;
const LW = 640;
const LH = 200;
const LAMBDA_MIN = -2;
const LAMBDA_MAX = 1;
/** Only the first two doublings are labelled; the later ones crowd within 0.03 of each other. */
const LABELLED = PERIOD_DOUBLINGS.slice(0, 2);

const bx = linearScale(R_MIN, R_MAX, 0, BW);
const cx = linearScale(0, 1, 40, COB - 12);
const cy = linearScale(0, 1, COB - 28, 12);
const lx = linearScale(R_MIN, R_MAX, 52, LW - 16);
const ly = linearScale(LAMBDA_MIN, LAMBDA_MAX, LH - 28, 12);

class FtLabLogistic extends LabElement<DynamicsKernel> {
  readonly widget: Widget = 'logistic';
  #canvas!: HTMLCanvasElement;
  #overlay!: SVGGElement;
  #cursor!: SVGPathElement;
  #map!: SVGPathElement;
  #web!: SVGPathElement;
  #lambdaCurve!: SVGPathElement;
  #lambdaCursor!: SVGPathElement;
  #lambdaPoint!: SVGPathElement;
  #lambda!: HTMLElement;
  #sign!: HTMLElement;
  #period!: HTMLElement;
  #resize: ResizeObserver | null = null;

  protected load(): Promise<DynamicsKernel> {
    return loadDynamics();
  }

  protected override controlOptions(spec: ParamSpec): ControlOptions {
    return { format: (v) => fixed(this.locale, v, spec.key === 'r' ? 3 : 2) };
  }

  protected build(): void {
    const wrap = html('div', { class: 'lab__canvas-wrap' }, undefined, this.plots);
    this.#canvas = html('canvas', {
      class: 'lab__canvas',
      role: 'img',
      'aria-label': this.t('logistic.bifurcation'),
      'aria-describedby': this.summaryId,
    });
    wrap.append(this.#canvas);
    const over = plot(wrap, BW, BH, this.t('logistic.bifurcation'), this.summaryId);
    over.classList.add('lab__overlay');
    over.setAttribute('aria-hidden', 'true');
    this.#overlay = svg('g', {}, over);
    for (const d of LABELLED) {
      const x = bx.map(d.r);
      svg('path', { class: 'lab__series lab__series--limit', d: `M${x} 0V${BH}` }, this.#overlay);
      svg('text', { class: 'lab__mark-label', x: x + 4, y: 14 }, this.#overlay).textContent = fixed(this.locale, d.r, 3);
    }
    this.#cursor = svg('path', { class: 'lab__series lab__series--cursor' }, this.#overlay);

    const lower = html('div', { class: 'lab__plots-row' }, undefined, this.plots);
    const cob = plot(lower, COB, COB, this.t('logistic.cobweb'), this.summaryId);
    cob.classList.add('lab__plot--square');
    const cobAxes = svg('g', {}, cob);
    const t = ticksWithin(0, 1, 5);
    const unit = ticks(t.ok ? t.value.values : [], (v) => upTo(this.locale, v, 1));
    drawAxes(cobAxes, cx, cy, unit, unit, { x: 'x', y: 'y' });
    svg('path', { class: 'lab__series lab__series--ref', d: polylinePath([0, 1], [0, 1], cx, cy) }, cob);
    this.#map = svg('path', { class: 'lab__series lab__series--main' }, cob);
    this.#web = svg('path', { class: 'lab__series lab__series--web' }, cob);

    const lyap = plot(lower, LW, LH, this.t('logistic.lyapunovPlot'), this.summaryId);
    const lAxes = svg('g', {}, lyap);
    const rt = ticksWithin(R_MIN, R_MAX, 6);
    drawAxes(
      lAxes,
      lx,
      ly,
      ticks(rt.ok ? rt.value.values : [], (v) => upTo(this.locale, v, 1)),
      ticks([-2, -1, 0, 1], (v) => upTo(this.locale, v, 0)),
      { x: 'r', y: 'λ' },
    );
    svg('path', { class: 'lab__series lab__series--level', d: `M${lx.map(R_MIN)} ${ly.map(0)}H${lx.map(R_MAX)}` }, lyap);
    this.#lambdaCurve = svg('path', { class: 'lab__series lab__series--main' }, lyap);
    this.#lambdaCursor = svg('path', { class: 'lab__series lab__series--cursor' }, lyap);
    this.#lambdaPoint = svg('path', { class: 'lab__marker' }, lyap);

    this.plots.append(
      legend(
        [
          { label: this.t('logistic.legend.cursor'), line: 'lab__series lab__series--cursor' },
          { label: this.t('logistic.legend.doubling'), line: 'lab__series lab__series--limit' },
          { label: this.t('logistic.legend.map'), line: 'lab__series lab__series--main' },
          { label: this.t('logistic.legend.diagonal'), line: 'lab__series lab__series--ref' },
          { label: this.t('logistic.legend.orbit'), line: 'lab__series lab__series--web' },
        ],
        this.t('lab.legend'),
      ),
    );
    this.#lambda = this.readout(this.t('logistic.lambda'));
    this.#sign = this.readout(this.t('logistic.sign'));
    this.#period = this.readout(this.t('logistic.period'));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#resize = new ResizeObserver(() => this.schedule(true));
    this.#resize.observe(this.#canvas);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize?.disconnect();
    this.#resize = null;
  }

  protected render(kernel: DynamicsKernel, full: boolean): string {
    if (full) {
      this.#paint(kernel);
      const curve = kernel.lyapunovCurve({ rMin: R_MIN, rMax: R_MAX, samples: 480, transient: 300, n: 1000 });
      const rs = Array.from({ length: curve.length }, (_, i) => R_MIN + ((R_MAX - R_MIN) * (i + 0.5)) / curve.length);
      const clamped = Array.from(curve, (v) => Math.max(LAMBDA_MIN, Math.min(LAMBDA_MAX, v)));
      this.#lambdaCurve.setAttribute('d', polylinePath(rs, clamped, lx, ly));
    }
    const r = this.num('r');
    const x0 = this.num('x0');
    this.#cursor.setAttribute('d', `M${bx.map(r)} 0V${BH}`);
    this.#map.setAttribute('d', functionPath((x) => r * x * (1 - x), 0, 1, 121, cx, cy));
    const orbit = kernel.logisticOrbit(r, x0, 600);
    const web = cobwebPoints(orbit.subarray(0, 60));
    this.#web.setAttribute('d', polylinePath(web.xs, web.ys, cx, cy));
    const lambda = kernel.logisticLyapunov(r, x0, 500, 4000);
    const shown = Math.max(LAMBDA_MIN, Math.min(LAMBDA_MAX, lambda));
    this.#lambdaCursor.setAttribute('d', `M${lx.map(r)} ${ly.map(LAMBDA_MIN)}V${ly.map(LAMBDA_MAX)}`);
    this.#lambdaPoint.setAttribute('d', markerPath('circle', lx.map(r), ly.map(shown), 4.5));
    const period = detectPeriod(orbit);
    this.#lambda.textContent = this.t('unit.natsPerIteration', { value: fixed(this.locale, lambda, 3) });
    this.#sign.textContent = this.t(`logistic.sign.${exponentSign(lambda)}` as LabKey);
    this.#period.textContent = period === null ? this.t('logistic.period.none') : upTo(this.locale, period, 0);
    return logisticSummary(this.locale, { r, x0, lambda, period });
  }

  #paint(kernel: DynamicsKernel): void {
    const canvas = this.#canvas;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(64, Math.min(1280, Math.round((canvas.clientWidth || BW) * ratio)));
    const height = Math.round(width / 2);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const image = kernel.logisticBifurcation({ rMin: R_MIN, rMax: R_MAX, width, height, transient: 300, iterations: 600 });
    const alpha = toneMap(image.counts, image.max);
    const [red, green, blue] = rgba(getComputedStyle(canvas).color);
    const pixels = new ImageData(width, height);
    const data = pixels.data;
    for (let i = 0; i < alpha.length; i++) {
      const o = 4 * i;
      data[o] = red;
      data[o + 1] = green;
      data[o + 2] = blue;
      data[o + 3] = alpha[i] ?? 0;
    }
    ctx.putImageData(pixels, 0, 0);
  }
}

if (!customElements.get('ft-lab-logistic')) customElements.define('ft-lab-logistic', FtLabLogistic);
