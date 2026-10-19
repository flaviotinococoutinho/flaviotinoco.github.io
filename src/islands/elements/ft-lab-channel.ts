/**
 * <ft-lab-channel> — the binary symmetric channel and its capacity C(p) = 1 − H₂(p) (Shannon 1948;
 * src/content/labs/{pt,en}/{canal-ruidoso,noisy-channel}.md).
 *
 * `information.wasm` evaluates C and H₂ (`bsc_capacity`, `binary_entropy`) along p ∈ [0, 1] and at the
 * current p, drawn as a circle on the solid capacity curve (H₂ dashed). Below, a bit string is sent
 * through the channel by src/core/labs/channel.ts (`transmit`, seeded, so a permalink reproduces it):
 * flipped bits are marked by underline, weight and a ▲ under them (labs.css), never by colour alone.
 */
import { bscCapacity as pureCapacity, transmit } from '../../core/labs/channel.ts';
import { fixed, percent, upTo } from '../../core/labs/format.ts';
import { polylinePath } from '../../core/labs/path.ts';
import { linearScale } from '../../core/labs/scale.ts';
import { channelSummary } from '../../core/labs/summary.ts';
import { ticksWithin } from '../../core/labs/ticks.ts';
import type { ParamSpec, Widget } from '../../core/labs/widgets.ts';
import { loadInformation, type InformationKernel } from '../../adapters/wasm/information.ts';
import { drawAxes, html, LabElement, legend, markerPath, plot, svg, ticks, type ControlOptions } from './ft-lab-kit.ts';

const W = 640;
const H = 300;
const SAMPLES = 201;
const sx = linearScale(0, 1, 52, W - 16);
const sy = linearScale(0, 1.05, H - 36, 16);

class FtLabChannel extends LabElement<InformationKernel> {
  readonly widget: Widget = 'channel';
  #axes!: SVGGElement;
  #capacity!: SVGPathElement;
  #entropy!: SVGPathElement;
  #cross!: SVGPathElement;
  #point!: SVGPathElement;
  #sent!: HTMLElement;
  #received!: HTMLElement;
  #c!: HTMLElement;
  #h2!: HTMLElement;
  #flips!: HTMLElement;
  #curvesDrawn = false;

  protected load(): Promise<InformationKernel> {
    return loadInformation();
  }

  protected override controlOptions(spec: ParamSpec): ControlOptions {
    return spec.key === 'p' ? { format: (v) => fixed(this.locale, v, 3) } : {};
  }

  protected build(): void {
    const chart = plot(this.plots, W, H, this.t('channel.legend.capacity'), this.summaryId);
    this.#axes = svg('g', {}, chart);
    this.#entropy = svg('path', { class: 'lab__series lab__series--ref' }, chart);
    this.#capacity = svg('path', { class: 'lab__series lab__series--main' }, chart);
    this.#cross = svg('path', { class: 'lab__series lab__series--level' }, chart);
    this.#point = svg('path', { class: 'lab__marker' }, chart);
    this.plots.append(
      legend(
        [
          { label: this.t('channel.legend.capacity'), line: 'lab__series lab__series--main' },
          { label: this.t('channel.legend.entropy'), line: 'lab__series lab__series--ref' },
          { label: this.t('channel.legend.point'), marker: 'circle' },
        ],
        this.t('lab.legend'),
      ),
    );
    const yt = ticksWithin(0, 1, 6);
    const xt = ticksWithin(0, 1, 6);
    drawAxes(
      this.#axes,
      sx,
      sy,
      ticks(xt.ok ? xt.value.values : [], (v) => upTo(this.locale, v, 1)),
      ticks(yt.ok ? yt.value.values : [], (v) => upTo(this.locale, v, 1)),
      { x: this.t('channel.axis.p'), y: this.t('channel.axis.bits') },
    );

    const wire = html('div', { class: 'lab__transmission' }, undefined, this.plots);
    const row = (label: string): HTMLElement => {
      const line = html('p', { class: 'lab__bits-row' }, undefined, wire);
      html('span', { class: 'lab__bits-label' }, label, line);
      return html('span', { class: 'lab__bits' }, undefined, line);
    };
    this.#sent = row(this.t('channel.sent'));
    this.#received = row(this.t('channel.received'));
    html('p', { class: 'lab__note' }, this.t('channel.flipNote'), wire);

    const redraw = html('button', { type: 'button', class: 'lab__button' }, this.t('channel.redraw'));
    redraw.addEventListener('click', () => {
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      this.set({ seed: (r[0] ?? 0) % 1_000_000 });
    });
    this.actions.prepend(redraw);
    this.#c = this.readout(this.t('channel.capacity'));
    this.#h2 = this.readout(this.t('channel.h2'));
    this.#flips = this.readout(this.t('channel.flips'));
  }

  protected render(kernel: InformationKernel, full: boolean): string {
    if (full || !this.#curvesDrawn) {
      const ps = Array.from({ length: SAMPLES }, (_, i) => i / (SAMPLES - 1));
      this.#capacity.setAttribute('d', polylinePath(ps, ps.map(kernel.bscCapacity), sx, sy));
      this.#entropy.setAttribute('d', polylinePath(ps, ps.map(kernel.binaryEntropy), sx, sy));
      this.#curvesDrawn = true;
    }
    const p = this.num('p');
    const c = kernel.bscCapacity(p);
    const h2 = kernel.binaryEntropy(p);
    const x = sx.map(p);
    const y = sy.map(Number.isFinite(c) ? c : pureCapacity(p));
    this.#cross.setAttribute('d', `M${x} ${sy.map(0)}V${y}H${sx.map(0)}`);
    this.#point.setAttribute('d', markerPath('circle', x, y, 5));

    const bits = this.str('bits');
    const tx = transmit(bits, p, this.num('seed'));
    this.#sent.textContent = tx.sent;
    this.#received.replaceChildren(
      ...[...tx.received].map((bit, i) =>
        tx.flips[i] === true ? html('mark', { class: 'lab__flip' }, bit) : document.createTextNode(bit),
      ),
    );
    this.#c.textContent = this.t('unit.bitsPerUse', { value: fixed(this.locale, c, 3) });
    this.#h2.textContent = fixed(this.locale, h2, 3);
    const n = tx.flips.length;
    this.#flips.textContent = this.t('channel.flipCount', {
      flips: upTo(this.locale, tx.flipCount, 0),
      n: upTo(this.locale, n, 0),
      rate: percent(this.locale, n > 0 ? tx.flipCount / n : 0, 1),
    });
    const positions = tx.flips.flatMap((f, i) => (f ? [i + 1] : []));
    return channelSummary(this.locale, { p, capacity: c, flips: tx.flipCount, bits: n, positions });
  }
}

if (!customElements.get('ft-lab-channel')) customElements.define('ft-lab-channel', FtLabChannel);
