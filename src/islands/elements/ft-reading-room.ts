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
 * The reader's preference `room` (off | auto | on; off by default) arrives as data-room on <html>; the
 * state of the layer is published as data-scene="live" | "still" on <html>, where
 * src/styles/components/room.css reads it, and data-scene-able says that the room could be shown here if
 * the reader asked for it (<ft-room-switch> shows itself only then).
 */
import {
  EYE_TAU,
  approach,
  breath,
  burn,
  calm,
  candleStrength,
  decodeShelf,
  decodeShelfLabels,
  eyeFor,
  flicker,
  govern,
  governorAt,
  gust,
  gutters,
  KINDLE_SECONDS,
  kindle,
  pace,
  paceInterval,
  pixelRatioOf,
  rainfall,
  roomMode,
  simplexOf,
  startTier,
  type Governor,
  type Pace,
  type RoomMode,
  type ShelfLabel,
} from '../../core/chrome/room.ts';
import { DAYPARTS, type Daypart } from '../../core/chrome/daypart.ts';
import { STRATA, isStratum } from '../../core/domain/strata.ts';
import { MEMORY_STORAGE_KEY, decodeMemory } from '../../core/reading/memory.ts';
import { pinnedProgress } from '../../core/reading/scroll.ts';
import type { ReadingRoom, Rgb, RoomColors } from '../scenes/reading-room.ts';

