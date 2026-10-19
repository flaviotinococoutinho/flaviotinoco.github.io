/**
 * <ft-concept-preview> — the definition preview of a `:concept[…]` reference.
 *
 * Markup (remark-concepts.ts): the element wraps a plain link to the concept
 * page and carries the preview text in data-* attributes (label, definition,
 * stratum and category with their localised names). Without JavaScript the
 * reference is that link and nothing else.
 *
 * Behaviour:
 *   - a tooltip (role="tooltip", referenced by aria-describedby, so screen
 *     readers announce the definition with the link) is created on first use;
 *   - it opens on hover (after a short delay), on keyboard focus and — for touch,
 *     where hover does not exist — on the first tap; a second tap follows the link;
 *   - Popover API: popover="hint" (HTML, 2025) where supported, so opening it
 *     does not close an open "auto" popover; elsewhere (Safari) popover="manual"
 *     with light dismiss implemented here (Escape, a press outside); without the
 *     Popover API at all, a fixed-position element toggled with `hidden`;
 *   - placement: CSS anchor positioning under @supports
 *     (src/styles/components/ontology.css); otherwise computed from the link's
 *     client rectangle;
 *   - WCAG 2.2 SC 1.4.13 (content on hover or focus): dismissible with Escape
 *     without moving focus, hoverable (the pointer may move onto the tooltip)
 *     and persistent until the pointer or focus leaves or it is dismissed.
 */
import { STRATUM_SPECS, isStratum } from '../../core/domain/strata.ts';

const OPEN_DELAY = 300;
const CLOSE_DELAY = 200;
const GAP = 6;
const EDGE = 8;

type Mode = 'hint' | 'manual' | 'none';

let counter = 0;
let modeCache: Mode | null = null;

