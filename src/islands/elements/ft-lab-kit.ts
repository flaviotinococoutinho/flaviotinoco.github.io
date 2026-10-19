/**
 * Shared shell of the ft-lab-* elements. NOT an element: no page contains <ft-lab-kit>, so the islands
 * registry never loads it by tag; every lab module imports it, and Vite emits it once as a shared chunk.
 *
 * What every lab gets from {@link LabElement}:
 *   - configuration from data-* attributes written at build time (src/core/labs/embed.ts): data-widget,
 *     data-locale, data-state, data-href, data-title, data-permalink;
 *   - native, labelled controls generated from the widget's parameter table (src/core/labs/widgets.ts):
 *     range inputs with units in aria-valuetext, radio groups, checkboxes, text fields;
 *   - updates coalesced into one requestAnimationFrame; the text alternative (a sentence built in
 *     src/core/labs/summary.ts) written to an aria-live="polite" region at most once per 700 ms, after the
 *     reader pauses (WCAG 2.2 SC 4.1.3 Status Messages, without chatter while a slider moves);
 *   - the kernel loaded lazily: the registry imports the element module only when it nears the viewport,
 *     and the element fetches its WebAssembly module when it is actually visible or on the first
 *     interaction, whichever comes first. Waiting for an interaction alone would leave a blank figure on
 *     screen; loading at upgrade time would fetch kernels for labs scrolled past without being seen;
 *   - errors while loading: the fallback text comes back with a localised message, the controls go away;
 *   - scrollytelling: inside the figure of an <ft-scrolly>, each 'scrolly:step' event applies its state
 *     string on top of the initial state (scrolling back gives the same picture);
 *   - on lab pages (data-permalink), the state is mirrored in the URL hash (#widget:key=value;…) with
 *     history.replaceState after the reader changes something, and read back on load and on hashchange;
 *   - re-rendering on theme, contrast, motion or daypart changes (attributes of <html>, media queries), for
 *     the canvases that read colours at run time (SVG is styled by CSS custom properties directly).
 * Kernel results are copied out of linear memory by the wrappers (src/adapters/wasm/*), so no element ever
 * keeps a typed-array view that a memory.grow could detach.
 */
import { absurd } from '../../core/algebra/match.ts';
import { parseLocale, type Locale } from '../../core/domain/locale.ts';
import catalog from '../../core/i18n/catalogs/labs.ts';
import { translator, type Params } from '../../core/i18n/messages.ts';
import { upTo } from '../../core/labs/format.ts';
import {
  decodeLabHash,
  encodeLabHash,
  parseLabState,
  resolveState,
  snapNumber,
  checkParam,
  type LabState,
} from '../../core/labs/state.ts';
import type { Scale } from '../../core/labs/scale.ts';
import { PARAMS, defaultState, type ParamSpec, type ParamValue, type Widget } from '../../core/labs/widgets.ts';

export type LabKey = keyof (typeof catalog)['en'];
export type Translate = (key: LabKey, params?: Params) => string;

const SVG = 'http://www.w3.org/2000/svg';
/** Debounce of the live region: announce once the reader has paused. */
const ANNOUNCE_MS = 700;
/** Debounce of the URL hash while a control moves. */
const HASH_MS = 400;

type Attrs = Readonly<Record<string, string | number>>;

/** Creates an SVG element with attributes, appended to `parent` when given. */
export const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
};

/** Creates an HTML element with attributes and optional text, appended to `parent` when given. */
export const html = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  text?: string,
  parent?: Element,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};

let uid = 0;
/** A document-unique id for label/control associations. */
export const nextId = (prefix: string): string => `${prefix}-${(uid++).toString(36)}`;

/** A legend entry: the swatch repeats the series' stroke style and marker, so colour is never alone. */
export interface LegendItem {
  readonly label: string;
  /** Class of the line in the swatch (the series class of the plot), e.g. 'lab__series lab__series--ref'. */
  readonly line?: string;
  /** Marker drawn in the swatch: one of the shapes of {@link marker}. */
  readonly marker?: MarkerShape;
  readonly markerClass?: string;
}

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** Path of a marker of radius `r` centred at (x, y): shape, not colour, distinguishes series (CVD). */
export const markerPath = (shape: MarkerShape, x: number, y: number, r: number): string => {
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  switch (shape) {
    case 'circle':
      return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
    case 'square':
      return `M${f(x - r)} ${f(y - r)}h${f(2 * r)}v${f(2 * r)}h${f(-2 * r)}Z`;
    case 'triangle':
      return `M${f(x)} ${f(y - r * 1.2)}L${f(x + r * 1.1)} ${f(y + r * 0.8)}H${f(x - r * 1.1)}Z`;
    case 'diamond':
      return `M${f(x)} ${f(y - r * 1.3)}L${f(x + r)} ${f(y)}L${f(x)} ${f(y + r * 1.3)}L${f(x - r)} ${f(y)}Z`;
    default:
      return absurd(shape);
  }
};