const TAG = 'ft-reading-room';
/** Seconds for a book to come off the shelf (or go back) to 63 %. */
const PULL_TAU = 0.12;
/** A pointer that has not moved for this long (ms) is still: its draught is over. */
const STILL_POINTER_MS = 80;
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
  /** When the reader last scrolled, pointed or typed (performance.now()), and the pace that follows. */
  #input = 0;
  #pace: Pace = 'full';
  /** The pointer when it is over a gutter (CSS px), its horizontal speed (px/s) and when it last moved. */
  #pointer: { readonly x: number; readonly y: number } | null = null;
  #pointerVx = 0;
  #pointerAt = 0;
  /** The eye's offset (motion parallax), smoothed towards eyeFor(pointer). */
  #eye: readonly [number, number] = [0, 0];
  /** The book under the pointer, the one drawn off the shelf, and how far out it is. */
  #hover = -1;
  #pulled = -1;
  #pull = 0;
  /** Titles and links of the books (/<lang>/shelf.json), fetched once the room is lit. */
  #labels: readonly (ShelfLabel | null)[] = [];
  #label: HTMLElement | null = null;

  connectedCallback(): void {
    this.#target = document.querySelector(this.getAttribute('sheet') ?? '');
    if (this.#target === null) return;
    this.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'room__canvas';
    const sheet = document.createElement('div');
    sheet.className = 'room__sheet';
    const label = document.createElement('p');
    label.className = 'room__label';
    label.hidden = true;
    this.append(canvas, sheet, label);
    this.#label = label;
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
    // The reader moving wakes a resting room (pace); the listeners are passive and do nothing else.
    this.#input = performance.now();
    this.dataset['pace'] = this.#pace;
    for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown'] as const) {
      window.addEventListener(type, () => this.#wake(), { passive: true, signal });
    }
    // The hand in a gutter: where the eye goes, which book comes off the shelf, where the glass clears.
    document.addEventListener('pointermove', (event) => this.#point(event), { passive: true, signal });
    document.addEventListener('pointerdown', (event) => this.#point(event), { passive: true, signal });
    document.addEventListener(
      'pointerout',
      (event) => {
        if (event.relatedTarget === null) this.#leave();
      },
      { passive: true, signal },
    );
    document.addEventListener('click', (event) => this.#open(event), { signal });
    window.addEventListener(
      'scroll',
      () => {
        this.#wake();
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
    delete document.documentElement.dataset['sceneAble'];
    this.#canvas?.remove();
    this.#sheet?.remove();
    this.#label?.remove();
    this.#canvas = null;
    this.#sheet = null;
    this.#label = null;
  }

  /** Is the event over a gutter, on the bare page (not on the header, a dialog, a popover or any content)? */
  #inGutter(event: MouseEvent): boolean {
    if (this.#room === null || this.#mode === 'off') return false;
    const rim = this.#rim();
    if (event.clientX >= this.#left - rim && event.clientX <= this.#right + rim) return false;
    const t = event.target;
    return (
      t === document.documentElement ||
      t === document.body ||
      t === this.#target ||
      (t instanceof Element && t.localName === 'main')
    );
  }

  #point(event: PointerEvent): void {
    const room = this.#room;
    if (room === null || !this.#inGutter(event)) {
      this.#leave();
      return;
    }
    const now = performance.now();
    const before = this.#pointer;
    this.#pointerVx =
      before !== null && now > this.#pointerAt ? ((event.clientX - before.x) / (now - this.#pointerAt)) * 1000 : 0;
    this.#pointer = { x: event.clientX, y: event.clientY };
    this.#pointerAt = now;
    const book = room.pointAt(event.clientX, event.clientY, this.#mode === 'live');
    this.#hoverTo(this.#labels[book] ? book : -1);
    this.#placeLabel();
  }

  #leave(): void {
    this.#pointer = null;
    this.#pointerVx = 0;
    this.#hoverTo(-1);
  }

  /** The book under the pointer changed: name it (a label that is not read aloud: it repeats a link). */
  #hoverTo(book: number): void {
    if (book === this.#hover) return;
    this.#hover = book;
    const label = this.#labels[book] ?? null;
    const root = document.documentElement;
    if (label === null) delete root.dataset['roomPoint'];
    else root.dataset['roomPoint'] = '';
    if (this.#label !== null) {
      this.#label.textContent = label?.title ?? '';
      this.#label.hidden = label === null;
    }
    if (this.#mode === 'still') {
      // Reduced motion: the book is simply out, in one new frame.
      this.#pulled = book;
      this.#pull = book >= 0 ? 1 : 0;
      this.#draw(STILL_TIME, STILL_TIME, 1, true);
    }
  }

  /** The label beside the pointer, inside the gutter it is in (never over the sheet). */
  #placeLabel(): void {
    const label = this.#label;
    const p = this.#pointer;
    if (label === null || p === null || label.hidden) return;
    const rim = this.#rim();
    const left = p.x < this.#left;
    const min = (left ? 0 : this.#right + rim) + 8;
    const max = (left ? this.#left - rim : window.innerWidth) - 8;
    label.style.maxInlineSize = `${String(Math.max(80, max - min))}px`;
    const x = Math.max(min, Math.min(max - label.offsetWidth, p.x + 14));
    const y = Math.max(8, Math.min(window.innerHeight - label.offsetHeight - 8, p.y + 18));
    label.style.transform = `translate(${String(x)}px, ${String(y)}px)`;
  }

  /** A click on a book opens the work (with a modifier key, in a new tab). */
  #open(event: MouseEvent): void {
    const room = this.#room;
    if (room === null || event.button !== 0 || event.defaultPrevented || !this.#inGutter(event)) return;
    const label = this.#labels[room.pointAt(event.clientX, event.clientY, false)] ?? null;
    if (label === null) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) window.open(label.href, '_blank', 'noopener');
    else window.location.assign(label.href);
  }

  async #fetchLabels(): Promise<void> {
    const url = this.getAttribute('labels');
    if (url === null || url === '' || this.#labels.length > 0) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      this.#labels = decodeShelfLabels(await response.json());
    } catch (error: unknown) {
      // Decorative: without the labels the books are only books.
      console.warn(`[${TAG}] shelf labels unavailable (${url})`, error);
    }
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

  /**
   * The mode, and whether the room could be shown at all if the reader asked for it (`able`: what the
   * switch on the page needs to know). `able` judges only what costs nothing to measure — the gutters, the
   * system palette, focus mode — and a WebGL probe already made; no context is created to answer it.
   */
  #decide(): { readonly mode: RoomMode; readonly able: boolean } {
    const root = document.documentElement;
    const preference = root.dataset['room'];
    const g = gutters(window.innerWidth, this.#left - this.#rim(), this.#right + this.#rim());
    const base = {
      // The default (no attribute) is off: the room appears only when the reader asks for it.
      preference: preference === 'on' || preference === 'auto' ? preference : 'off',
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
    const able =
      !this.#lost &&
      roomMode({ ...base, preference: 'on', webgl: this.#probe?.webgl ?? true, software: false }) !== 'off';
    // Ask for a context only when everything else already allows the room.
    if (roomMode({ ...base, webgl: true, software: false }) === 'off') return { mode: 'off', able };
    this.#probe ??= probeWebgl();
    const mode = roomMode({ ...base, ...this.#probe });
    return { mode: mode === 'live' && this.#exhausted ? 'still' : mode, able: able && this.#probe.webgl };
  }

  #evaluate(): void {
    if (this.#canvas === null) return;
    if (this.#lost) {
      delete document.documentElement.dataset['sceneAble'];
      return;
    }
    this.#measure();
    const { mode, able } = this.#decide();
    if (able) document.documentElement.dataset['sceneAble'] = '';
    else delete document.documentElement.dataset['sceneAble'];
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
            this.#evaluate();
          });
          if (this.#room === null) {
            this.#lost = true;
            this.#evaluate();
            return;
          }
          const stratum = this.getAttribute('stratum');
          this.#room.furnish({
            books: decodeShelf(this.getAttribute('shelf')),
            simplex: simplexOf(isStratum(stratum) ? stratum : 'philosophy'),
          });
          void this.#fetchLabels();
          this.#recolor();
          this.#evaluate();
        },
        (error: unknown) => {
          // Decorative: the page stays as it is without the room.
          this.#loading = false;
          this.#lost = true;
          this.#evaluate();
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
    this.#leave();
    this.#pulled = -1;
    this.#pull = 0;
    this.#eye = [0, 0];
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

  /** The reader moved: the room returns to its full pace, and the loop restarts if it was resting. */
  #wake(): void {
    this.#input = performance.now();
    if (this.#pace === 'rest') this.#setPace('full');
    this.#schedule();
  }

  #setPace(next: Pace): void {
    if (next === this.#pace) return;
    this.#pace = next;
    this.dataset['pace'] = next;
  }

  /** Starts or stops the loop: it runs only for the live mode, in a visible tab, while the room is not at rest. */
  #schedule(): void {
    const run = this.#room !== null && this.#mode === 'live' && !document.hidden && this.#pace !== 'rest';
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
    // The flame catching counts as movement: the room is not left half lit.
    const still = this.#lit < KINDLE_SECONDS ? 0 : (now - this.#input) / 1000;
    const current = pace(still);
    if (current === 'rest') {
      // The last frame stays on screen; the next input restarts the loop (#wake).
      this.#setPace('rest');
      return;
    }
    this.#setPace(current);
    if (now - this.#lastRender >= paceInterval(current, this.#governor.tier) - 1) {
      const dt = this.#lastRender === 0 ? 0 : Math.min(0.1, (now - this.#lastRender) / 1000);
      this.#lastRender = now;
      this.#time += dt;
      this.#lit += dt;
      this.#rain += dt * (0.4 + 0.6 * this.#calm);
      const velocity = dt > 0 ? (window.scrollY - this.#scrollY) / dt : 0;
      this.#scrollY = window.scrollY;
      this.#gust = gust(this.#gust, this.#air(velocity, now), dt, window.innerHeight);
      this.#ease(dt);
      this.#draw(this.#time, this.#rain, this.#calm, false);
    }
    this.#schedule();
  };

  /** The stronger of the two draughts: the scrolled page, or the hand moving near the flame. */
  #air(scrollVelocity: number, now: number): number {
    const p = this.#pointer;
    if (p === null || this.#room === null || now - this.#pointerAt > STILL_POINTER_MS) return scrollVelocity;
    const [fx, fy] = this.#room.flameAt();
    const hand = breath(p.x - fx, p.y - fy, this.#pointerVx);
    return Math.abs(hand) > Math.abs(scrollVelocity) ? hand : scrollVelocity;
  }

  /** The eye follows the pointer in a gutter and comes back to its place without it; a pointed book comes out. */
  #ease(dt: number): void {
    const p = this.#pointer;
    const [tx, ty] =
      p === null ? [0, 0] : eyeFor((p.x / window.innerWidth) * 2 - 1, 1 - (p.y / window.innerHeight) * 2);
    this.#eye = [approach(this.#eye[0], tx, dt, EYE_TAU), approach(this.#eye[1], ty, dt, EYE_TAU)];
    // One book out at a time: the last one goes back before the next comes out.
    if (this.#hover !== this.#pulled && this.#pull < 0.02) this.#pulled = this.#hover;
    const out = this.#pulled >= 0 && this.#pulled === this.#hover ? 1 : 0;
    this.#pull = approach(this.#pull, out, dt, PULL_TAU);
  }

  #draw(time: number, rainTime: number, liveliness: number, still: boolean): void {
    this.#room?.render({
      time,
      rainTime,
      flicker: flicker(time, liveliness) * (still ? 1 : kindle(this.#lit)),
      liveliness,
      burn: burn(Math.max(this.#progress, this.#remembered)),
      rainfall: rainfall(this.#progress),
      gust: still ? 0 : this.#gust,
      eye: still ? [0, 0] : this.#eye,
      pulled: this.#pulled,
      pull: this.#pull,
    });
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtReadingRoom);
