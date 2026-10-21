/**
 * Text spacing (WCAG 2.2 SC 1.4.12): every page survives the criterion's values —
 * line height 1.5, letter spacing 0.12 em, word spacing 0.16 em, paragraph spacing
 * 2 em — with no loss of content or functionality: no horizontal scrolling of the
 * page, no overflowing box that cannot be scrolled from the keyboard, and no
 * clipped text. Two ways of applying them are audited: the reader's own
 * preference (data-spacing="wide", stored before paint) and a user stylesheet
 * forcing the values on every element, as assistive tools do.
 */
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';
import { PREFS_STORAGE_KEY } from '../../src/core/chrome/preferences.ts';

const WIDTH = 390;

/** The reference user stylesheet of the criterion (what a reader's extension injects). */
const USER_STYLESHEET = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-block-end: 2em !important; }
`;

interface Measured {
  readonly document: number;
  readonly body: number;
  readonly viewport: number;
  readonly unreachable: readonly string[];
  readonly clipped: readonly string[];
}

const measure = (): Promise<Measured> =>
  Promise.resolve(
    (() => {
      const boxes = [
        ...document.querySelectorAll<HTMLElement>('.equation, .figure__scroll, .ontology-tex--display, pre'),
      ];
      const describe = (el: Element): string =>
        `${el.localName}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`;
      // Text clipped by an ancestor that hides its overflow (not a scroll box, not a hidden/collapsed region).
      const clipped = [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => {
          const style = getComputedStyle(el);
          if (el.closest('[hidden], details:not([open]), dialog:not([open]), [popover]') !== null) return false;
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const hidesY = style.overflowY === 'hidden' || style.overflowY === 'clip';
          const hidesX = style.overflowX === 'hidden' || style.overflowX === 'clip';
          if (!hidesY && !hidesX) return false;
          if (el.matches('.katex, .katex *, svg, svg *, canvas')) return false;
          // Form controls scroll their own value (a long number in a text field is reachable, not clipped).
          if (el.matches('input, textarea, select')) return false;
          // Visually hidden on purpose (1 px box clipped away for assistive technology only).
          if (style.clipPath !== 'none' || (el.clientWidth <= 1 && el.clientHeight <= 1)) return false;
          return (hidesY && el.scrollHeight > el.clientHeight + 2) || (hidesX && el.scrollWidth > el.clientWidth + 2);
        })
        .map(describe);
      return {
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        viewport: document.documentElement.clientWidth,
        unreachable: boxes
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .filter((el) => !['auto', 'scroll'].includes(getComputedStyle(el).overflowX) || el.tabIndex < 0)
          .map(describe),
        clipped,
      };
    })(),
  );

const audit = (measured: Measured): void => {
  expect(measured.document, 'the page has no horizontal scroll').toBeLessThanOrEqual(measured.viewport);
  expect(measured.body, 'the body has no horizontal scroll').toBeLessThanOrEqual(measured.viewport);
  expect(measured.unreachable, 'overflowing boxes that do not scroll or cannot take focus').toEqual([]);
  expect(measured.clipped, 'text clipped by an element that hides its overflow').toEqual([]);
};

test.describe(`text spacing at ${String(WIDTH)} px`, () => {
  test.use({ viewport: { width: WIDTH, height: 844 } });

  test.describe('the reader preference (data-spacing="wide")', () => {
    test.beforeEach(async ({ context }) => {
      await context.addInitScript(
        ([key, value]) => localStorage.setItem(key as string, value as string),
        [PREFS_STORAGE_KEY, JSON.stringify({ spacing: 'wide' })],
      );
    });
    for (const { path } of loadSitePages()) {
      test(`/${path}`, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        await expect(page.locator('html')).toHaveAttribute('data-spacing', 'wide');
        audit(await page.evaluate(measure));
      });
    }
  });

  test.describe('a user stylesheet with the values of the criterion', () => {
    // Served from the site's own origin: the CSP admits no inline <style> (style-src 'self').
    const STYLESHEET_PATH = '__text-spacing.css';
    test.beforeEach(async ({ page }) => {
      await page.route(`**/${STYLESHEET_PATH}`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/css', body: USER_STYLESHEET }),
      );
    });
    for (const { path } of loadSitePages()) {
      test(`/${path}`, async ({ page }) => {
        await page.goto(path);
        await page.addStyleTag({ url: STYLESHEET_PATH });
        await settle(page);
        audit(await page.evaluate(measure));
      });
    }
  });
});
