/**
 * <ft-reading-room sheet=".essay"> — the room around the article (docs/adr/0014-sala-de-leitura.md).
 *
 * The rule: the room makes the atmosphere, the reading keeps the priority. So this element never touches
 * the article. It is a fixed layer behind the page (z-index −1) holding two things: a canvas, where the
 * three.js scene of src/islands/scenes/reading-room.ts is drawn, and, over the canvas, an opaque sheet of
 * paper exactly as wide as the text columns of the element named by `sheet`. Every line of the article
 * therefore sits on the same paper tokens as without the room, and the scene shows only in the gutters.
 *
 * Decorative: aria-hidden, no pointer events, nothing in it is needed to read the page. Without
 * JavaScript, without WebGL 2 or on a narrow screen the layer stays hidden and the page is what it was.
 *
 * Restraint (the decisions are pure, in src/core/chrome/room.ts):
 *   - whether the room exists is decided before anything is downloaded: three.js is imported only when the
 *     mode is not "off", and then at idle time, after the page has painted;
 *   - reduced motion gives one still frame; so does a device with two cores or 2 GiB;
 *   - Save-Data, increased contrast, forced colours, focus mode and a software renderer give no room;
 *   - the frame rate is capped at 30 per second and the pixel ratio at 1.5; a governor steps both down
 *     when frames arrive late and stops the animation if that is not enough;
 *   - the loop stops while the tab is hidden; the room quietens as the reader scrolls into the text.
 *
 * The room follows the reading: the candle burns down with the progress through the article (a reading
 * clock), the rain eases towards the end, and the flame leans in the draught of a scrolled page. With
 * reduced motion these are states, not animations: the still frame is redrawn when scrolling stops.
 * The attributes `shelf` (the corpus, encodeShelf) and `stratum` say what the room holds.
 *
 * The reader's preference `room` (auto | on | off) arrives as data-room on <html>; the state of the layer
 * is published as data-scene="live" | "still" on <html>, where src/styles/components/room.css reads it.
 */
import {
  burn,
  calm,
  candleStrength,
  decodeShelf,
  flicker,
  frameIntervalOf,
  govern,
  governorAt,
  gust,
  gutters,
  kindle,
  pixelRatioOf,
  rainfall,
  roomMode,
  simplexOf,
  startTier,
  type Governor,
  type RoomMode,
} from '../../core/chrome/room.ts';
import { DAYPARTS, type Daypart } from '../../core/chrome/daypart.ts';
import { STRATA, isStratum } from '../../core/domain/strata.ts';
import { MEMORY_STORAGE_KEY, decodeMemory } from '../../core/reading/memory.ts';
import { pinnedProgress } from '../../core/reading/scroll.ts';
import type { ReadingRoom, Rgb, RoomColors } from '../scenes/reading-room.ts';

const TAG = 'ft-reading-room';
/** Time shown by the single frame of the still mode: the rain a little way down the glass. */
const STILL_TIME = 2;
const WATCHED = ['data-theme', 'data-contrast', 'data-motion', 'data-daypart', 'data-focus', 'data-room', 'data-cvd'];
const MEDIA = [
  '(prefers-reduced-motion: reduce)',
  '(prefers-color-scheme: dark)',
  '(prefers-contrast: more)',
  '(forced-colors: active)',
  '(prefers-reduced-data: reduce)',
];

interface Probe {
  readonly webgl: boolean;
  readonly software: boolean;
}

/** One throwaway context: is WebGL 2 there, and is it the CPU drawing it? The context is released at once. */
const probeWebgl = (): Probe => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null) return { webgl: false, software: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl: true, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name)) };
  } catch {
    return { webgl: false, software: false };
  }
};

/** Any CSS colour as sRGB components in [0, 1], read by painting one pixel (the tokens are oklch()). */
const srgbOf = (ctx: CanvasRenderingContext2D, color: string): Rgb => {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const idle = (run: () => void): void => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
};

