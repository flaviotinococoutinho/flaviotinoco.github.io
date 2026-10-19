/**
 * <ft-concept-map> — enhances a concept map drawn at build time
 * (src/core/ontology/scene.ts). Without JavaScript the map is a static SVG whose
 * nodes are links, with a legend and the relations listed as text.
 *
 * Every map:
 *   - pan (drag; arrow keys move between concepts and the view follows) and zoom
 *     (buttons, + / − / 0, Ctrl or ⌘ + wheel about the pointer) by rewriting the
 *     viewBox with the pure algebra of src/core/ontology/viewport.ts;
 *   - one tab stop (roving tabindex); arrow keys go to the nearest concept in that
 *     direction (src/core/ontology/spatial.ts, after the CSS Spatial Navigation
 *     draft); Enter follows the link; Escape clears the selection;
 *   - focus + context: the selected concept and its neighbours stay, the rest
 *     recedes (opacity, thinner strokes — never colour alone); announced in the
 *     map's status region (aria-live="polite").
 *
 * The full explorer (the map has data-graph) also:
 *   - selects on the first click and opens the page on a second click;
 *   - filters by stratum (toggle buttons with glyph + label, aria-pressed);
 *   - searches labels and synonyms (accent- and case-insensitive);
 *   - switches between the force layout and the category × stratum grid;
 *   - shows the selected concept in the detail panel of its section, from
 *     /ontology.graph.json decoded by the core (decodeGraphJson);
 *   - stays in sync with <ft-concept-tree> through the document event
 *     "ft-concept-select" ({ id: string | null, origin: Element }).
 */
import { STRATUM_SPECS, isStratum, type Stratum } from '../../core/domain/strata.ts';
import { decodeGraphJson, searchConcepts, type ClientModel } from '../../core/ontology/graphjson.ts';
import { edgeEnds } from '../../core/ontology/scene.ts';
import { nearestInDirection, type Direction } from '../../core/ontology/spatial.ts';
import { isRelationType, RELATIONS, RELATION_TYPES, type RelationType } from '../../core/ontology/vocabulary.ts';
import type { Point } from '../../core/ontology/layout.ts';
import {
  PAN_STEP,
  ZOOM_STEP,
  clientToUser,
  ensureVisible,
  panBy,
  parseTranslate,
  parseViewBox,
  pixelsToUser,
  viewBoxString,
  zoomAt,
  zoomCentre,
  type ViewBox,
} from '../../core/ontology/viewport.ts';
import { parseLocale, type Locale } from '../../core/domain/locale.ts';
import type { ConceptId } from '../../core/domain/identifiers.ts';

export const SELECT_EVENT = 'ft-concept-select';

export interface SelectDetail {
  readonly id: string | null;
  readonly origin: Element;
}

type Layout = 'force' | 'grid';

interface Edge {
  readonly el: SVGLineElement;
  readonly source: string;
  readonly target: string;
  readonly type: RelationType;
}

const KEY_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
/** Pointer travel (px) after which a press becomes a drag (and no longer a click). */
const DRAG_THRESHOLD = 4;
const SVG_NS = 'http://www.w3.org/2000/svg';

const fill = (template: string, params: Readonly<Record<string, string | number>>): string =>
  template.replace(/\{(\w+)\}/gu, (m, k: string) => (k in params ? String(params[k]) : m));

class FtConceptMap extends HTMLElement {
  #svg: SVGSVGElement | null = null;
  #status: HTMLElement | null = null;
  readonly #nodes = new Map<string, SVGAElement>();
  readonly #force = new Map<string, Point>();
  readonly #grid = new Map<string, Point>();
  readonly #edges: Edge[] = [];
  readonly #adjacent = new Map<string, Set<string>>();
  #bases: Record<Layout, ViewBox | null> = { force: null, grid: null };
  #layout: Layout = 'force';
  #view: ViewBox | null = null;
  #current: string | null = null;
  #selected: string | null = null;
  readonly #hidden = new Set<string>();
  #matches: ReadonlySet<string> | null = null;
  #messages: Readonly<Record<string, string>> = {};
  #locale: Locale = 'pt-BR';
  #full = false;
  #model: Promise<ClientModel | null> | null = null;
  #drag: { id: number; x: number; y: number; moved: boolean; view: ViewBox } | null = null;
  #suppressClick = false;
  readonly #abort = new AbortController();

