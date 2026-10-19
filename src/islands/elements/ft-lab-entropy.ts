/**
 * <ft-lab-entropy> — the empirical entropy of a text and its Huffman code (Shannon 1948; Huffman 1952;
 * src/content/labs/{pt,en}/entrop*.md).
 *
 * The text is read as code points or UTF-8 bytes of its NFC form (src/core/labs/entropy.ts counts them);
 * `information.wasm` computes the entropy H of the counts (`entropy_counts`), the Huffman code lengths and
 * their mean L (`huffman_lengths`), and H(Xₙ | Xₙ₋₁) — over bytes directly (`conditional_entropy_bytes`),
 * over code points as H(pairs) − H(first elements) of the overlapping bigrams. Two figures: the most
 * frequent symbols as bars (share and code length ℓ printed beside each), and the inequality
 * H ≤ L < H + 1 on one bit axis: the admissible band [H, H + 1) hatched, H, L and log₂ m as distinct
 * marker shapes with text labels.
 */
import {
  countBigrams,
  countSymbols,
  entropyFigures,
  symbolLabel,
  symbolsOf,
  topSymbols,
  type SymbolUnit,
} from '../../core/labs/entropy.ts';
import { fixed, percent, upTo } from '../../core/labs/format.ts';
import { linearScale } from '../../core/labs/scale.ts';
import type { LabState } from '../../core/labs/state.ts';
import { entropySummary } from '../../core/labs/summary.ts';
import { ticksWithin } from '../../core/labs/ticks.ts';
import type { ParamSpec, Widget } from '../../core/labs/widgets.ts';
import { loadInformation, type InformationKernel } from '../../adapters/wasm/information.ts';
import { clear, LabElement, markerPath, plot, svg, type ControlOptions, type LabKey } from './ft-lab-kit.ts';

const W = 640;
const ROWS = 12;
const ROW = 24;
const BARS_H = ROWS * ROW + 12;
const BOUND_H = 112;

class FtLabEntropy extends LabElement<InformationKernel> {
  readonly widget: Widget = 'entropy';
  #bars!: SVGGElement;
  #bound!: SVGGElement;
  #h!: HTMLElement;
  #cond!: HTMLElement;
  #l!: HTMLElement;
  #total!: HTMLElement;
  #distinct!: HTMLElement;
  #max!: HTMLElement;
  #fixed!: HTMLElement;
  #redundancy!: HTMLElement;

  protected load(): Promise<InformationKernel> {
    return loadInformation();
  }

  protected override localDefaults(): LabState {
    return { text: this.t('entropy.sample') };
  }

  protected override controlOptions(spec: ParamSpec): ControlOptions {
    if (spec.key === 'text') return { multiline: true };
    return { optionLabel: (o) => this.t(`entropy.unit.${o}` as LabKey) };
  }

  protected build(): void {
    const bound = plot(this.plots, W, BOUND_H, this.t('entropy.bound'), this.summaryId);
    this.#bound = svg('g', {}, bound);
    const bars = plot(this.plots, W, BARS_H, this.t('entropy.bars'), this.summaryId);
    this.#bars = svg('g', {}, bars);
    this.#h = this.readout(this.t('entropy.H'));
    this.#l = this.readout(this.t('entropy.L'));
    this.#cond = this.readout(this.t('entropy.cond'));
    this.#total = this.readout(this.t('entropy.total'));
    this.#distinct = this.readout(this.t('entropy.distinct'));
    this.#max = this.readout(this.t('entropy.max'));
    this.#fixed = this.readout(this.t('entropy.fixed'));
    this.#redundancy = this.readout(this.t('entropy.redundancy'));
  }

