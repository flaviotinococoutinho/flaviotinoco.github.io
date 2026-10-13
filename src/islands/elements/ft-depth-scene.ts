/**
 * <ft-depth-scene> — scroll-linked depth for layered vector scenes.
 *
 * Progressive enhancement over src/styles/motion.css: where CSS scroll-driven
 * animations exist (`animation-timeline: view()`), the compositor animates
 * every [data-depth] layer and this element does nothing. Elsewhere (e.g.
 * Firefox release builds as of 2026) it writes the same `view()` progress as
 * --scroll-progress on each layer, computed by the pure viewProgress() of
 * src/core/chrome/depth.ts.
 *
 * Budget: one passive scroll listener and one requestAnimationFrame per frame,
 * only while the scene intersects the viewport (IntersectionObserver); the
 * geometry is measured once on entry and on resize, so the per-frame loop
 * reads only window.scrollY — no layout reads, no forced reflow. Layers are
 * siblings that fill the scene, so the (untransformed) scene box is the
 * reference box of every layer and translating layers never feeds back.
 * When the effective --motion is 0 (reader preference or
 * prefers-reduced-motion) the loop stops and the scene rests.
 */
import { progressToken, viewProgress } from '../../core/chrome/depth.ts';
import { PREFS_CHANGE_EVENT } from '../../core/chrome/preferences.ts';

const TAG = 'ft-depth-scene';

const motionEnabled = (): boolean =>
  getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() !== '0';

class FtDepthScene extends HTMLElement {
  #layers: readonly HTMLElement[] = [];
  #abort: AbortController | null = null;
  #io: IntersectionObserver | null = null;
  #frame = 0;
  #docTop = 0;
  #height = 0;
  #viewport = 1;
  #visible = false;
  #running = false;

  connectedCallback(): void {
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')) return;
    this.#layers = Array.from(this.querySelectorAll<HTMLElement>('[data-depth]'));
    if (this.#layers.length === 0) return;
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.#io = new IntersectionObserver((entries) => {
      for (const entry of entries) this.#visible = entry.isIntersecting;
      this.#update();
    });
    this.#io.observe(this);

    window.addEventListener('resize', () => this.#measure(), { passive: true, signal });
    document.addEventListener(PREFS_CHANGE_EVENT, () => this.#update(), { signal });
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => this.#update(), { signal });
  }

  disconnectedCallback(): void {
    this.#stop();
    this.#io?.disconnect();
    this.#io = null;
    this.#abort?.abort();
    this.#abort = null;
  }

  /** Starts or stops the loop according to visibility and the motion preference. */
  #update(): void {
    if (this.#visible && motionEnabled()) this.#start();
    else this.#stop();
  }

  #start(): void {
    if (this.#running) return;
    this.#running = true;
    window.addEventListener('scroll', this.#onScroll, { passive: true });
    this.#measure();
  }

  #stop(): void {
    if (!this.#running) return;
    this.#running = false;
    window.removeEventListener('scroll', this.#onScroll);
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** The only layout read: done on entry and on resize, never inside the frame loop. */
  #measure(): void {
    if (!this.#running) return;
    const rect = this.getBoundingClientRect();
    this.#docTop = rect.top + window.scrollY;
    this.#height = rect.height;
    this.#viewport = window.innerHeight;
    this.#onScroll();
  }

  #onScroll = (): void => {
    if (this.#frame === 0) this.#frame = requestAnimationFrame(this.#tick);
  };

  #tick = (): void => {
    this.#frame = 0;
    const token = progressToken(viewProgress(this.#docTop - window.scrollY, this.#height, this.#viewport));
    for (const layer of this.#layers) layer.style.setProperty('--scroll-progress', token);
  };
}

if (!customElements.get(TAG)) customElements.define(TAG, FtDepthScene);
