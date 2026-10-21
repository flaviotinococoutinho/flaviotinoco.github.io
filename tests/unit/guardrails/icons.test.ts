/** The touch icon drawing: the favicon scaled into an opaque square, with the dark-scheme rule removed. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOUCH_ICON, touchIconSvg } from '../../../scripts/lib/icons.ts';

const favicon = readFileSync(fileURLToPath(new URL('../../../public/favicon.svg', import.meta.url)), 'utf8');

describe('touch icon', () => {
  it('wraps the favicon in a filled square of the requested size, light ink only', () => {
    const r = touchIconSvg(favicon);
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toMatch(/^<svg [^>]*width="180" height="180" viewBox="0 0 180 180">/);
    expect(r.value).toContain(`<rect width="180" height="180" fill="${TOUCH_ICON.background}"/>`);
    expect(r.value).toContain('<g transform="translate(21.6 21.6) scale(4.275)">');
    expect(r.value).not.toContain('prefers-color-scheme');
    expect(r.value).toContain('stroke:#2a2520');
    expect(r.value).toContain('<path d="M16 5');
  });

  it('centres a non-square view box and honours the spec', () => {
    const wide = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><circle r="1"/></svg>';
    const r = touchIconSvg(wide, { size: 100, background: '#fff', margin: 0 });
    expect(r.ok && r.value).toContain('<g transform="translate(0 25) scale(2.5)">');
  });

  it('refuses a document without a view box, or an invalid spec', () => {
    expect(touchIconSvg('<svg></svg>').ok).toBe(false);
    expect(touchIconSvg('<svg viewBox="0 0 0 10"></svg>').ok).toBe(false);
    expect(touchIconSvg(favicon, { size: 0, background: '#fff', margin: 0.1 }).ok).toBe(false);
    expect(touchIconSvg(favicon, { size: 10, background: '#fff', margin: 0.5 }).ok).toBe(false);
  });
});
