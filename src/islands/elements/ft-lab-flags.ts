/**
 * <ft-lab-flags> — the video player of "A segunda flag" in two representations fed with the same events
 * (src/content/labs/{pt,en}/{flags-e-estados,flags-and-states}.md; model in src/core/labs/flags.ts).
 *
 * Four buttons send play(), pause(), stop() and rewind(). On the left, three boolean flags updated by the
 * essay's methods; on the right, the automaton with the essay's transition table. Below, the eight
 * configurations three flags allow: the four that describe a situation and the four that describe none,
 * with the current one outlined and a count of how often each occurred. `information.wasm` gives the
 * entropy of the configurations that occurred (`entropyCounts`), from which the redundancy of the history
 * follows. Nothing is told by colour alone: on/off is a filled or hollow square plus the word, the current
 * state is a filled marker plus a label, a meaningless configuration is a dashed cell with a ×.
 *
 * The whole state is the history (parameter `events`, one letter per event), so the permalink, the
 * scrolly steps and the "undo" button are all the same operation on a string.
 */
import {
  EVENT_CODE,
  FLAG_NAMES,
  MAX_EVENTS,
  PLAYER_EVENTS,
  PLAYER_STATES,
  bitsOf,
  configurations,
  eventsOf,
  flagsOfIndex,
  meaningOf,
  minRedundancy,
  redundancy,
  run,
  type PlayerEvent,
} from '../../core/labs/flags.ts';
import { fixed, percent, upTo } from '../../core/labs/format.ts';
import { flagsSummary } from '../../core/labs/summary.ts';
import type { Widget } from '../../core/labs/widgets.ts';
import { loadInformation, type InformationKernel } from '../../adapters/wasm/information.ts';
import { html, LabElement } from './ft-lab-kit.ts';

const N = FLAG_NAMES.length;
const K = PLAYER_STATES.length;
const ON = '■';
const OFF = '□';

class FtLabFlags extends LabElement<InformationKernel> {
  readonly widget: Widget = 'flags';
  #send: HTMLButtonElement[] = [];
  #undo!: HTMLButtonElement;
  #lamps: { readonly mark: HTMLElement; readonly value: HTMLElement }[] = [];
  #flagsVerdict!: HTMLElement;
  #states: HTMLElement[] = [];
  #last!: HTMLElement;
  #cells: { readonly cell: HTMLElement; readonly visits: HTMLElement; readonly here: HTMLElement }[] = [];
  #entropy!: HTMLElement;
  #redundancy!: HTMLElement;
  #refused!: HTMLElement;

  protected load(): Promise<InformationKernel> {
    return loadInformation();
  }