class FtReadingRoom extends HTMLElement {
  #canvas: HTMLCanvasElement | null = null;
  #sheet: HTMLElement | null = null;
  #target: Element | null = null;
  #abort: AbortController | null = null;
  #room: ReadingRoom | null = null;
  #probe: Probe | null = null;
  #mode: RoomMode = 'off';
  #loading = false;
  /** The context was lost or the governor ran out of rungs: no animation for the rest of this page. */
  #lost = false;
  #exhausted = false;
  #governor: Governor = governorAt(0);
  #frame = 0;
  #lastFrame = 0;
  #lastRender = 0;
  #time = 0;
  #rain = 0;
  #calm = 1;
  #left = 0;
  #right = 0;
  /** The article's box in document coordinates, for the reading progress. */
  #top = 0;
  #height = 0;
  #progress = 0;
  /** How far the reader got on earlier visits (ft-reading-memory): the candle does not grow back. */
  #remembered = 0;
  #gust = 0;
  #scrollY = 0;
  /** Seconds since the flame was lit (the room's first live frame). */
  #lit = 0;
  #settle = 0;
  /** What the scene was last sized for, and whether something (colours, mode) asks for a new frame. */
  #sized = '';
  #stale = true;

  connectedCallback(): void {
    this.#target = document.querySelector(this.getAttribute('sheet') ?? '');
    if (this.#target === null) return;
    this.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'room__canvas';
    const sheet = document.createElement('div');
    sheet.className = 'room__sheet';
    this.append(canvas, sheet);
    this.#canvas = canvas;
    this.#sheet = sheet;
    this.#governor = governorAt(startTier(navigator.hardwareConcurrency || 0));
    try {
      this.#remembered = decodeMemory(localStorage.getItem(MEMORY_STORAGE_KEY))[location.pathname]?.furthest ?? 0;
    } catch {
      this.#remembered = 0;
    }
    this.#calm = calm(window.scrollY, window.innerHeight);

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const evaluate = (): void => this.#evaluate();
    const resize = new ResizeObserver(evaluate);
    resize.observe(document.documentElement);
    resize.observe(this.#target);
    const attributes = new MutationObserver(() => {
      this.#recolor();
      this.#evaluate();
    });
    attributes.observe(document.documentElement, { attributes: true, attributeFilter: WATCHED });
    signal.addEventListener('abort', () => {
      resize.disconnect();
      attributes.disconnect();
    });
    for (const query of MEDIA) {
      matchMedia(query).addEventListener(
        'change',
        () => {
          this.#recolor();
          this.#evaluate();
        },
        { signal },
      );
    }
    document.addEventListener('visibilitychange', () => this.#schedule(), { signal });
    window.addEventListener(
      'scroll',
      () => {
        this.#follow();
        if (this.#mode !== 'still') return;
        // Reduced motion: the candle is a state, not an animation — one new frame once scrolling stops.
        clearTimeout(this.#settle);
        this.#settle = window.setTimeout(() => this.#draw(STILL_TIME, STILL_TIME, 1, true), 250);
      },
      { passive: true, signal },
    );
    this.#evaluate();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    clearTimeout(this.#settle);
    this.#stop();
    this.#canvas?.remove();
    this.#sheet?.remove();
    this.#canvas = null;
    this.#sheet = null;
  }

  /** Where the sheet's edges are: the text columns of the target plus this element's padding (a token). */
  #measure(): void {
    const target = this.#target;
    if (target === null) return;
    const box = target.getBoundingClientRect();
    this.#top = box.top + window.scrollY;
    this.#height = box.height;
    this.#follow();
    // The used value lists the tracks in px between the line names: "[full-start] 385px [main-start] 648px …".
    const tracks = [...getComputedStyle(target).gridTemplateColumns.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) =>
      Number(m[1]),
    );
    const first = tracks[0] ?? 0;
    const last = tracks.length > 1 ? (tracks[tracks.length - 1] ?? 0) : 0;
    const pad = Number.parseFloat(getComputedStyle(this).paddingInlineStart) || 0;
    this.#left = Math.max(0, box.left + first - pad);
    this.#right = Math.min(window.innerWidth, box.right - last + pad);
    this.#sheet?.style.setProperty('--sheet-left', `${this.#left}px`);
    this.#sheet?.style.setProperty('--sheet-width', `${Math.max(0, this.#right - this.#left)}px`);
  }

  /** Where the reader is: how calm the room should be and how far through the article they are. */
  #follow(): void {
    this.#calm = calm(window.scrollY, window.innerHeight);
    this.#progress = pinnedProgress(this.#top - window.scrollY, this.#height, window.innerHeight);
  }

  /** The rim of the stand around the sheet (a token, read from this element's block padding). */
  #rim(): number {
    return Number.parseFloat(getComputedStyle(this).paddingBlockStart) || 0;
  }

  #decide(): RoomMode {
    const root = document.documentElement;
    const preference = root.dataset['room'];
    const g = gutters(window.innerWidth, this.#left - this.#rim(), this.#right + this.#rim());
    const base = {
      preference: preference === 'on' || preference === 'off' ? preference : 'auto',
      focus: root.dataset['focus'] === 'on',
      gutterPx: Math.min(g.left, g.right),
      forcedColors: matchMedia('(forced-colors: active)').matches,
      reducedMotion: getComputedStyle(this).getPropertyValue('--motion').trim() === '0',
      reducedData:
        matchMedia('(prefers-reduced-data: reduce)').matches ||
        (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData ===
          true,
      moreContrast:
        root.dataset['contrast'] === 'more' ||
        (root.dataset['contrast'] !== 'normal' && matchMedia('(prefers-contrast: more)').matches),
      cores: navigator.hardwareConcurrency || 0,
      memoryGiB: (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory ?? null,
    } as const;
    // Ask for a context only when everything else already allows the room.
    if (roomMode({ ...base, webgl: true, software: false }) === 'off') return 'off';
    this.#probe ??= probeWebgl();
    const mode = roomMode({ ...base, ...this.#probe });
    return mode === 'live' && this.#exhausted ? 'still' : mode;
  }

  #evaluate(): void {
    if (this.#canvas === null || this.#lost) return;
    this.#measure();
    const mode = this.#decide();
    this.#mode = mode;
    if (mode === 'off') {
      this.#stop();
      return;
    }
    if (this.#room === null) {
      this.#load();
      return;
    }
    // Resizing clears the drawing buffer, so a frame is drawn at once, and only then is the layer shown.
    // The document resizes whenever its content does; the scene only when the viewport or the sheet did.
    const root = document.documentElement;
    if (this.#resize() || this.#stale || root.dataset['scene'] !== mode) {
      this.#stale = false;
      if (mode === 'still') this.#draw(STILL_TIME, STILL_TIME, 1, true);
      else this.#draw(this.#time, this.#rain, this.#calm, false);
    }
    root.dataset['scene'] = mode;
    this.#schedule();
  }

  #load(): void {
    if (this.#loading) return;
    this.#loading = true;
    idle(() => {
      import('../scenes/reading-room.ts').then(
        ({ createReadingRoom }) => {
          this.#loading = false;
          const canvas = this.#canvas;
          if (canvas === null || this.#mode === 'off' || this.#room !== null) return;
          this.#room = createReadingRoom(canvas, () => {
            this.#lost = true;
            this.#stop();
          });
          if (this.#room === null) {
            this.#lost = true;
            return;
          }
          const stratum = this.getAttribute('stratum');
          this.#room.furnish({
            books: decodeShelf(this.getAttribute('shelf')),
            simplex: simplexOf(isStratum(stratum) ? stratum : 'philosophy'),
          });
          this.#recolor();
          this.#evaluate();
        },
        (error: unknown) => {
          // Decorative: the page stays as it is without the room.
          this.#loading = false;
          this.#lost = true;
          console.warn(`[${TAG}] scene unavailable`, error);
        },
      );
    });
  }

  /** Tears the scene down and hides the layer (the page is then exactly what it is without the room). */
  #stop(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#room?.dispose();
    this.#room = null;
    this.#sized = '';
    delete document.documentElement.dataset['scene'];
  }

  /** Sizes the scene for the viewport, the sheet and the current rung; false when nothing changed. */
  #resize(): boolean {
    const rim = this.#rim();
    const layout = {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: pixelRatioOf(this.#governor.tier, window.devicePixelRatio || 1),
      sheetLeft: Math.max(0, this.#left - rim),
      sheetRight: Math.min(window.innerWidth, this.#right + rim),
    };
    const key = Object.values(layout).join(' ');
    if (this.#room === null || key === this.#sized) return false;
    this.#sized = key;
    this.#room.resize(layout);
    return true;
  }

  /** Reads the room's colours from the design tokens (they change with the theme) and hands them over. */
  #recolor(): void {
    const room = this.#room;
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (room === null || ctx === null) return;
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const token = (name: string): Rgb => srgbOf(ctx, style.getPropertyValue(name).trim());
    const wood = token('--room-wood');
    const colors: RoomColors = {
      wall: token('--room-wall'),
      wood,
      glass: token('--room-glass'),
      flame: token('--room-flame'),
      wax: token('--room-wax'),
      // Cloth covers: the hue of each stratum, worn halfway towards the wood.
      covers: STRATA.map((s) => mix(token(`--stratum-${s}`), wood, 0.5)),
    };
    const theme = root.dataset['theme'];
    const night = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const stored = root.dataset['daypart'];
    const daypart: Daypart = DAYPARTS.find((d) => d === stored) ?? 'day';
    room.recolor(colors, { candle: candleStrength(night ? 'dark' : 'light', daypart), night });
    this.#stale = true;
  }

  /** Starts or stops the loop: it runs only for the live mode, in a visible tab. */
  #schedule(): void {
    const run = this.#room !== null && this.#mode === 'live' && !document.hidden;
    if (run && this.#frame === 0) {
      this.#lastFrame = 0;
      this.#scrollY = window.scrollY;
      this.#frame = requestAnimationFrame(this.#tick);
    }
    if (!run && this.#frame !== 0) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
  }

  readonly #tick = (now: number): void => {
    this.#frame = 0;
    if (this.#lastFrame !== 0) {
      const before = this.#governor;
      this.#governor = govern(before, now - this.#lastFrame);
      if (this.#governor.exhausted) {
        this.#exhausted = true;
        this.#evaluate();
        return;
      }
      if (this.#governor.tier !== before.tier) this.#resize();
    }
    this.#lastFrame = now;
    if (now - this.#lastRender >= frameIntervalOf(this.#governor.tier) - 1) {
      const dt = this.#lastRender === 0 ? 0 : Math.min(0.1, (now - this.#lastRender) / 1000);
      this.#lastRender = now;
      this.#time += dt;
      this.#lit += dt;
      this.#rain += dt * (0.4 + 0.6 * this.#calm);
      const velocity = dt > 0 ? (window.scrollY - this.#scrollY) / dt : 0;
      this.#scrollY = window.scrollY;
      this.#gust = gust(this.#gust, velocity, dt, window.innerHeight);
      this.#draw(this.#time, this.#rain, this.#calm, false);
    }
    this.#schedule();
  };

  #draw(time: number, rainTime: number, liveliness: number, still: boolean): void {
    this.#room?.render({
      time,
      rainTime,
      flicker: flicker(time, liveliness) * (still ? 1 : kindle(this.#lit)),
      liveliness,
      burn: burn(Math.max(this.#progress, this.#remembered)),
      rainfall: rainfall(this.#progress),
      gust: still ? 0 : this.#gust,
    });
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtReadingRoom);
