/**
 * <ft-concept-compare> — "compare two concepts" (ComparePanel.astro).
 *
 * Loads /ontology.graph.json, decodes it with the core (decodeGraphJson rebuilds
 * the extended taxonomy and the intrinsic IC with the same functions as the
 * build), fills the two selects and, on submit, shows the lowest common
 * subsumers, the most informative one, the IC of both concepts, the Lin and
 * Resnik similarities (src/core/ontology/measures.ts) and the cheapest typed path
 * (src/core/ontology/paths.ts). The result region is aria-live="polite".
 * Without JavaScript the form stays hidden and a note says why.
 */
import type { ConceptId } from '../../core/domain/identifiers.ts';
import { parseLocale, type Locale } from '../../core/domain/locale.ts';
import { decodeGraphJson, type ClientModel } from '../../core/ontology/graphjson.ts';
import { compare } from '../../core/ontology/measures.ts';
import { shortestPath } from '../../core/ontology/paths.ts';
import { categoryOfTaxon, TOP_TAXON } from '../../core/ontology/vocabulary.ts';

const fill = (template: string, params: Readonly<Record<string, string | number>>): string =>
  template.replace(/\{(\w+)\}/gu, (m, k: string) => (k in params ? String(params[k]) : m));

class FtConceptCompare extends HTMLElement {
  #messages: Readonly<Record<string, string>> = {};
  #locale: Locale = 'pt-BR';
  #model: ClientModel | null = null;
  #output: HTMLElement | null = null;
  readonly #abort = new AbortController();

  connectedCallback(): void {
    const locale = parseLocale(this.dataset['locale'] ?? document.documentElement.lang);
    if (locale.ok) this.#locale = locale.value;
    try {
      const parsed: unknown = JSON.parse(this.dataset['i18n'] ?? '{}');
      if (typeof parsed === 'object' && parsed !== null) this.#messages = parsed as Record<string, string>;
    } catch {
      this.#messages = {};
    }
    this.#output = this.querySelector('[data-output]');
    void this.#init();
  }

  disconnectedCallback(): void {
    this.#abort.abort();
  }

  #t(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    return fill(this.#messages[key] ?? key, params);
  }

  #number(v: number): string {
    return new Intl.NumberFormat(this.#locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
  }

  #say(...nodes: (Node | string)[]): void {
    this.#output?.replaceChildren(...nodes);
  }

  async #init(): Promise<void> {
    const form = this.querySelector<HTMLFormElement>('form');
    const url = this.dataset['graph'];
    if (form === null || url === undefined) return;
    this.#say(this.#t('loading'));
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      const decoded = decodeGraphJson(await response.json(), this.#locale);
      if (!decoded.ok) throw new Error(decoded.error);
      this.#model = decoded.value;
    } catch {
      this.#say(this.#t('error'));
      return;
    }
    const model = this.#model;
    const collator = new Intl.Collator(this.#locale, { sensitivity: 'base', numeric: true });
    const ids = [...model.ids].sort((a, b) =>
      collator.compare(model.concepts.get(a)?.label ?? a, model.concepts.get(b)?.label ?? b),
    );
    for (const select of form.querySelectorAll('select')) {
      const fallback = select.dataset['default'];
      select.replaceChildren(
        ...ids.map((id) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = model.concepts.get(id)?.label ?? id;
          option.selected = id === fallback;
          return option;
        }),
      );
    }
    form.hidden = false;
    this.querySelector<HTMLElement>('[data-needs-js]')?.setAttribute('hidden', '');
    this.#say();
    form.addEventListener(
      'submit',
      (e) => {
        e.preventDefault();
        const [a, b] = [...form.querySelectorAll('select')].map((select) => select.value);
        this.#run(a ?? '', b ?? '');
      },
      { signal: this.#abort.signal },
    );
  }

  #taxonLabel(taxon: string): string {
    if (taxon === TOP_TAXON) return this.#t('none');
    const category = categoryOfTaxon(taxon);
    if (category !== null) return this.#t(`category.${category}`);
    return this.#model?.concepts.get(taxon as ConceptId)?.label ?? taxon;
  }

  #run(a: string, b: string): void {
    const model = this.#model;
    if (model === null) return;
    if (a === b) {
      this.#say(this.#t('same'));
      return;
    }
    const ca = model.concepts.get(a as ConceptId);
    const cb = model.concepts.get(b as ConceptId);
    if (ca === undefined || cb === undefined) return;
    const c = compare(model.taxonomy, model.ic, a, b);
    const path = shortestPath(model, ca.id, cb.id);

    const summary = document.createElement('p');
    summary.className = 'compare__summary';
    summary.textContent = this.#t('result', {
      a: ca.label,
      b: cb.label,
      lin: this.#number(c.lin),
      resnik: this.#number(c.resnik),
    });

    const dl = document.createElement('dl');
    dl.className = 'compare__table ui';
    const row = (term: string, ...value: (Node | string)[]): void => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.append(...value);
      dl.append(dt, dd);
    };
    const informative = c.lcs.filter((t) => t !== TOP_TAXON);
    row(
      this.#t('lcs'),
      informative.length === 0 ? this.#t('none') : informative.map((t) => this.#taxonLabel(t)).join('; '),
    );
    row(
      this.#t('mica'),
      c.mica === null || c.mica === TOP_TAXON
        ? this.#t('none')
        : `${this.#taxonLabel(c.mica)} (${this.#number(c.icMica)})`,
    );
    row(this.#t('ic'), `${ca.label}: ${this.#number(c.icA)}; ${cb.label}: ${this.#number(c.icB)}`);
    row(this.#t('lin'), this.#number(c.lin));
    row(this.#t('resnik'), this.#number(c.resnik));
    if (path === null) row(this.#t('path'), this.#t('noPath'));
    else {
      const ol = document.createElement('ol');
      ol.className = 'compare__path';
      for (const step of path.steps) {
        const li = document.createElement('li');
        const from = model.concepts.get(step.from)?.label ?? step.from;
        const to = model.concepts.get(step.to)?.label ?? step.to;
        const rel = this.#t(`rel.${step.type}.${step.direction === 'forward' ? 'out' : 'in'}`);
        li.textContent = `${from} — ${rel} → ${to}`;
        ol.append(li);
      }
      const cost = document.createElement('span');
      cost.className = 'compare__cost';
      cost.textContent = this.#t('pathCost', { cost: this.#number(path.cost) });
      row(this.#t('path'), ol, cost);
    }
    this.#say(summary, dl);
  }
}

if (!customElements.get('ft-concept-compare')) customElements.define('ft-concept-compare', FtConceptCompare);
