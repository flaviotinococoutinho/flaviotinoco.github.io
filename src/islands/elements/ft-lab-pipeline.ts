/**
 * <ft-lab-pipeline> — the pipeline of the essay "O pipeline não cria informação", stage by stage
 * (src/content/labs/{pt,en}/{o-pipeline,the-pipeline}.md; model in src/core/labs/pipeline.ts).
 *
 * The reader builds a pipeline of up to six stages over an exact distribution of 144 sales and chooses the
 * question someone will ask of the output. For the source and after every stage, two bars: the mutual
 * information between the output and the whole sale, and between the output and the question. Both are
 * computed by `information.wasm` (`mutualInformation`) from the joint distribution the model carries
 * through the pipeline; neither ever rises, which is the data processing inequality (Cover & Thomas 2006,
 * Theorem 2.8.1). The stage after which the question stops being fully answered is marked with a dashed
 * bar, an ✕ and a sentence, never by colour alone.
 *
 * The whole state is the word of stages and the question, so the permalink and the scrolly steps are the
 * same operation on a string.
 */
import { fixed, upTo } from '../../core/labs/format.ts';
import {
  ESSAY_PIPELINE,
  FIELDS,
  MAX_STAGES,
  STAGES,
  STAGE_CODE,
  jointMatrix,
  run,
  stagesOf,
  type Stage,
} from '../../core/labs/pipeline.ts';
import { pipelineSummary } from '../../core/labs/summary.ts';
import type { ParamSpec, Widget } from '../../core/labs/widgets.ts';
import { loadInformation, type InformationKernel } from '../../adapters/wasm/information.ts';
import { html, LabElement, type ControlOptions } from './ft-lab-kit.ts';

class FtLabPipeline extends LabElement<InformationKernel> {
  readonly widget: Widget = 'pipeline';
  #add: HTMLButtonElement[] = [];
  #undo!: HTMLButtonElement;
  #chain!: HTMLOListElement;
  #source!: HTMLElement;
  #entropyQ!: HTMLElement;
  #kept!: HTMLElement;
  #sale!: HTMLElement;
  #verdict!: HTMLElement;

  protected load(): Promise<InformationKernel> {
    return loadInformation();
  }

  protected override controlOptions(spec: ParamSpec): ControlOptions {
    return spec.key === 'question'
      ? { optionLabel: (option) => this.t(`pipeline.question.${FIELDS.find((f) => f === option) ?? 'shop'}`) }
      : {};
  }

