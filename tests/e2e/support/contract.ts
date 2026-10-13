/**
 * The markup contract the e2e tests rely on — the only place where they name
 * selectors. Everything else is located by role and landmark.
 *
 * Header triggers: the explicit hooks are `data-ft-trigger="search"` and
 * `data-ft-trigger="preferences"` on the focusable control; the alternatives
 * match the chrome markup by its ARIA relationships (the button that opens the
 * command palette, the button that toggles the preferences popover).
 */
export const SEARCH_TRIGGER = [
  '[data-ft-trigger="search"]',
  'button[aria-controls="ft-palette"]',
  'ft-palette-trigger button',
].join(', ');

export const PREFERENCES_TRIGGER = [
  '[data-ft-trigger="preferences"]',
  'button[popovertarget="ft-prefs"]',
  'button[aria-controls="ft-prefs"]',
].join(', ');

/** Tags axe-core must check (WCAG 2.0/2.1 A and AA, WCAG 2.2 AA). */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

/** Upper bound of Tab presses when walking the focus order (the header comes first). */
export const MAX_TAB_STOPS = 80;