  connectedCallback(): void {
    const svg = this.querySelector<SVGSVGElement>('svg.cmap__svg');
    const base = parseViewBox(svg?.getAttribute('viewBox'));
    if (svg === null || base === null) return;
    this.#svg = svg;
    this.#status = this.querySelector('.cmap__status');
    this.#full = this.dataset['graph'] !== undefined;
    const locale = parseLocale(this.dataset['locale'] ?? document.documentElement.lang);
    if (locale.ok) this.#locale = locale.value;
    try {
      const parsed: unknown = JSON.parse(this.dataset['i18n'] ?? '{}');
      if (typeof parsed === 'object' && parsed !== null) this.#messages = parsed as Record<string, string>;
    } catch {
      this.#messages = {};
    }
    this.#bases = { force: base, grid: parseViewBox(this.dataset['gridViewbox']) };
    this.#view = base;

    for (const a of this.querySelectorAll<SVGAElement>('a.cmap-node')) {
      const id = a.dataset['id'];
      const p = parseTranslate(a.getAttribute('transform'));
      if (id === undefined || p === null) continue;
      this.#nodes.set(id, a);
      this.#force.set(id, p);
      const gx = Number(a.dataset['gx']);
      const gy = Number(a.dataset['gy']);
      if (a.dataset['gx'] !== undefined && Number.isFinite(gx) && Number.isFinite(gy))
        this.#grid.set(id, { x: gx, y: gy });
      a.setAttribute('tabindex', '-1');
    }
    for (const line of this.querySelectorAll<SVGLineElement>('line.cmap-edge[data-source]')) {
      const { source, target, type } = line.dataset;
      if (source === undefined || target === undefined || !isRelationType(type)) continue;
      this.#edges.push({ el: line, source, target, type });
      this.#adjacent.set(source, (this.#adjacent.get(source) ?? new Set()).add(target));
      this.#adjacent.set(target, (this.#adjacent.get(target) ?? new Set()).add(source));
    }
    const focus = this.dataset['focus'];
    this.#setCurrent(focus !== undefined && this.#nodes.has(focus) ? focus : (this.#nodes.keys().next().value ?? null));

    // Reveal the controls and the help text; describe the drawing by them.
    const toolbar = this.querySelector<HTMLElement>('.cmap__toolbar');
    const help = this.querySelector<HTMLElement>('.cmap__help');
    if (toolbar !== null) toolbar.hidden = false;
    if (help !== null) {
      help.hidden = false;
      svg.setAttribute('aria-describedby', help.id);
    }
    if (this.#grid.size === 0) this.querySelector('[data-cmap-layout]')?.closest('.cmap__group')?.remove();
    this.classList.add('is-enhanced');
    this.dataset['layout'] = 'force';

    const signal = this.#abort.signal;
    this.addEventListener('click', this.#onClick, { signal });
    this.addEventListener('keydown', this.#onKeyDown, { signal });
    this.addEventListener('focusin', this.#onFocusIn, { signal });
    this.addEventListener('focusout', this.#onFocusOut, { signal });
    this.addEventListener('pointerover', this.#onPointerOver, { signal });
    this.addEventListener('pointerout', this.#onPointerOut, { signal });
    const viewport = this.querySelector<HTMLElement>('.cmap__viewport');
    if (viewport === null) return;
    viewport.addEventListener('pointerdown', this.#onPointerDown, { signal });
    viewport.addEventListener('pointermove', this.#onPointerMove, { signal });
    viewport.addEventListener('pointerup', this.#onPointerUp, { signal });
    viewport.addEventListener('pointercancel', this.#onPointerUp, { signal });
    viewport.addEventListener('wheel', this.#onWheel, { signal, passive: false });
    this.querySelector<HTMLInputElement>('[data-cmap-search]')?.addEventListener(
      'input',
      (e) => void this.#search(e.currentTarget as HTMLInputElement),
      { signal },
    );
    if (this.#full) {
      document.addEventListener(SELECT_EVENT, this.#onExternalSelect, { signal });
      this.#model = this.#loadModel();
    }
  }

  disconnectedCallback(): void {
    this.#abort.abort();
  }

  // ─── Data ──────────────────────────────────────────────────────────────

  async #loadModel(): Promise<ClientModel | null> {
    const url = this.dataset['graph'];
    if (url === undefined) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const decoded = decodeGraphJson(await response.json(), this.#locale);
      return decoded.ok ? decoded.value : null;
    } catch {
      return null;
    }
  }

  #t(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    return fill(this.#messages[key] ?? '', params);
  }

  #plural(
    base: 'neighbours' | 'visible' | 'matches',
    n: number,
    params: Readonly<Record<string, string | number>> = {},
  ): string {
    const rule = new Intl.PluralRules(this.#locale).select(n);
    return this.#t(`${base}${rule === 'one' ? 'One' : 'Other'}`, { n, ...params });
  }

  #announce(text: string): void {
    if (this.#status === null || text === '') return;
    // Re-setting identical text is not re-announced by every screen reader: clear first.
    this.#status.textContent = '';
    window.requestAnimationFrame(() => {
      if (this.#status !== null) this.#status.textContent = text;
    });
  }

  #label(id: string): string {
    return this.#nodes.get(id)?.querySelector('.cmap-node__label')?.textContent ?? id;
  }

  // ─── View ──────────────────────────────────────────────────────────────

  #base(): ViewBox | null {
    return this.#bases[this.#layout] ?? this.#bases.force;
  }

  #setView(view: ViewBox): void {
    this.#view = view;
    this.#svg?.setAttribute('viewBox', viewBoxString(view));
  }

  #zoom(factor: number, anchor?: Point): void {
    const base = this.#base();
    const view = this.#view;
    if (base === null || view === null) return;
    this.#setView(anchor === undefined ? zoomCentre(base, view, factor) : zoomAt(base, view, factor, anchor));
  }

  #reset(): void {
    const base = this.#base();
    if (base !== null) this.#setView(base);
  }

  #positions(): ReadonlyMap<string, Point> {
    return this.#layout === 'grid' ? this.#grid : this.#force;
  }

  #reveal(id: string): void {
    const base = this.#base();
    const view = this.#view;
    const p = this.#positions().get(id);
    if (base === null || view === null || p === undefined) return;
    const next = ensureVisible(base, view, p, 48);
    if (next !== view) this.#setView(next);
  }

  #setLayout(layout: Layout): void {
    if (layout === this.#layout || (layout === 'grid' && this.#grid.size === 0)) return;
    this.#layout = layout;
    this.dataset['layout'] = layout;
    const positions = this.#positions();
    for (const [id, a] of this.#nodes) {
      const p = positions.get(id);
      if (p !== undefined) a.setAttribute('transform', `translate(${String(p.x)} ${String(p.y)})`);
    }
    for (const e of this.#edges) {
      const p = positions.get(e.source);
      const q = positions.get(e.target);
      const seg = p === undefined || q === undefined ? null : edgeEnds(p, q, e.type);
      e.el.toggleAttribute('hidden', seg === null);
      if (seg === null) continue;
      e.el.setAttribute('x1', String(seg[0].x));
      e.el.setAttribute('y1', String(seg[0].y));
      e.el.setAttribute('x2', String(seg[1].x));
      e.el.setAttribute('y2', String(seg[1].y));
    }
    for (const b of this.querySelectorAll<HTMLButtonElement>('[data-cmap-layout]')) {
      b.setAttribute('aria-pressed', String(b.dataset['cmapLayout'] === layout));
    }
    this.#reset();
    if (this.#selected !== null) this.#reveal(this.#selected);
    this.#announce(this.#t('layoutChanged', { layout: this.#t(layout === 'grid' ? 'layoutGrid' : 'layoutForce') }));
  }

  // ─── Selection, filters, search ────────────────────────────────────────

  #visible(id: string): boolean {
    const stratum = this.#nodes.get(id)?.dataset['stratum'];
    return stratum === undefined || !this.#hidden.has(stratum);
  }

  #setCurrent(id: string | null): void {
    if (this.#current !== null) this.#nodes.get(this.#current)?.setAttribute('tabindex', '-1');
    this.#current = id;
    if (id !== null) this.#nodes.get(id)?.setAttribute('tabindex', '0');
  }

  /** Applies selection, filter and search state to the drawing (classes only; CSS draws the states). */
  #paint(): void {
    const selected = this.#selected;
    const near = selected === null ? null : (this.#adjacent.get(selected) ?? new Set<string>());
    for (const [id, a] of this.#nodes) {
      a.classList.toggle('is-selected', id === selected);
      a.classList.toggle('is-neighbour', near?.has(id) === true);
      a.classList.toggle('is-filtered', !this.#visible(id));
      a.classList.toggle('is-match', this.#matches?.has(id) === true);
      if (id === selected) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    for (const e of this.#edges) {
      e.el.classList.toggle('is-active', selected !== null && (e.source === selected || e.target === selected));
      e.el.classList.toggle('is-filtered', !this.#visible(e.source) || !this.#visible(e.target));
    }
    this.classList.toggle('has-selection', selected !== null);
    this.classList.toggle('has-query', this.#matches !== null);
  }

  #select(id: string | null, options: { readonly announce?: boolean; readonly broadcast?: boolean } = {}): void {
    if (id !== null && !this.#nodes.has(id)) return;
    const changed = id !== this.#selected;
    this.#selected = id;
    if (id !== null) this.#setCurrent(id);
    this.#paint();
    if (!changed) return;
    if (options.announce !== false) {
      if (id === null) this.#announce(this.#t('cleared'));
      else {
        const a = this.#nodes.get(id);
        const stratum = a?.dataset['stratum'] ?? '';
        const category = a?.dataset['category'] ?? '';
        const n = this.#adjacent.get(id)?.size ?? 0;
        this.#announce(
          `${this.#t('selected', { label: this.#label(id), stratum: this.#t(`stratum.${stratum}`), category: this.#t(`category.${category}`) })} ${this.#plural('neighbours', n)}`,
        );
      }
    }
    if (this.#full) {
      void this.#renderDetail(id);
      if (options.broadcast !== false) {
        document.dispatchEvent(new CustomEvent<SelectDetail>(SELECT_EVENT, { detail: { id, origin: this } }));
      }
    }
  }

  #toggleStratum(stratum: string, button: HTMLButtonElement): void {
    const on = button.getAttribute('aria-pressed') !== 'false';
    // Never hide every stratum: the last visible one stays.
    if (on && this.#hidden.size >= 3) return;
    button.setAttribute('aria-pressed', String(!on));
    if (on) this.#hidden.add(stratum);
    else this.#hidden.delete(stratum);
    if (this.#selected !== null && !this.#visible(this.#selected)) this.#select(null, { announce: false });
    if (this.#current !== null && !this.#visible(this.#current)) {
      this.#setCurrent([...this.#nodes.keys()].find((id) => this.#visible(id)) ?? null);
    }
    this.#paint();
    const n = [...this.#nodes.keys()].filter((id) => this.#visible(id)).length;
    this.#announce(this.#plural('visible', n));
  }

  async #search(input: HTMLInputElement): Promise<void> {
    const q = input.value.trim();
    if (q === '') {
      this.#matches = null;
      this.#paint();
      return;
    }
    const model = await this.#model;
    if (input.value.trim() !== q) return; // a newer keystroke superseded this one
    const ids: readonly string[] =
      model === null || model === undefined
        ? [...this.#nodes.keys()].filter((id) =>
            this.#label(id).toLocaleLowerCase(this.#locale).includes(q.toLocaleLowerCase(this.#locale)),
          )
        : searchConcepts(model, q);
    this.#matches = new Set(ids.filter((id) => this.#nodes.has(id)));
    this.#paint();
    const n = this.#matches.size;
    this.#announce(n === 0 ? this.#t('noMatch', { q }) : this.#plural('matches', n, { q }));
  }

  // ─── Detail panel (full explorer) ──────────────────────────────────────

  async #renderDetail(id: string | null): Promise<void> {
    const panel = this.closest('[data-ontology-explorer]')?.querySelector<HTMLElement>('[data-detail]');
    if (panel === null || panel === undefined) return;
    if (id === null) {
      const p = document.createElement('p');
      p.className = 'ui';
      p.textContent = this.#t('detailEmpty');
      panel.replaceChildren(p);
      return;
    }
    const model = await this.#model;
    if (this.#selected !== id) return;
    const concept = model?.concepts.get(id as ConceptId);
    const parts: Node[] = [];

    const title = document.createElement('p');
    title.className = 'explorer__detail-title';
    const link = document.createElement('a');
    link.href = concept?.href ?? this.#nodes.get(id)?.getAttribute('href') ?? '#';
    link.textContent = concept?.label ?? this.#label(id);
    title.append(link);
    parts.push(title);

    const stratum = concept?.stratum ?? this.#nodes.get(id)?.dataset['stratum'];
    const category = concept?.category ?? this.#nodes.get(id)?.dataset['category'];
    const marks = document.createElement('p');
    marks.className = 'explorer__detail-marks ui';
    if (stratum !== undefined && isStratum(stratum)) marks.append(this.#stratumMark(stratum));
    if (category !== undefined) {
      const cat = document.createElement('span');
      cat.className = 'category-mark';
      cat.dataset['category'] = category;
      cat.textContent = this.#t(`category.${category}`);
      marks.append(' ', cat);
    }
    parts.push(marks);

    if (concept !== undefined) {
      const def = document.createElement('p');
      def.className = 'explorer__detail-definition';
      def.textContent = concept.definition;
      parts.push(def);
    }
    if (model !== null && model !== undefined) {
      const list = this.#relationList(model, id as ConceptId);
      if (list !== null) parts.push(list);
    }
    const open = document.createElement('p');
    open.className = 'ui';
    const openLink = document.createElement('a');
    openLink.href = link.href;
    openLink.textContent = this.#t('open');
    open.append(openLink);
    parts.push(open);
    panel.replaceChildren(...parts);
  }

  #stratumMark(stratum: Stratum): HTMLElement {
    const mark = document.createElement('span');
    mark.className = 'stratum-mark';
    mark.dataset['stratum'] = stratum;
    mark.dataset['size'] = 's';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'stratum-mark__glyph');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${STRATUM_SPECS[stratum].glyph}`);
    svg.append(use);
    const label = document.createElement('span');
    label.className = 'stratum-mark__label';
    label.textContent = this.#t(`stratum.${stratum}`);
    mark.append(svg, label);
    return mark;
  }

  /** The concept's links grouped by relation type and direction, as a definition list. */
  #relationList(model: ClientModel, id: ConceptId): HTMLElement | null {
    const groups: { key: string; ids: string[] }[] = [];
    for (const type of RELATION_TYPES) {
      const symmetric = RELATIONS[type].symmetric;
      const out = model.links.filter((l) => l.type === type && l.source === id).map((l) => l.target);
      const inn = model.links.filter((l) => l.type === type && l.target === id).map((l) => l.source);
      if (symmetric) {
        if (out.length + inn.length > 0) groups.push({ key: `rel.${type}.out`, ids: [...out, ...inn] });
      } else {
        if (out.length > 0) groups.push({ key: `rel.${type}.out`, ids: out });
        if (inn.length > 0) groups.push({ key: `rel.${type}.in`, ids: inn });
      }
    }
    if (groups.length === 0) return null;
    const wrap = document.createElement('div');
    wrap.className = 'explorer__detail-links';
    const heading = document.createElement('p');
    heading.className = 'explorer__detail-heading ui';
    heading.textContent = this.#t('detailLinks');
    const dl = document.createElement('dl');
    dl.className = 'relation-list relation-list--compact ui';
    for (const g of groups) {
      const dt = document.createElement('dt');
      dt.textContent = this.#t(g.key);
      const dd = document.createElement('dd');
      g.ids.forEach((other, i) => {
        const c = model.concepts.get(other as ConceptId);
        const a = document.createElement('a');
        a.href = c?.href ?? '#';
        a.textContent = c?.label ?? other;
        a.dataset['select'] = other;
        if (i > 0) dd.append(', ');
        dd.append(a);
      });
      dl.append(dt, dd);
    }
    wrap.append(heading, dl);
    return wrap;
  }

  // ─── Events ────────────────────────────────────────────────────────────

  readonly #onExternalSelect = (e: Event): void => {
    const detail = (e as CustomEvent<SelectDetail>).detail;
    if (detail.origin === this) return;
    this.#select(detail.id, { broadcast: false, announce: false });
    if (detail.id !== null) this.#reveal(detail.id);
  };

  readonly #onClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (target === null) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (button !== null && this.contains(button)) {
      const action = button.dataset['cmapAction'];
      if (action === 'zoom-in') this.#zoom(ZOOM_STEP);
      else if (action === 'zoom-out') this.#zoom(1 / ZOOM_STEP);
      else if (action === 'reset') this.#reset();
      const layout = button.dataset['cmapLayout'];
      if (layout === 'force' || layout === 'grid') this.#setLayout(layout);
      const stratum = button.dataset['cmapFilter'];
      if (stratum !== undefined) this.#toggleStratum(stratum, button);
      return;
    }
    const node = target.closest<SVGAElement>('a.cmap-node');
    if (node === null) return;
    if (this.#suppressClick) {
      this.#suppressClick = false;
      e.preventDefault();
      return;
    }
    const id = node.dataset['id'] ?? null;
    if (!this.#full || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    // Full explorer: the first click selects, a click on the selected concept opens it.
    if (id !== this.#selected) {
      e.preventDefault();
      this.#select(id);
      node.focus({ preventScroll: true });
    }
  };

  readonly #onFocusIn = (e: FocusEvent): void => {
    const node = (e.target as Element | null)?.closest<SVGAElement>('a.cmap-node');
    if (node === null || node === undefined) return;
    const id = node.dataset['id'] ?? null;
    this.#setCurrent(id);
    // Keyboard focus selects (pointer focus is handled by the click).
    if (id !== null && node.matches(':focus-visible')) {
      this.#select(id);
      this.#reveal(id);
    }
  };

  readonly #onFocusOut = (e: FocusEvent): void => {
    // Local maps: leaving the map restores the plain drawing.
    if (this.#full) return;
    const next = e.relatedTarget;
    if (next instanceof Node && this.contains(next)) return;
    this.#select(null, { announce: false });
  };

  readonly #onPointerOver = (e: PointerEvent): void => {
    if (this.#full || e.pointerType === 'touch' || this.#drag?.moved === true) return;
    const node = (e.target as Element | null)?.closest<SVGAElement>('a.cmap-node');
    const id = node?.dataset['id'];
    if (id !== undefined && id !== this.#selected) this.#select(id, { announce: false });
  };

  readonly #onPointerOut = (e: PointerEvent): void => {
    if (this.#full || e.pointerType === 'touch') return;
    const next = e.relatedTarget;
    if (next instanceof Element && next.closest('a.cmap-node') !== null && this.contains(next)) return;
    if (this.contains(document.activeElement) && document.activeElement?.matches('a.cmap-node:focus-visible') === true)
      return;
    this.#select(null, { announce: false });
  };

  readonly #onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as Element | null;
    if (target === null || target.closest('input, select, textarea') !== null) return;
    const inMap = target.closest('.cmap__viewport') !== null;
    const direction = KEY_DIRECTION[e.key];
    if (direction !== undefined && inMap && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const from = this.#current;
      if (from === null) return;
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + arrows pan the view.
        const view = this.#view;
        const base = this.#base();
        if (view === null || base === null) return;
        const step = PAN_STEP * view.width;
        const d = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] }[direction];
        this.#setView(panBy(base, view, d[0] ?? 0, d[1] ?? 0));
        return;
      }
      const next = nearestInDirection(this.#positions(), from, direction, (id) => this.#visible(id));
      if (next !== null) this.#nodes.get(next)?.focus({ preventScroll: true });
      return;
    }
    if (!inMap && target !== this) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.#zoom(ZOOM_STEP);
    } else if (e.key === '-' || e.key === '−') {
      e.preventDefault();
      this.#zoom(1 / ZOOM_STEP);
    } else if (e.key === '0') {
      e.preventDefault();
      this.#reset();
    } else if (e.key === 'Escape' && this.#selected !== null) {
      e.preventDefault();
      this.#select(null);
    }
  };

  readonly #onWheel = (e: WheelEvent): void => {
    // Plain wheel scrolls the page (no scroll trap); Ctrl/⌘ + wheel (and trackpad pinch) zooms the map.
    if (!e.ctrlKey && !e.metaKey) return;
    const svg = this.#svg;
    const view = this.#view;
    if (svg === null || view === null) return;
    e.preventDefault();
    const anchor = clientToUser(view, svg.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
    this.#zoom(Math.exp(-e.deltaY * 0.0025), anchor);
  };

  readonly #onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.#view === null) return;
    this.#drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, view: this.#view };
  };

  readonly #onPointerMove = (e: PointerEvent): void => {
    const drag = this.#drag;
    const svg = this.#svg;
    const base = this.#base();
    if (drag === null || drag.id !== e.pointerId || svg === null || base === null) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      this.classList.add('is-panning');
    }
    const rect = svg.getBoundingClientRect();
    this.#setView(panBy(base, drag.view, -pixelsToUser(drag.view, rect, dx), -pixelsToUser(drag.view, rect, dy)));
  };

  readonly #onPointerUp = (e: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === null || drag.id !== e.pointerId) return;
    this.#drag = null;
    this.classList.remove('is-panning');
    if (drag.moved) {
      this.#suppressClick = true;
      // The click that follows a drag (if any) arrives in this task; forget it afterwards.
      window.setTimeout(() => {
        this.#suppressClick = false;
      }, 0);
    }
  };
}

if (!customElements.get('ft-concept-map')) customElements.define('ft-concept-map', FtConceptMap);