/** Which popover mechanism this browser offers (detected once). */
const popoverMode = (): Mode => {
  if (modeCache !== null) return modeCache;
  if (!Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover')) return (modeCache = 'none');
  // An unsupported value reflects as the invalid-value default, "manual" (HTML, popover attribute).
  const probe = document.createElement('div');
  probe.setAttribute('popover', 'hint');
  return (modeCache = probe.popover === 'hint' ? 'hint' : 'manual');
};

const anchorSupported = (): boolean =>
  typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a') && CSS.supports('position-anchor: --a');

class FtConceptPreview extends HTMLElement {
  #link: HTMLAnchorElement | null = null;
  #tip: HTMLElement | null = null;
  #openTimer = 0;
  #closeTimer = 0;
  #touchPending = false;
  #openedByTouch = false;
  readonly #abort = new AbortController();

  connectedCallback(): void {
    this.#link = this.querySelector('a');
    const link = this.#link;
    if (link === null) return;
    const signal = this.#abort.signal;
    // The tooltip is built eagerly (it is small) so aria-describedby is in place before first focus.
    this.#build();
    link.addEventListener('pointerenter', this.#onPointerEnter, { signal });
    link.addEventListener('pointerleave', this.#scheduleClose, { signal });
    link.addEventListener('pointerdown', this.#onPointerDown, { signal });
    link.addEventListener('click', this.#onClick, { signal });
    link.addEventListener('focus', this.#onFocus, { signal });
    link.addEventListener('blur', this.#scheduleClose, { signal });
    this.addEventListener('keydown', this.#onKeyDown, { signal });
  }

  disconnectedCallback(): void {
    this.#abort.abort();
    window.clearTimeout(this.#openTimer);
    window.clearTimeout(this.#closeTimer);
    this.#hide();
  }

  #build(): void {
    const link = this.#link;
    if (link === null || this.#tip !== null) return;
    counter += 1;
    const id = `concept-preview-${String(counter)}`;
    const d = this.dataset;
    const tip = document.createElement('span');
    tip.id = id;
    tip.className = 'concept-preview';
    tip.setAttribute('role', 'tooltip');
    tip.lang = document.documentElement.lang;

    const head = document.createElement('span');
    head.className = 'concept-preview__label';
    head.textContent = d['label'] ?? link.textContent;
    tip.append(head);

    const marks = document.createElement('span');
    marks.className = 'concept-preview__marks ui';
    const stratum = d['stratum'];
    if (stratum !== undefined && isStratum(stratum)) {
      const mark = document.createElement('span');
      mark.className = 'stratum-mark';
      mark.dataset['stratum'] = stratum;
      mark.dataset['size'] = 's';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'stratum-mark__glyph');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${STRATUM_SPECS[stratum].glyph}`);
      svg.append(use);
      const label = document.createElement('span');
      label.className = 'stratum-mark__label';
      label.textContent = d['stratumLabel'] ?? stratum;
      mark.append(svg, label);
      marks.append(mark);
    }
    if (d['categoryLabel'] !== undefined) {
      const cat = document.createElement('span');
      cat.className = 'category-mark';
      cat.dataset['category'] = d['category'] ?? '';
      cat.textContent = d['categoryLabel'];
      marks.append(' ', cat);
    }
    tip.append(marks);

    const def = document.createElement('span');
    def.className = 'concept-preview__definition';
    def.textContent = d['definition'] ?? '';
    tip.append(def);

    // Shown only when opened by a tap: the next tap on the link opens the page.
    const hint = document.createElement('span');
    hint.className = 'concept-preview__hint ui';
    hint.textContent = d['openLabel'] ?? '';
    hint.hidden = true;
    hint.setAttribute('aria-hidden', 'true');
    tip.append(hint);

    const mode = popoverMode();
    if (mode === 'none') tip.hidden = true;
    else tip.setAttribute('popover', mode);
    tip.addEventListener('pointerenter', () => window.clearTimeout(this.#closeTimer), { signal: this.#abort.signal });
    tip.addEventListener('pointerleave', this.#scheduleClose, { signal: this.#abort.signal });
    tip.addEventListener('toggle', this.#onToggle, { signal: this.#abort.signal });
    this.append(tip);
    link.setAttribute('aria-describedby', id);
    if (anchorSupported()) {
      const name = `--${id}`;
      link.style.setProperty('anchor-name', name);
      tip.style.setProperty('position-anchor', name);
      tip.dataset['anchored'] = 'true';
    }
    this.#tip = tip;
  }

  #isOpen(): boolean {
    const tip = this.#tip;
    if (tip === null) return false;
    return popoverMode() === 'none' ? !tip.hidden : tip.matches(':popover-open');
  }

  #show(byTouch: boolean): void {
    const tip = this.#tip;
    if (tip === null) return;
    window.clearTimeout(this.#closeTimer);
    this.#openedByTouch = byTouch;
    const hint = tip.querySelector<HTMLElement>('.concept-preview__hint');
    if (hint !== null) hint.hidden = !byTouch;
    if (!this.#isOpen()) {
      if (popoverMode() === 'none') tip.hidden = false;
      else tip.showPopover();
    }
    this.#place();
    if (popoverMode() !== 'hint') document.addEventListener('pointerdown', this.#onOutside, { capture: true });
  }

  #hide(): void {
    const tip = this.#tip;
    window.clearTimeout(this.#openTimer);
    document.removeEventListener('pointerdown', this.#onOutside, { capture: true });
    if (tip === null || !this.#isOpen()) return;
    if (popoverMode() === 'none') tip.hidden = true;
    else tip.hidePopover();
    this.#openedByTouch = false;
  }

  /** Fallback placement below the link (above when there is no room), kept inside the viewport. */
  #place(): void {
    const tip = this.#tip;
    const link = this.#link;
    if (tip === null || link === null || tip.dataset['anchored'] === 'true') return;
    const r = link.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE));
    const below = r.bottom + GAP;
    const top = below + h + EDGE > window.innerHeight && r.top - GAP - h > EDGE ? r.top - GAP - h : below;
    tip.style.setProperty('inset', 'auto');
    tip.style.setProperty('left', `${String(Math.round(left))}px`);
    tip.style.setProperty('top', `${String(Math.round(top))}px`);
  }

  readonly #onPointerEnter = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    window.clearTimeout(this.#closeTimer);
    window.clearTimeout(this.#openTimer);
    this.#openTimer = window.setTimeout(() => this.#show(false), OPEN_DELAY);
  };

  readonly #scheduleClose = (): void => {
    window.clearTimeout(this.#openTimer);
    window.clearTimeout(this.#closeTimer);
    if (this.#openedByTouch) return;
    this.#closeTimer = window.setTimeout(() => {
      if (this.#tip?.matches(':hover') === true || this.#link?.matches(':hover, :focus-visible') === true) return;
      this.#hide();
    }, CLOSE_DELAY);
  };

  readonly #onFocus = (): void => {
    // Only keyboard focus opens it; a mouse click focuses the link too, and then navigates.
    if (this.#link?.matches(':focus-visible') === true) this.#show(false);
  };

  readonly #onPointerDown = (e: PointerEvent): void => {
    this.#touchPending = e.pointerType === 'touch';
  };

  readonly #onClick = (e: MouseEvent): void => {
    const byTouch = this.#touchPending;
    this.#touchPending = false;
    if (!byTouch || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (this.#isOpen() && this.#openedByTouch) return; // second tap: follow the link
    e.preventDefault();
    this.#show(true);
  };

  readonly #onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.#isOpen()) {
      this.#hide();
      e.stopPropagation();
    }
  };

  readonly #onOutside = (e: PointerEvent): void => {
    const target = e.target;
    if (target instanceof Node && this.contains(target)) return;
    this.#hide();
  };

  readonly #onToggle = (e: Event): void => {
    // Light dismiss by the browser (hint popovers): keep the internal state in step.
    if ((e as ToggleEvent).newState === 'closed') {
      this.#openedByTouch = false;
      document.removeEventListener('pointerdown', this.#onOutside, { capture: true });
    }
  };
}

if (!customElements.get('ft-concept-preview')) customElements.define('ft-concept-preview', FtConceptPreview);
