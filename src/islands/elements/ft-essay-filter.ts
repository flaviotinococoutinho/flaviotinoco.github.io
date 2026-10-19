/**
 * <ft-essay-filter> — quiet facet filter of the essays index (by domain).
 *
 * Without JS the index is the plain list grouped by stratum and no inert
 * control is shown. Here the server-rendered <select> is revealed; choosing a
 * domain hides the essays without it and the groups left empty, and the
 * number shown is announced in the polite status region (CLDR plural rules
 * of the page language; message templates come from data-count-one/-other).
 */
import { matchesDomain } from '../../core/reading/essay.ts';

class FtEssayFilter extends HTMLElement {
  #select: HTMLSelectElement | null = null;
  #status: HTMLElement | null = null;

  connectedCallback(): void {
    const ui = this.querySelector<HTMLElement>('.essay-filter');
    this.#select = this.querySelector<HTMLSelectElement>('.essay-filter__select');
    this.#status = this.querySelector<HTMLElement>('.essay-filter__status');
    if (ui === null || this.#select === null) return;
    ui.hidden = false;
    this.#select.addEventListener('change', this.#apply);
  }

  disconnectedCallback(): void {
    this.#select?.removeEventListener('change', this.#apply);
  }

  readonly #apply = (): void => {
    const selected = this.#select?.value ?? '';
    let shown = 0;
    for (const card of this.querySelectorAll<HTMLElement>('.essay-card')) {
      const show = matchesDomain((card.dataset['domains'] ?? '').split(' '), selected);
      card.hidden = !show;
      if (show) shown += 1;
    }
    for (const group of this.querySelectorAll<HTMLElement>('.essays-index__stratum')) {
      group.hidden = group.querySelector('.essay-card:not([hidden])') === null;
    }
    if (this.#status !== null) {
      const lang = document.documentElement.lang || 'pt-BR';
      const one = new Intl.PluralRules(lang).select(shown) === 'one';
      const template = (one ? this.dataset['countOne'] : this.dataset['countOther']) ?? '{n}';
      this.#status.textContent = template.replace('{n}', new Intl.NumberFormat(lang).format(shown));
    }
  };
}

if (!customElements.get('ft-essay-filter')) customElements.define('ft-essay-filter', FtEssayFilter);
