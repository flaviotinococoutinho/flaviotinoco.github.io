/**
 * <ft-ambient-field> — the decorative flow behind the home hero: particles advected by curl noise
 * (R. Bridson, J. Hourihan & M. Nordenstam, "Curl-noise for procedural fluid flow", ACM TOG 26(3), 2007),
 * computed by `dynamics.wasm` (`flow_init`, `flow_step`, `flow_segments_ptr`) and drawn as very faint short
 * strokes that fade out over a few frames.
 *
 * Decorative only: the host is aria-hidden (src/pages/[lang]/index.astro), the canvas too, and nothing in
 * it is needed to read the page. Colour: the host's computed `color` (labs.css: the --grain token, mixed
 * slightly towards the warm --stratum-value token at dawn, dusk and night through html[data-daypart]),
 * read at run time and re-read when the theme or daypart changes; low alpha throughout.
 *
 * Restraint:
 *   - --motion 0 (reduced motion, or the reader's preference): one static frame, no animation loop;
 *   - paused when off-screen (IntersectionObserver) or when the tab is hidden (visibilitychange);
 *   - at most 30 frames per second; devicePixelRatio-aware (capped at 2);
 *   - fewer particles on low-power devices (navigator.hardwareConcurrency ≤ 4) and with
 *     prefers-reduced-data: reduce, where supported;
 *   - the kernel is fetched only once the hero is visible; a load failure leaves the hero as it is.
 */
import { loadDynamics, type DynamicsKernel } from '../../adapters/wasm/dynamics.ts';

/** The host's computed colour as an opaque sRGB string, read by painting one pixel (any CSS colour syntax). */
const resolveColor = (color: string): string => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (ctx === null) return color;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r} ${g} ${b})`;
};

const FRAME_MS = 1000 / 30;
/** Time units advanced per frame; particles live 2–6 units (docs/adr/0003-wasm-kernels.md §4). */
const DT = 1 / 30;
/** Noise frequency per CSS pixel and drift speed in CSS pixels per time unit. */
const SCALE = 0.0022;
const SPEED = 36;
const STROKE_ALPHA = 0.22;
const FADE_ALPHA = 0.07;
/** Steps drawn for the static frame under reduced motion. */
const STATIC_STEPS = 90;
const SEED = 0x5eed;

const particleBudget = (area: number): number => {
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(prefers-reduced-data: reduce)').matches;
  const cap = lowPower ? 260 : 900;
  return Math.max(80, Math.min(cap, Math.round(area / (lowPower ? 2600 : 1400))));
};

class FtAmbientField extends HTMLElement {
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #kernel: DynamicsKernel | null = null;
  #loading = false;
  #visible = false;
  #frame = 0;
  #last = 0;
  #time = 0;
  #ratio = 1;
  #segments: Float32Array = new Float32Array(0);
  #color = '';
  readonly #cleanup: (() => void)[] = [];

  connectedCallback(): void {
    const canvas = document.createElement('canvas');
    canvas.className = 'ambient__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.append(canvas);
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');

    const io = new IntersectionObserver((entries) => {
      this.#visible = entries.some((e) => e.isIntersecting);
      if (this.#visible) this.#ensureKernel();
      this.#update();
    });
    io.observe(this);
    const ro = new ResizeObserver(() => this.#reset());
    ro.observe(this);
    const mo = new MutationObserver(() => {
      this.#readColor();
      this.#reset();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'data-motion', 'data-daypart'] });
    const onVisibility = (): void => this.#update();
    document.addEventListener('visibilitychange', onVisibility);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const onMedia = (): void => {
      this.#readColor();
      this.#reset();
    };
    motion.addEventListener('change', onMedia);
    scheme.addEventListener('change', onMedia);
    this.#cleanup.push(
      () => io.disconnect(),
      () => ro.disconnect(),
      () => mo.disconnect(),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => motion.removeEventListener('change', onMedia),
      () => scheme.removeEventListener('change', onMedia),
    );
    this.#readColor();
  }

  disconnectedCallback(): void {
    for (const undo of this.#cleanup.splice(0)) undo();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#canvas?.remove();
    this.#canvas = null;
    this.#ctx = null;
  }

  /** --motion as resolved by motion.css (1 by default, 0 under reduced motion or the reader's choice). */
  #moving(): boolean {
    return getComputedStyle(this).getPropertyValue('--motion').trim() !== '0';
  }

  #readColor(): void {
    this.#color = resolveColor(getComputedStyle(this).color);
  }

  #ensureKernel(): void {
    if (this.#kernel !== null || this.#loading) return;
    this.#loading = true;
    loadDynamics().then(
      (kernel) => {
        this.#kernel = kernel;
        this.#reset();
      },
      (error: unknown) => {
        // Decorative: the hero stays as it is without the field.
        console.warn('[ft-ambient-field] kernel unavailable', error);
      },
    );
  }

  /** (Re)creates the field for the current size and draws it (one frame, or the loop). */
  #reset(): void {
    const canvas = this.#canvas;
    const ctx = this.#ctx;
    const kernel = this.#kernel;
    if (canvas === null || ctx === null || kernel === null) return;
    const width = Math.max(1, this.clientWidth);
    const height = Math.max(1, this.clientHeight);
    this.#ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * this.#ratio);
    canvas.height = Math.round(height * this.#ratio);
    ctx.setTransform(this.#ratio, 0, 0, this.#ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    kernel.flowInit(particleBudget(width * height), SEED, width, height);
    this.#time = 0;
    if (!this.#moving()) {
      for (let i = 0; i < STATIC_STEPS; i++) this.#step(kernel, ctx, false);
    }
    this.#update();
  }

  /** Starts or stops the loop according to visibility, tab state and --motion. */
  #update(): void {
    const run = this.#kernel !== null && this.#visible && !document.hidden && this.#moving();
    if (run && this.#frame === 0) this.#frame = requestAnimationFrame(this.#tick);
    if (!run && this.#frame !== 0) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
  }

  readonly #tick = (now: number): void => {
    this.#frame = 0;
    const kernel = this.#kernel;
    const ctx = this.#ctx;
    if (kernel === null || ctx === null) return;
    if (now - this.#last >= FRAME_MS) {
      this.#last = now;
      this.#step(kernel, ctx, true);
    }
    this.#update();
  };

  #step(kernel: DynamicsKernel, ctx: CanvasRenderingContext2D, fade: boolean): void {
    this.#time += DT;
    kernel.flowStep(this.#time, DT, SCALE, SPEED);
    this.#segments = kernel.flowSegments(this.#segments);
    const width = this.clientWidth;
    const height = this.clientHeight;
    ctx.fillStyle = this.#color;
    ctx.strokeStyle = this.#color;
    if (fade) {
      // Erase a little of the previous frames (destination-out keeps the canvas transparent).
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = FADE_ALPHA;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    // Four alpha buckets: one path each instead of one per particle.
    const s = this.#segments;
    for (let bucket = 1; bucket <= 4; bucket++) {
      ctx.globalAlpha = (STROKE_ALPHA * bucket) / 4;
      ctx.beginPath();
      for (let i = 0; i + 4 < s.length; i += 5) {
        const a = s[i + 4] ?? 0;
        if (Math.min(4, Math.ceil(a * 4)) !== bucket) continue;
        ctx.moveTo(s[i] ?? 0, s[i + 1] ?? 0);
        ctx.lineTo(s[i + 2] ?? 0, s[i + 3] ?? 0);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

if (!customElements.get('ft-ambient-field')) customElements.define('ft-ambient-field', FtAmbientField);