export const legend = (items: readonly LegendItem[], label: string): HTMLUListElement => {
  const list = html('ul', { class: 'lab__legend', 'aria-label': label });
  for (const item of items) {
    const li = html('li', {}, undefined, list);
    const sw = svg(
      'svg',
      { class: 'lab__swatch', viewBox: '0 0 28 12', 'aria-hidden': 'true', focusable: 'false' },
      li,
    );
    if (item.line !== undefined) svg('path', { class: item.line, d: 'M2 6H26' }, sw);
    if (item.marker !== undefined)
      svg('path', { class: item.markerClass ?? 'lab__marker', d: markerPath(item.marker, 14, 6, 3.5) }, sw);
    li.append(item.label);
  }
  return list;
};

/** A plot: an SVG with a fixed coordinate system scaled to the width of its container. */
export const plot = (
  parent: Element,
  width: number,
  height: number,
  label: string,
  describedBy: string,
): SVGSVGElement =>
  svg(
    'svg',
    {
      class: 'lab__plot',
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': label,
      'aria-describedby': describedBy,
      focusable: 'false',
    },
    parent,
  );

/** A labelled tick of an axis. */
export interface Tick {
  readonly value: number;
  readonly label: string;
}

export const ticks = (values: readonly number[], format: (v: number) => string): readonly Tick[] =>
  values.map((value) => ({ value, label: format(value) }));

/**
 * Grid, axis lines and tick labels of a plot whose plotting area is the range of the two scales; the
 * axis titles go at the end of each axis. Rebuilt in `parent` on each call.
 */
export const drawAxes = (
  parent: SVGGElement,
  sx: Scale,
  sy: Scale,
  xTicks: readonly Tick[],
  yTicks: readonly Tick[],
  titles: { readonly x?: string; readonly y?: string } = {},
): void => {
  clear(parent);
  const [x0, x1] = sx.range;
  const [y0, y1] = sy.range;
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  for (const t of xTicks) {
    const x = sx.map(t.value);
    svg('path', { class: 'lab__grid', d: `M${x} ${top}V${bottom}` }, parent);
    svg('text', { class: 'lab__tick', x, y: bottom + 16, 'text-anchor': 'middle' }, parent).textContent = t.label;
  }
  for (const t of yTicks) {
    const y = sy.map(t.value);
    svg('path', { class: 'lab__grid', d: `M${x0} ${y}H${x1}` }, parent);
    svg('text', { class: 'lab__tick', x: x0 - 6, y: y + 4, 'text-anchor': 'end' }, parent).textContent = t.label;
  }
  svg('path', { class: 'lab__axis', d: `M${x0} ${top}V${bottom}H${x1}` }, parent);
  if (titles.x !== undefined)
    svg('text', { class: 'lab__axis-title', x: x1, y: bottom + 32, 'text-anchor': 'end' }, parent).textContent =
      titles.x;
  if (titles.y !== undefined)
    svg('text', { class: 'lab__axis-title', x: x0, y: top - 6, 'text-anchor': 'start' }, parent).textContent = titles.y;
};

/** Replaces the children of an SVG group (cheap enough for a few hundred nodes per frame). */
export const clear = (node: Element): void => node.replaceChildren();

interface Control {
  readonly spec: ParamSpec;
  readonly sync: (value: ParamValue) => void;
}

/** Options a lab can give a control. */
export interface ControlOptions {
  /** Visible value (and aria-valuetext) of a number parameter. */
  readonly format?: (value: number) => string;
  /** Use a multi-line text field. */
  readonly multiline?: boolean;
  /** Label of each option of a choice parameter. */
  readonly optionLabel?: (option: string) => string;
}

export abstract class LabElement<K> extends HTMLElement {
  abstract readonly widget: Widget;
  protected locale: Locale = 'pt-BR';
  protected t: Translate = translator(catalog, 'pt-BR');
  /** Every parameter, resolved (defaults ← data-state ← hash/scrolly/controls). */
  protected state: LabState = {};
  protected kernel: K | null = null;
  /** Id of the live text alternative (aria-describedby of the plots). */
  protected readonly summaryId = nextId('lab-summary');

