/**
 * <ft-argument-map> — upgrades the argument map rendered by
 * src/components/reading/ArgumentMap.astro.
 *
 *   - the precomputed SVG (layered layout) replaces the ordered list;
 *   - on wide screens the disclosure opens in the sticky margin column, unless
 *     the essay has side notes (the margin is theirs; the reader can still open it);
 *   - the section being read is highlighted (aria-current="location" + class)
 *     from IntersectionObserver band positions (src/core/reading/scroll.ts,
 *     currentSection) — no scroll handlers — and named in the summary.
 */
import { bandPosition, currentSection, type BandPosition } from '../../core/reading/scroll.ts';

const WIDE = '(width >= 72rem)';
/** The reading band: the top 38.2 % of the viewport (1 − 1/φ). */
const BAND = '0px 0px -61.8% 0px';

class FtArgumentMap extends HTMLElement {
  #observer: IntersectionObserver | null = null;
  #ids: string[] = [];
  readonly #positions = new Map<number, BandPosition>();
  #current: number | null = null;

  connectedCallback(): void {
    const figure = this.querySelector<HTMLElement>('.argmap__figure');
    const list = this.querySelector<HTMLElement>('.argmap__list');
    const details = this.querySelector<HTMLDetailsElement>('details');
    if (figure !== null && list !== null) {
      figure.hidden = false;
      list.hidden = true;
    }
    if (details !== null && matchMedia(WIDE).matches && this.dataset['notes'] === '0') details.open = true;

    this.#ids = [...this.querySelectorAll<SVGAElement>('.argmap__node')].map((a) => a.dataset['id'] ?? '');
    const headings = this.#ids.map((id) => document.getElementById(id)).filter((h): h is HTMLElement => h !== null);
    this.#observer = new IntersectionObserver(this.#onChange, { rootMargin: BAND, threshold: 0 });
    for (const h of headings) this.#observer.observe(h);
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
  }

  readonly #onChange = (entries: readonly IntersectionObserverEntry[]): void => {
    for (const e of entries) {
      const i = this.#ids.indexOf(e.target.id);
      if (i < 0) continue;
      this.#positions.set(i, bandPosition(e.isIntersecting, e.boundingClientRect.top, e.rootBounds?.top ?? 0));
    }
    const next = currentSection(this.#positions);
    if (next !== this.#current) this.#highlight(next);
  };

  #highlight(index: number | null): void {
    this.#current = index;
    const id = index === null ? null : (this.#ids[index] ?? null);
    for (const el of this.querySelectorAll<HTMLElement | SVGElement>('.argmap__node, .argmap__item')) {
      const on = id !== null && el.dataset['id'] === id;
      el.classList.toggle('is-current', on);
      const link = el.matches('a') ? el : el.querySelector('a');
      if (on) link?.setAttribute('aria-current', 'location');
      else link?.removeAttribute('aria-current');
    }
    const label = this.querySelector<HTMLElement>('.argmap__current');
    const node = id === null ? null : this.querySelector<SVGAElement>(`.argmap__node[data-id="${CSS.escape(id)}"]`);
    if (label !== null) {
      const title = node?.querySelector('title')?.textContent ?? '';
      label.textContent = title === '' ? '' : (label.dataset['template'] ?? '{title}').replace('{title}', title);
    }
  }
}

if (!customElements.get('ft-argument-map')) customElements.define('ft-argument-map', FtArgumentMap);