  #push(event: PlayerEvent): void {
    const events = this.str('events');
    if (events.length >= MAX_EVENTS) return;
    this.set({ events: events + EVENT_CODE[event] });
  }

  protected build(): void {
    const root = html('div', { class: 'flags' }, undefined, this.plots);

    const bar = html(
      'div',
      { class: 'flags__events', role: 'group', 'aria-label': this.t('flags.send') },
      undefined,
      root,
    );
    this.#send = PLAYER_EVENTS.map((event) => {
      const button = html(
        'button',
        { type: 'button', class: 'lab__button flags__event' },
        this.t(`flags.event.${event}`),
        bar,
      );
      button.addEventListener('click', () => this.#push(event));
      return button;
    });
    this.#undo = html('button', { type: 'button', class: 'lab__button flags__undo' }, this.t('flags.undo'), bar);
    this.#undo.addEventListener('click', () => this.set({ events: this.str('events').slice(0, -1) }));
    html('p', { class: 'lab__note flags__hint' }, this.t('flags.hint'), root);

    const models = html('div', { class: 'flags__models' }, undefined, root);

    const left = html(
      'div',
      { class: 'flags__model', role: 'group', 'aria-label': this.t('flags.model.flags') },
      undefined,
      models,
    );
    html('p', { class: 'lab__heading' }, this.t('flags.model.flags'), left);
    const lamps = html('ul', { class: 'flags__lamps', role: 'list' }, undefined, left);
    this.#lamps = FLAG_NAMES.map((name) => {
      const item = html('li', { class: 'flags__lamp' }, undefined, lamps);
      const mark = html('span', { class: 'flags__mark', 'aria-hidden': 'true' }, OFF, item);
      html('code', {}, name, item);
      const value = html('span', { class: 'flags__value' }, this.t('flags.false'), item);
      return { mark, value };
    });
    const verdict = html('p', { class: 'flags__verdict' }, undefined, left);
    html('span', { class: 'flags__label' }, `${this.t('flags.situation')}: `, verdict);
    this.#flagsVerdict = html('strong', {}, undefined, verdict);

    const right = html(
      'div',
      { class: 'flags__model', role: 'group', 'aria-label': this.t('flags.model.machine') },
      undefined,
      models,
    );
    html('p', { class: 'lab__heading' }, this.t('flags.model.machine'), right);
    const states = html('ol', { class: 'flags__states', role: 'list' }, undefined, right);
    this.#states = PLAYER_STATES.map((state) => {
      const item = html('li', { class: 'flags__state' }, undefined, states);
      html('span', { class: 'flags__mark', 'aria-hidden': 'true' }, OFF, item);
      html('span', {}, this.t(`flags.state.${state}`), item);
      html('span', { class: 'visually-hidden flags__current' }, '', item);
      return item;
    });
    const last = html('p', { class: 'flags__verdict' }, undefined, right);
    html('span', { class: 'flags__label' }, `${this.t('flags.last')}: `, last);
    this.#last = html('strong', {}, undefined, last);

    const grid = html('figure', { class: 'flags__grid' }, undefined, root);
    html('figcaption', { class: 'lab__heading' }, this.t('flags.grid'), grid);
    const cells = html('ol', { class: 'flags__cells', role: 'list' }, undefined, grid);
    this.#cells = Array.from({ length: configurations(N) }, (_, index) => {
      const flags = flagsOfIndex(index);
      const meaning = meaningOf(flags);
      const cell = html('li', { class: 'flags__cell' }, undefined, cells);
      if (meaning === null) cell.setAttribute('data-meaningless', '');
      html('code', { class: 'flags__bits' }, bitsOf(flags), cell);
      html(
        'span',
        { class: 'flags__meaning' },
        meaning === null ? `× ${this.t('flags.grid.nothing')}` : this.t(`flags.state.${meaning}`),
        cell,
      );
      const visits = html('span', { class: 'flags__visits' }, '', cell);
      const here = html('span', { class: 'visually-hidden' }, '', cell);
      return { cell, visits, here };
    });
    html('p', { class: 'lab__note' }, this.t('flags.grid.note'), grid);

    this.readout(this.t('flags.configs')).textContent = upTo(this.locale, configurations(N), 0);
    this.readout(this.t('flags.situations')).textContent = upTo(this.locale, K, 0);
    this.readout(this.t('flags.wasted')).textContent = upTo(this.locale, configurations(N) - K, 0);
    this.readout(this.t('flags.bound')).textContent = fixed(this.locale, minRedundancy(N, K), 2);
    this.#entropy = this.readout(this.t('flags.entropy'));
    this.#redundancy = this.readout(this.t('flags.redundancy'));
    this.#refused = this.readout(this.t('flags.refused'));
  }

  protected render(kernel: InformationKernel): string {
    const result = run(eventsOf(this.str('events')));
    const full = result.events.length >= MAX_EVENTS;
    for (const button of this.#send) button.disabled = full;
    this.#undo.disabled = result.events.length === 0;

    FLAG_NAMES.forEach((name, i) => {
      const lamp = this.#lamps[i];
      if (lamp === undefined) return;
      const on = result.flags[name];
      lamp.mark.textContent = on ? ON : OFF;
      lamp.value.textContent = this.t(on ? 'flags.true' : 'flags.false');
    });
    const meaningless = result.meaning === null;
    this.#flagsVerdict.textContent = meaningless
      ? `⚠ ${this.t('flags.meaningless')}`
      : result.disagree
        ? `${this.t(`flags.state.${result.meaning ?? 'stopped'}`)} (${this.t('flags.disagree')})`
        : this.t(`flags.state.${result.meaning ?? 'stopped'}`);
    this.#flagsVerdict.parentElement?.toggleAttribute('data-alert', meaningless || result.disagree);

    PLAYER_STATES.forEach((state, i) => {
      const item = this.#states[i];
      if (item === undefined) return;
      const current = state === result.machine;
      item.toggleAttribute('data-current', current);
      const mark = item.querySelector('.flags__mark');
      if (mark !== null) mark.textContent = current ? ON : OFF;
      const label = item.querySelector('.flags__current');
      if (label !== null) label.textContent = current ? ` (${this.t('flags.current')})` : '';
    });
    const lastRow = result.trace.at(-1);
    this.#last.textContent =
      lastRow === undefined
        ? this.t('flags.last.none')
        : this.t(lastRow.accepted ? 'flags.last.accepted' : 'flags.last.refused', {
            event: this.t(`flags.event.${lastRow.event}`),
          });
    this.#last.parentElement?.toggleAttribute('data-alert', lastRow !== undefined && !lastRow.accepted);

    const index = Number.parseInt(bitsOf(result.flags), 2);
    this.#cells.forEach(({ cell, visits, here }, i) => {
      const count = result.visits[i] ?? 0;
      cell.toggleAttribute('data-current', i === index);
      cell.toggleAttribute('data-visited', count > 0);
      visits.textContent = this.t('flags.grid.visits', { n: upTo(this.locale, count, 0) });
      here.textContent = i === index ? ` (${this.t('flags.grid.here')})` : '';
    });

    const h = kernel.entropyCounts(result.visits);
    const entropy = Number.isFinite(h) ? h : 0;
    this.#entropy.textContent = this.t('flags.bits', { value: fixed(this.locale, entropy, 2) });
    this.#redundancy.textContent = percent(this.locale, redundancy(entropy, N), 0);
    this.#refused.textContent = upTo(this.locale, result.refused, 0);
    return flagsSummary(this.locale, result);
  }
}

if (!customElements.get('ft-lab-flags')) customElements.define('ft-lab-flags', FtLabFlags);
