/**
 * Reflow at 320 CSS px (WCAG 2.2 SC 1.4.10): every page fits the narrowest supported viewport without
 * horizontal scrolling of the page itself. Content that needs two-dimensional layout — equations, tables,
 * code, the horizontal passages, the concept maps — scrolls inside its own box, which must be keyboard
 * reachable (tabindex) when it overflows.
 */
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';

const WIDTH = 320;

test.describe(`reflow at ${WIDTH} px`, () => {
  test.use({ viewport: { width: WIDTH, height: 740 } });

  for (const { path } of loadSitePages()) {
    test(`/${path}`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const measured = await page.evaluate(() => {
        const boxes = [
          ...document.querySelectorAll<HTMLElement>('.equation, .figure__scroll, .ontology-tex--display, pre'),
        ];
        return {
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          viewport: document.documentElement.clientWidth,
          unreachable: boxes
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .filter((el) => !['auto', 'scroll'].includes(getComputedStyle(el).overflowX) || el.tabIndex < 0)
            .map((el) => el.className || el.localName),
        };
      });
      expect(measured.document, 'the page has no horizontal scroll').toBeLessThanOrEqual(measured.viewport);
      expect(measured.body, 'the body has no horizontal scroll').toBeLessThanOrEqual(measured.viewport);
      expect(measured.unreachable, 'overflowing boxes that do not scroll or cannot take focus').toEqual([]);
    });
  }
});