  protected plots!: HTMLDivElement;
  protected controls!: HTMLFieldSetElement;
  protected readouts!: HTMLDListElement;
  protected actions!: HTMLDivElement;

  #initial: LabState = {};
  #built = false;
  #pending: Promise<void> | null = null;
  #frame = 0;
  #full = true;
  #announce = 0;
  #hash = 0;
  #touched = false;
  #summary!: HTMLParagraphElement;
  #status!: HTMLParagraphElement;
  #frameEl!: HTMLDivElement;
  #permalink: HTMLAnchorElement | null = null;
  readonly #controls = new Map<string, Control>();
  readonly #cleanup: (() => void)[] = [];

  /** Loads the lab's kernel (one of src/adapters/wasm/load*). */
  protected abstract load(): Promise<K>;
  /** Builds plots, readouts and extra controls (called once, before the first render). */
  protected abstract build(): void;
  /** Draws the current state; returns the text alternative. `full` after theme changes and resizes. */
  protected abstract render(kernel: K, full: boolean): string;
  /** Defaults that depend on the locale (e.g. a sample text), between the table's defaults and data-state. */
  protected localDefaults(): LabState {
    return {};
  }
  /** Options of the generated control of `spec` (labels come from the catalog: `<widget>.<key>`). */
  protected controlOptions(_spec: ParamSpec): ControlOptions {
    return {};
  }

  connectedCallback(): void {
    if (!this.#built) this.#setup();
    this.#watch();
  }

  disconnectedCallback(): void {
    for (const undo of this.#cleanup.splice(0)) undo();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    window.clearTimeout(this.#announce);
    window.clearTimeout(this.#hash);
  }

  /** Number value of a parameter of the current state. */
  protected num(key: string): number {
    const v = this.state[key];
    return typeof v === 'number' ? v : Number(v);
  }
  protected str(key: string): string {
    return String(this.state[key] ?? '');
  }
  protected flag(key: string): boolean {
    return this.state[key] === true;
  }

  /** Sets parameters from the lab's own UI (buttons such as "draw again"). */
  protected set(patch: LabState): void {
    this.state = { ...this.state, ...patch };
    for (const [key, value] of Object.entries(patch)) this.#controls.get(key)?.sync(value);
    this.#changed(true);
  }

  /** A readout row; returns the element whose text the lab updates. */
  protected readout(label: string): HTMLElement {
    const row = html('div', { class: 'lab__readout' }, undefined, this.readouts);
    html('dt', {}, label, row);
    return html('dd', {}, undefined, row);
  }

  /** Requests a render on the next animation frame (coalesced). */
  protected schedule(full = false): void {
    this.#full ||= full;
    if (this.#frame !== 0 || this.kernel === null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      const kernel = this.kernel;
      if (kernel === null) return;
      const full = this.#full;
      this.#full = false;
      const summary = this.render(kernel, full);
      this.#say(summary);
    });
  }

  #setup(): void {
    this.#built = true;
    const locale = parseLocale(this.dataset['locale'] ?? document.documentElement.lang);
    this.locale = locale.ok ? locale.value : 'pt-BR';
    this.t = translator(catalog, this.locale);
    const initial = parseLabState(this.widget, this.dataset['state'] ?? '');
    this.#initial = { ...this.localDefaults(), ...(initial.ok ? initial.value : {}) };
    this.state = resolveState(this.widget, this.#initial);
    if (this.hasAttribute('data-permalink')) {
      const fromHash = decodeLabHash(this.widget, location.hash);
      if (fromHash?.ok === true) this.state = resolveState(this.widget, this.#initial, fromHash.value);
    }

    const fallback = this.querySelector<HTMLElement>(':scope > .lab__fallback');
    const title = this.dataset['title'];
    this.#frameEl = html('div', {
      class: 'lab__frame',
      role: 'group',
      'aria-label': title !== undefined ? this.t('lab.label', { theorem: title }) : this.t('lab.widget'),
    });
    this.plots = html('div', { class: 'lab__plots' }, undefined, this.#frameEl);
    const panel = html('div', { class: 'lab__panel' }, undefined, this.#frameEl);
    this.controls = html('fieldset', { class: 'lab__controls' }, undefined, panel);
    html('legend', { class: 'lab__heading' }, this.t('lab.controls'), this.controls);
    for (const spec of PARAMS[this.widget]) this.#control(spec);
    this.readouts = html('dl', { class: 'lab__readouts', 'aria-label': this.t('lab.readouts') }, undefined, panel);
    this.actions = html('div', { class: 'lab__actions' }, undefined, panel);
    const reset = html('button', { type: 'button', class: 'lab__button' }, this.t('lab.reset'), this.actions);
    reset.addEventListener('click', () => this.#apply(this.#initial, true));
    if (this.hasAttribute('data-permalink')) {
      this.#permalink = html('a', { class: 'lab__permalink' }, this.t('lab.permalink'), this.actions);
      this.#updatePermalink();
    }
    const href = this.dataset['href'];
    if (href !== undefined && !this.hasAttribute('data-permalink')) {
      const open = this.querySelector<HTMLAnchorElement>('.lab__open a');
      html('a', { class: 'lab__open-link', href }, open?.textContent ?? this.t('lab.widget'), this.actions);
    }
    this.#summary = html('p', { class: 'lab__summary', id: this.summaryId, 'aria-live': 'polite' }, '', this.#frameEl);
    this.#status = html('p', { class: 'lab__status', role: 'status' }, this.t('lab.loading'), this.#frameEl);
    this.build();
    if (fallback !== null) fallback.hidden = true;
    this.append(this.#frameEl);
    this.toggleAttribute('data-upgraded', true);
  }

  #watch(): void {
    const listen = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void): void => {
      target.addEventListener(type, fn as EventListener);
      this.#cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    // Kernel: when visible, or on the first interaction.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        this.#ensureKernel();
      }
    });
    io.observe(this);
    this.#cleanup.push(() => io.disconnect());
    for (const type of ['pointerdown', 'focusin', 'keydown']) listen(this, type, () => this.#ensureKernel());

    // Scrollytelling: the nearest <ft-scrolly> whose figure holds this element.
    const scrolly = this.closest('.scrolly__figure')?.closest('ft-scrolly');
    if (scrolly) {
      const current = scrolly.getAttribute('data-state');
      if (current !== null) this.#applyStep(current);
      listen<CustomEvent<{ readonly state: string | null }>>(scrolly, 'scrolly:step', (e) =>
        this.#applyStep(e.detail.state ?? ''),
      );
    }
    if (this.hasAttribute('data-permalink')) {
      listen(window, 'hashchange', () => {
        const r = decodeLabHash(this.widget, location.hash);
        if (r?.ok === true) this.#apply(resolveState(this.widget, this.#initial, r.value), false);
      });
    }

    // Theme, contrast, forced colours, motion and daypart change what canvases must draw.
    const mo = new MutationObserver(() => this.schedule(true));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-contrast', 'data-motion', 'data-daypart'],
    });
    this.#cleanup.push(() => mo.disconnect());
    for (const query of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(forced-colors: active)']) {
      listen(matchMedia(query), 'change', () => this.schedule(true));
    }
    this.schedule(true);
  }

