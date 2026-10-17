/**
 * <ft-scrolly> — scrollytelling: a sticky figure whose state follows the steps.
 *
 * The active step is chosen by an IntersectionObserver whose root is a thin
 * line across the middle of the viewport (no scroll handlers): the step that
 * crosses the line is active (src/core/reading/scroll.ts, activeStep). On each
 * change the element
 *   - exposes data-step (index) and data-state (the step's state) on itself and
 *     data-active on the step;
 *   - dispatches CustomEvent('scrolly:step', { detail: { index, state } }) on
 *     itself (bubbling) and on every custom element inside the figure, so an
 *     embedded lab can listen either way.
 * A second observer, with fine thresholds, reports progress inside the active
 * step mapped through smoothstep (narrative time ≠ scroll distance) as the CSS
 * variable --scrolly-progress and the 'scrolly:progress' event { index, progress }.
 * Reduced motion: only CSS transitions are dropped; steps still update.
 * No JS: the steps read as a normal sequence and the figure stays static.
 */
import { activeStep, narrativeTime } from '../../core/reading/scroll.ts';

export interface ScrollyStepDetail {
  readonly index: number;
  readonly state: string | null;
}
export interface ScrollyProgressDetail {
  readonly index: number;
  readonly progress: number;
}

const THRESHOLDS = Array.from({ length: 51 }, (_, i) => i / 50);

class FtScrolly extends HTMLElement {
  #steps: HTMLElement[] = [];
  #line: IntersectionObserver | null = null;
  #progress: IntersectionObserver | null = null;
  readonly #crossing = new Set<number>();
  #active: number | null = null;

  connectedCallback(): void {
    this.#steps = [...this.querySelectorAll<HTMLElement>(':scope > .scrolly__steps > .scrolly__step')];
    this.#line = new IntersectionObserver(this.#onLine, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    this.#progress = new IntersectionObserver(this.#onProgress, { threshold: THRESHOLDS });
    for (const step of this.#steps) {
      this.#line.observe(step);
      this.#progress.observe(step);
    }
  }

  disconnectedCallback(): void {
    this.#line?.disconnect();
    this.#progress?.disconnect();
  }

  readonly #index = (el: Element): number => this.#steps.indexOf(el as HTMLElement);

  readonly #onLine = (entries: readonly IntersectionObserverEntry[]): void => {
    for (const e of entries) {
      const i = this.#index(e.target);
      if (i < 0) continue;
      if (e.isIntersecting) this.#crossing.add(i);
      else this.#crossing.delete(i);
    }
    const next = activeStep(this.#crossing, this.#active);
    if (next !== null && next !== this.#active) this.#activate(next);
  };

  #activate(index: number): void {
    this.#active = index;
    const step = this.#steps[index];
    const state = step?.dataset['state'] ?? null;
    this.dataset['step'] = String(index);
    if (state === null) delete this.dataset['state'];
    else this.dataset['state'] = state;
    this.#steps.forEach((s, k) => s.toggleAttribute('data-active', k === index));
    const detail: ScrollyStepDetail = { index, state };
    this.dispatchEvent(new CustomEvent('scrolly:step', { detail, bubbles: true }));
    for (const el of this.querySelectorAll(':scope > .scrolly__figure *')) {
      if (el.localName.includes('-')) el.dispatchEvent(new CustomEvent('scrolly:step', { detail }));
    }
  }

  readonly #onProgress = (entries: readonly IntersectionObserverEntry[]): void => {
    for (const e of entries) {
      const index = this.#index(e.target);
      if (index !== this.#active) continue;
      const viewport = e.rootBounds?.height ?? window.innerHeight;
      const progress = narrativeTime(e.boundingClientRect.top, e.boundingClientRect.height, viewport);
      this.style.setProperty('--scrolly-progress', progress.toFixed(3));
      const detail: ScrollyProgressDetail = { index, progress };
      this.dispatchEvent(new CustomEvent('scrolly:progress', { detail, bubbles: true }));
    }
  };
}

if (!customElements.get('ft-scrolly')) customElements.define('ft-scrolly', FtScrolly);