  protected render(kernel: InformationKernel): string {
    const unit = this.str('unit') as SymbolUnit;
    const text = this.str('text');
    const sequence = symbolsOf(text, unit);
    const stats = countSymbols(sequence);
    const empty = stats.total === 0;
    const h = empty ? 0 : kernel.entropyCounts(stats.counts);
    const code = empty ? { lengths: new Uint32Array(0), expectedLength: 0 } : kernel.huffmanLengths(stats.counts);
    let cond = 0;
    if (unit === 'byte') cond = kernel.conditionalEntropyBytes(text);
    else if (sequence.length > 1) {
      const bigrams = countBigrams(sequence);
      cond = Math.max(0, kernel.entropyCounts(bigrams.pairs) - kernel.entropyCounts(bigrams.firsts));
    }
    const figures = entropyFigures(h, stats.symbols.length);
    const top = topSymbols(stats, code.lengths, ROWS);
    const bits = (v: number | null): string =>
      v === null ? this.t('unit.none') : this.t('unit.bitsPerSymbol', { value: fixed(this.locale, v, 3) });

    this.#h.textContent = bits(h);
    this.#l.textContent = bits(empty ? null : code.expectedLength);
    this.#cond.textContent = bits(sequence.length > 1 ? cond : null);
    this.#total.textContent = upTo(this.locale, stats.total, 0);
    this.#distinct.textContent = upTo(this.locale, figures.distinct, 0);
    this.#max.textContent = bits(figures.maxEntropy);
    this.#fixed.textContent = bits(figures.fixedLength);
    this.#redundancy.textContent =
      figures.redundancy === null ? this.t('unit.none') : percent(this.locale, figures.redundancy, 1);

    this.#drawBars(top, unit);
    this.#drawBound(h, empty ? null : code.expectedLength, figures.maxEntropy);
    const first = top[0];
    return entropySummary(this.locale, {
      unit,
      total: stats.total,
      distinct: figures.distinct,
      entropy: h,
      conditional: cond,
      meanLength: code.expectedLength,
      top: first === undefined ? null : `“${symbolLabel(first.symbol, unit)}”`,
      topShare: first?.probability ?? 0,
    });
  }

  #drawBars(top: ReturnType<typeof topSymbols>, unit: SymbolUnit): void {
    const g = this.#bars;
    clear(g);
    const max = top[0]?.probability ?? 1;
    const sx = linearScale(0, max, 96, W - 168);
    top.forEach((s, i) => {
      const y = 6 + i * ROW;
      svg('text', { class: 'lab__symbol', x: 84, y: y + 16, 'text-anchor': 'end' }, g).textContent = symbolLabel(s.symbol, unit);
      svg('rect', { class: 'lab__bar', x: 96, y: y + 3, width: Math.max(1, sx.map(s.probability) - 96), height: ROW - 8 }, g);
      svg('text', { class: 'lab__tick', x: sx.map(s.probability) + 8, y: y + 16 }, g).textContent =
        `${percent(this.locale, s.probability, 1)} · ${this.t('entropy.codeLength', { n: upTo(this.locale, s.length, 0) })}`;
    });
  }

  #drawBound(h: number, l: number | null, maxEntropy: number | null): void {
    const g = this.#bound;
    clear(g);
    const hi = Math.max(2, Math.ceil(Math.max(h + 1, l ?? 0, maxEntropy ?? 0) + 0.25));
    const sx = linearScale(0, hi, 52, W - 24);
    const base = 84;
    svg('text', { class: 'lab__axis-title', x: 52, y: 16 }, g).textContent = this.t('entropy.bound');
    svg('rect', { class: 'lab__band', x: sx.map(h), y: base - 22, width: sx.map(h + 1) - sx.map(h), height: 22 }, g);
    svg('path', { class: 'lab__axis', d: `M52 ${base}H${W - 24}` }, g);
    const t = ticksWithin(0, hi, Math.min(9, hi + 1));
    for (const v of t.ok ? t.value.values : []) {
      svg('path', { class: 'lab__axis', d: `M${sx.map(v)} ${base}v5` }, g);
      svg('text', { class: 'lab__tick', x: sx.map(v), y: base + 20, 'text-anchor': 'middle' }, g).textContent = upTo(this.locale, v, 1);
    }
    const mark = (value: number, shape: 'triangle' | 'diamond' | 'square', cls: string, label: string, dy: number): void => {
      const x = sx.map(value);
      svg('path', { class: cls, d: markerPath(shape, x, base - 11, 5) }, g);
      svg('text', { class: 'lab__mark-label', x, y: base - 26 - dy, 'text-anchor': 'middle' }, g).textContent = label;
    };
    mark(h, 'triangle', 'lab__marker', this.t('entropy.mark.h'), 0);
    svg('text', { class: 'lab__mark-label', x: sx.map(h + 1), y: base - 26, 'text-anchor': 'middle' }, g).textContent =
      this.t('entropy.mark.h1');
    if (maxEntropy !== null) mark(maxEntropy, 'square', 'lab__marker lab__marker--alt', this.t('entropy.mark.max'), 12);
    if (l !== null) mark(l, 'diamond', 'lab__marker lab__marker--accent', this.t('entropy.mark.l'), 24);
  }
}

if (!customElements.get('ft-lab-entropy')) customElements.define('ft-lab-entropy', FtLabEntropy);