  #ensureKernel(): void {
    if (this.kernel !== null || this.#pending !== null) return;
    this.#pending = this.load().then(
      (kernel) => {
        this.kernel = kernel;
        this.#status.hidden = true;
        this.schedule(true);
      },
      (error: unknown) => this.#fail(error),
    );
  }

  #fail(error: unknown): void {
    console.warn(`[${this.localName}] kernel unavailable`, error);
    this.#frameEl.hidden = true;
    const fallback = this.querySelector<HTMLElement>(':scope > .lab__fallback');
    if (fallback !== null) fallback.hidden = false;
    html('p', { class: 'lab__error', role: 'status' }, this.t('lab.error'), this);
    this.toggleAttribute('data-failed', true);
  }

  #applyStep(source: string): void {
    const patch = parseLabState(this.widget, source);
    if (patch.ok) this.#apply(resolveState(this.widget, this.#initial, patch.value), false);
  }

  #apply(state: LabState, fromReader: boolean): void {
    this.state = resolveState(this.widget, state);
    for (const [key, control] of this.#controls) {
      const value = this.state[key];
      if (value !== undefined) control.sync(value);
    }
    this.#changed(fromReader);
  }

  #changed(fromReader: boolean): void {
    this.schedule(false);
    if (fromReader) this.#touched = true;
    if (this.#permalink !== null) {
      this.#updatePermalink();
      if (this.#touched) {
        window.clearTimeout(this.#hash);
        this.#hash = window.setTimeout(() => {
          history.replaceState(history.state, '', `#${this.#fragment()}`);
        }, HASH_MS);
      }
    }
  }

  #fragment(): string {
    const defaults = { ...defaultState(this.widget), ...this.localDefaults() };
    const changed = Object.fromEntries(Object.entries(this.state).filter(([k, v]) => defaults[k] !== v));
    return encodeLabHash(this.widget, changed);
  }

  #updatePermalink(): void {
    if (this.#permalink !== null) this.#permalink.href = `#${this.#fragment()}`;
  }

  #say(summary: string): void {
    window.clearTimeout(this.#announce);
    if (this.#summary.textContent === '') {
      this.#summary.textContent = summary;
      return;
    }
    if (this.#summary.textContent === summary) return;
    this.#announce = window.setTimeout(() => {
      this.#summary.textContent = summary;
    }, ANNOUNCE_MS);
  }

  #control(spec: ParamSpec): void {
    const options = this.controlOptions(spec);
    const label = this.t(`${this.widget}.${spec.key}` as LabKey);
    const row = html('div', { class: `lab__control lab__control--${spec.kind}` }, undefined, this.controls);
    const id = nextId(`lab-${spec.key}`);
    const value = this.state[spec.key] ?? spec.default;
    const commit = (v: ParamValue): void => {
      this.state = { ...this.state, [spec.key]: v };
      this.#changed(true);
    };
    switch (spec.kind) {
      case 'number': {
        const format = options.format ?? ((v: number) => upTo(this.locale, v, 3));
        html('label', { for: id }, label, row);
        const input = html(
          'input',
          { type: 'range', id, min: spec.min, max: spec.max, step: spec.step },
          undefined,
          row,
        );
        const shown = html('span', { class: 'lab__value', 'aria-hidden': 'true' }, undefined, row);
        const sync = (v: ParamValue): void => {
          input.value = String(v);
          const text = format(Number(v));
          shown.textContent = text;
          input.setAttribute('aria-valuetext', text);
        };
        sync(value);
        input.addEventListener('input', () => {
          const v = snapNumber(spec, Number(input.value));
          sync(v);
          commit(v);
        });
        this.#controls.set(spec.key, { spec, sync });
        break;
      }
      case 'choice': {
        const group = html('fieldset', { class: 'lab__choice' }, undefined, row);
        html('legend', {}, label, group);
        const name = nextId(`lab-${spec.key}`);
        const radios = spec.options.map((option) => {
          const l = html('label', {}, undefined, group);
          const radio = html('input', { type: 'radio', name, value: option }, undefined, l);
          l.append(options.optionLabel?.(option) ?? option);
          radio.addEventListener('change', () => {
            if (radio.checked) commit(option);
          });
          return radio;
        });
        const sync = (v: ParamValue): void => {
          for (const r of radios) r.checked = r.value === v;
        };
        sync(value);
        this.#controls.set(spec.key, { spec, sync });
        break;
      }
      case 'flag': {
        const l = html('label', {}, undefined, row);
        const box = html('input', { type: 'checkbox', id }, undefined, l);
        l.append(label);
        const sync = (v: ParamValue): void => {
          box.checked = v === true;
        };
        sync(value);
        box.addEventListener('change', () => commit(box.checked));
        this.#controls.set(spec.key, { spec, sync });
        break;
      }
      case 'text': {
        html('label', { for: id }, label, row);
        const field = options.multiline
          ? html('textarea', { id, rows: 3, maxlength: spec.maxLength, spellcheck: 'false' }, undefined, row)
          : html(
              'input',
              { type: 'text', id, maxlength: spec.maxLength, spellcheck: 'false', autocomplete: 'off' },
              undefined,
              row,
            );
        if (spec.alphabet !== undefined) field.setAttribute('inputmode', 'numeric');
        const sync = (v: ParamValue): void => {
          field.value = String(v);
          field.removeAttribute('aria-invalid');
        };
        sync(value);
        field.addEventListener('input', () => {
          const r = checkParam(spec, field.value);
          if (r.ok) {
            field.removeAttribute('aria-invalid');
            commit(r.value);
          } else field.setAttribute('aria-invalid', 'true');
        });
        this.#controls.set(spec.key, { spec, sync });
        break;
      }
      default:
        absurd(spec);
    }
  }
}

/** Reads a CSS colour as sRGB bytes by painting one pixel (canvas resolves any CSS colour syntax). */
export const rgba = (() => {
  let ctx: CanvasRenderingContext2D | null = null;
  return (color: string): readonly [number, number, number, number] => {
    ctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (ctx === null) return [0, 0, 0, 255];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 255];
  };
})();
