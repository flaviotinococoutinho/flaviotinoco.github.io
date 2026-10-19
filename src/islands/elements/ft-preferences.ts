/**
 * <ft-preferences> — reader preferences panel (inside a popover opened from the
 * header with a native popovertarget button; no script is needed to open it).
 *
 * Loading: the element sits inside the closed popover, which is not rendered,
 * so the islands registry imports this module only when the reader opens the
 * panel (spec item 10: preferences load on interaction).
 *
 * Every control is a native radio group (fieldset + legend + labels). A change
 * is applied instantly to <html> data-* attributes, persisted to localStorage
 * (PREFS_STORAGE_KEY, canonical JSON from the pure codec) and announced
 * politely ("Theme: Dark."). "Reset" restores system defaults.
 *
 * Storage is the single source of truth, and the page and the form always show
 * the same values. The pre-paint script applies the stored values at load;
 * when the panel is first opened, this module applies them again before the
 * form mirrors them, because another tab may have changed them since this page
 * loaded (otherwise the panel would show a value the page does not use, and
 * picking it would fire no change). From then on, changes made in another tab
 * arrive through the `storage` event and are applied and mirrored here.
 *
 * Other code can react through the `ft:prefs-change` event dispatched on
 * document (detail: the Preferences object). The always-loaded islands
 * (<ft-palette-trigger>, <ft-depth-scene>) observe the data-* attributes on
 * <html> instead, so they never download the preference model.
 *
 * Announcements are rendered by the server from the catalog (no UI text here,
 * no formatter shipped): each radio carries its sentence in data-announce
 * ("Tema: Escuro."), the reset button in data-announce.
 */
import {
  DEFAULT_PREFERENCES,
  PREFS_CHANGE_EVENT,
  PREFS_STORAGE_KEY,
  decodePreferences,
  encodePreferences,
  isDefault,
  isPreferenceKey,
  isPreferenceValue,
  preferenceAttributes,
  withPreference,
  type Preferences,
} from '../../core/chrome/preferences.ts';

const TAG = 'ft-preferences';

const read = (): Preferences => {
  try {
    return decodePreferences(window.localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES; // storage blocked (privacy mode, sandboxed frame)
  }
};

const write = (prefs: Preferences): void => {
  try {
    if (isDefault(prefs)) window.localStorage.removeItem(PREFS_STORAGE_KEY);
    else window.localStorage.setItem(PREFS_STORAGE_KEY, encodePreferences(prefs));
  } catch {
    // Not persisted, but still applied for this page view.
  }
};

const apply = (prefs: Preferences): void => {
  const root = document.documentElement;
  for (const [name, value] of preferenceAttributes(prefs)) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
  document.dispatchEvent(new CustomEvent<Preferences>(PREFS_CHANGE_EVENT, { detail: prefs }));
};

class FtPreferences extends HTMLElement {
  #prefs: Preferences = DEFAULT_PREFERENCES;
  #abort: AbortController | null = null;
  #status: HTMLElement | null = null;

  connectedCallback(): void {
    const form = this.querySelector('form');
    if (form === null) return;
    this.#status = this.querySelector<HTMLElement>('[role="status"]');
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.#prefs = read();
    apply(this.#prefs);
    this.#sync(form);

    form.addEventListener(
      'change',
      (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'radio' || !input.checked) return;
        const key = input.dataset['key'];
        if (!isPreferenceKey(key) || !isPreferenceValue(key, input.value)) return;
        this.#prefs = withPreference(this.#prefs, key, input.value as never);
        write(this.#prefs);
        apply(this.#prefs);
        this.#announce(input.dataset['announce'] ?? '');
      },
      { signal },
    );
    form.addEventListener('submit', (event) => event.preventDefault(), { signal });

    const reset = this.querySelector<HTMLButtonElement>('[data-reset]');
    reset?.addEventListener(
      'click',
      () => {
        this.#prefs = DEFAULT_PREFERENCES;
        write(this.#prefs);
        apply(this.#prefs);
        this.#sync(form);
        this.#announce(reset.dataset['announce'] ?? '');
      },
      { signal },
    );

    window.addEventListener(
      'storage',
      (event) => {
        if (event.key !== PREFS_STORAGE_KEY && event.key !== null) return;
        this.#prefs = read();
        apply(this.#prefs);
        this.#sync(form);
      },
      { signal },
    );
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
  }

  /** Checks the radio of every current value (the form mirrors the model, never the reverse). */
  #sync(form: HTMLFormElement): void {
    for (const input of form.querySelectorAll<HTMLInputElement>('input[type="radio"][data-key]')) {
      const key = input.dataset['key'];
      if (isPreferenceKey(key)) input.checked = this.#prefs[key] === input.value;
    }
  }

  #announce(text: string): void {
    const status = this.#status;
    if (status === null) return;
    // Re-setting identical text is not re-announced by every screen reader; clear first.
    status.textContent = '';
    window.requestAnimationFrame(() => {
      status.textContent = text;
    });
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtPreferences);
