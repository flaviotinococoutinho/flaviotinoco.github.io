/**
 * <ft-room-switch> — lights and puts out the reading room from the essay page (docs/adr/0014-sala-de-leitura.md).
 *
 * The room is off unless the reader asks for it. This switch is the near way to ask, next to the text it
 * would surround: a toggle button (aria-pressed) whose candle is lit when the room is. It shows only where
 * the room could appear: <ft-reading-room> publishes data-scene-able on <html> when the window leaves
 * gutters wide enough and nothing rules the room out (focus mode, forced colours, no WebGL 2). Without
 * JavaScript there is no room, and the switch stays hidden.
 *
 * Pressing it writes the preference `room` (on | off) through the shared store, the same value the
 * preferences panel shows, so the choice holds for every essay. It reads as pressed when the reader asked
 * for the room, or when the automatic setting shows it.
 *
 * The button is built here, not in the page: it works only with JavaScript, so its markup would be bytes
 * that no reader without it can use. The label comes from the server's catalog.
 *
 * Expected structure (data-eager: hidden, it would never reach the viewport the registry watches):
 *   <ft-room-switch label="Sala de leitura" data-eager hidden></ft-room-switch>
 */
import { setPreference } from '../preferences-store.ts';

const TAG = 'ft-room-switch';
const WATCHED = ['data-room', 'data-scene', 'data-scene-able'];
const SVG = 'http://www.w3.org/2000/svg';
/** The candle (wax and wick) and its flame, drawn only when the room is lit (room.css). */
const CANDLE = 'M8 6.4V8M5.6 8h4.8v6.6H5.6Z';
const FLAME = 'M8 1.4C9.6 3.1 10.1 4.4 9.5 5.5 9.2 6.1 8.6 6.4 8 6.4S6.8 6.1 6.5 5.5C5.9 4.4 6.4 3.1 8 1.4Z';

const candle = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'room-switch__candle');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [d, className] of [
    [FLAME, 'room-switch__flame'],
    [CANDLE, ''],
  ] as const) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    if (className !== '') path.setAttribute('class', className);
    svg.append(path);
  }
  return svg;
};

class FtRoomSwitch extends HTMLElement {
  #abort: AbortController | null = null;

  connectedCallback(): void {
    const text = this.getAttribute('label');
    if (text === null || text === '') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'room-switch__button';
    const name = document.createElement('span');
    name.textContent = text;
    button.append(candle(), name);
    this.replaceChildren(button);
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const root = document.documentElement;
    const pressed = (): boolean => {
      const room = root.dataset['room'];
      return room === 'on' || (room === 'auto' && root.dataset['scene'] !== undefined);
    };
    const sync = (): void => {
      button.setAttribute('aria-pressed', String(pressed()));
      this.hidden = root.dataset['sceneAble'] === undefined;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: WATCHED });
    signal.addEventListener('abort', () => observer.disconnect());
    button.addEventListener('click', () => setPreference('room', pressed() ? 'off' : 'on'), { signal });
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.replaceChildren();
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtRoomSwitch);