  #push(stage: Stage): void {
    const stages = this.str('stages');
    if (stages.length >= MAX_STAGES) return;
    this.set({ stages: stages + STAGE_CODE[stage] });
  }

  protected build(): void {
    const root = html('div', { class: 'pipeline' }, undefined, this.plots);

    const bar = html(
      'div',
      { class: 'pipeline__add', role: 'group', 'aria-label': this.t('pipeline.add') },
      undefined,
      root,
    );
    this.#add = STAGES.map((stage) => {
      const button = html(
        'button',
        { type: 'button', class: 'lab__button' },
        `+ ${this.t(`pipeline.stage.${stage}`)}`,
        bar,
      );
      button.addEventListener('click', () => this.#push(stage));
      return button;
    });
    const edit = html('div', { class: 'pipeline__edit' }, undefined, root);
    this.#undo = html('button', { type: 'button', class: 'lab__button' }, this.t('pipeline.undo'), edit);
    this.#undo.addEventListener('click', () => this.set({ stages: this.str('stages').slice(0, -1) }));
    const reset = html('button', { type: 'button', class: 'lab__button' }, this.t('pipeline.reset'), edit);
    reset.addEventListener('click', () => this.set({ stages: ESSAY_PIPELINE }));
    html('p', { class: 'lab__note' }, this.t('pipeline.hint'), root);

    const figure = html('figure', { class: 'pipeline__figure' }, undefined, root);
    html('figcaption', { class: 'lab__heading' }, this.t('pipeline.chain'), figure);
    this.#chain = html('ol', { class: 'pipeline__chain', role: 'list' }, undefined, figure);
    html('p', { class: 'lab__note' }, this.t('pipeline.chain.note'), figure);

    this.#source = this.readout(this.t('pipeline.readout.source'));
    this.#entropyQ = this.readout(this.t('pipeline.readout.question'));
    this.#kept = this.readout(this.t('pipeline.readout.kept'));
    this.#sale = this.readout(this.t('pipeline.readout.sale'));
    this.#verdict = this.readout(this.t('pipeline.readout.verdict'));
  }

  protected render(kernel: InformationKernel): string {
    const question = FIELDS.find((f) => f === this.str('question')) ?? 'shop';
    const result = run(stagesOf(this.str('stages')), question);
    for (const button of this.#add) button.disabled = result.stages.length >= MAX_STAGES;
    this.#undo.disabled = result.stages.length === 0;

    // The kernel computes what is shown; the model's own figures decide only the loss marker and the verdict.
    const bits = (value: number): string => this.t('pipeline.bits', { value: fixed(this.locale, value, 2) });
    const measured = result.results.map((stage) => {
      const x = jointMatrix(stage.joint, null);
      const q = jointMatrix(stage.joint, question);
      const sale = kernel.mutualInformation(x.matrix, x.rows, x.cols);
      const answer = kernel.mutualInformation(q.matrix, q.rows, q.cols);
      return { stage, sale: Number.isFinite(sale) ? sale : 0, answer: Number.isFinite(answer) ? answer : 0 };
    });

    const max = result.sourceEntropy;
    const label = this.t(`pipeline.question.${question}`);
    this.#chain.replaceChildren(
      ...measured.map(({ stage, sale, answer }, k) => {
        const item = document.createElement('li');
        item.className = 'pipeline__row';
        const lost = result.firstLoss === k;
        if (lost) item.setAttribute('data-loss', '');
        html(
          'p',
          { class: 'pipeline__name' },
          stage.stage === null
            ? this.t('pipeline.row.source')
            : this.t('pipeline.row.stage', {
                n: upTo(this.locale, k, 0),
                stage: this.t(`pipeline.stage.${stage.stage}`),
              }),
          item,
        );
        const bars = html('div', { class: 'pipeline__bars', 'aria-hidden': 'true' }, undefined, item);
        const whole = html('span', { class: 'pipeline__bar pipeline__bar--sale' }, undefined, bars);
        whole.style.setProperty('--share', String(max > 0 ? sale / max : 0));
        const part = html('span', { class: 'pipeline__bar pipeline__bar--question' }, undefined, bars);
        part.style.setProperty('--share', String(max > 0 ? answer / max : 0));
        html(
          'p',
          { class: 'pipeline__figures' },
          [
            this.t('pipeline.row.sale', { value: bits(sale) }),
            this.t('pipeline.row.question', { question: label, value: bits(answer) }),
            this.t('pipeline.row.outcomes', { n: upTo(this.locale, stage.outcomes, 0) }),
          ].join(' · '),
          item,
        );
        if (lost) html('p', { class: 'pipeline__loss' }, `✕ ${this.t('pipeline.row.loss')}`, item);
        return item;
      }),
    );

    const last = measured.at(-1);
    this.#source.textContent = bits(result.sourceEntropy);
    this.#entropyQ.textContent = bits(result.questionEntropy);
    this.#kept.textContent = bits(last?.answer ?? 0);
    this.#sale.textContent = bits(last?.sale ?? 0);
    this.#verdict.textContent =
      result.firstLoss === null
        ? this.t('pipeline.yes')
        : this.t('pipeline.no', { n: upTo(this.locale, result.firstLoss, 0) });
    this.#verdict.toggleAttribute('data-alert', result.firstLoss !== null);
    return pipelineSummary(this.locale, result);
  }
}

if (!customElements.get('ft-lab-pipeline')) customElements.define('ft-lab-pipeline', FtLabPipeline);
