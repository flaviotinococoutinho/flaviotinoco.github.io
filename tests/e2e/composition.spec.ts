/**
 * Composition (docs/planos/2026-11-28-arte-e-experiencia.md): what the page draws stays on the page grid and in
 * proportion to the text it accompanies.
 *
 *   grid    the ontology map and the concept lattice start at the left edge of the text column, as every other block
 *           does (they used to start at the window's edge, outside the grid), and the map keeps most of the
 *           explorer's width on a tablet as on a desktop;
 *   glyph   the form mark of a work (¶ Ensaio) is drawn at the size of its label and on the same line (it used to be
 *           drawn at the width of its box, about 40 px, with the label wrapped under it);
 *   tiles   where a page names labs (the home page, a stratum page), each is one link whose name is the lab's title,
 *           with a decorative thumbnail drawn at build time in the colour of the lab's stratum; where the page does
 *           not name that stratum (the home page), the tile carries its glyph and label too (rule 6, WCAG 1.4.1).
 */
import type { Page } from '@playwright/test';
import { expect, settle, test } from './support/fixtures.ts';

const DESKTOP = { width: 1440, height: 900 } as const;

/** Left edge of the text column: the page's first heading. */
const columnLeft = (page: Page): Promise<number> =>
  page
    .locator('main h1')
    .first()
    .evaluate((h) => h.getBoundingClientRect().left);

test.describe('composition', () => {
  test.use({ viewport: DESKTOP });

  for (const [path, figure] of [
    ['pt/ontologia/', '.ontology__explorer'],
    ['en/ontology/', '.ontology__explorer'],
    ['pt/ontologia/reticulado/', '.ontology__fca'],
    ['en/ontology/lattice/', '.ontology__fca'],
  ] as const) {
    test(`/${path} — the figure starts at the text column`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const left = await columnLeft(page);
      const map = await page.locator(figure).evaluate((el) => el.getBoundingClientRect());
      expect(Math.abs(map.left - left), 'the map and the text share a left edge').toBeLessThanOrEqual(1);
      expect(map.right).toBeLessThanOrEqual(DESKTOP.width - left + 1);
    });
  }

  // The explorer queries its own width: a detail panel beside the map only where the explorer is wide enough. When
  // the query measured the page, a tablet squeezed the map into half of the reading column (348 of 718 px).
  for (const width of [820, 1024, 1440]) {
    test(`/pt/ontologia/ at ${String(width)} px — the map keeps most of the explorer's width`, async ({ page }) => {
      await page.setViewportSize({ width, height: DESKTOP.height });
      await page.goto('pt/ontologia/');
      await settle(page);
      const [map, explorer] = await Promise.all(
        ['.explorer__map', '.ontology__explorer'].map((s) =>
          page.locator(s).evaluate((el) => el.getBoundingClientRect().width),
        ),
      );
      expect(map, 'the map takes at least two thirds of the explorer').toBeGreaterThanOrEqual(
        (2 / 3) * (explorer ?? 0),
      );
    });
  }

  for (const path of ['pt/conceitos/abstracao/', 'en/concepts/abstraction/']) {
    test(`/${path} — the form mark of a work is the size of its label`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const marks = await page.locator('.form-mark').evaluateAll((all) =>
        all.map((mark) => {
          const glyph = mark.querySelector('.form-mark__glyph')?.getBoundingClientRect();
          const label = mark.querySelector('.form-mark__label');
          const box = label?.getBoundingClientRect();
          const size = label === null || label === undefined ? 0 : parseFloat(getComputedStyle(label).fontSize);
          return {
            glyph: glyph?.height ?? Infinity,
            size,
            oneLine: glyph !== undefined && box !== undefined && glyph.bottom > box.top && glyph.top < box.bottom,
          };
        }),
      );
      expect(marks.length).toBeGreaterThan(0);
      for (const m of marks) {
        expect(m.glyph, 'the glyph is no taller than 1.5 times its label').toBeLessThanOrEqual(1.5 * m.size);
        expect(m.oneLine, 'the glyph and its label share a line').toBe(true);
      }
    });
  }

  // The home page does not name the stratum of a lab elsewhere: each tile carries its glyph and label (rule 6). A
  // stratum page names it in its heading, so its tiles do not repeat it.
  for (const [path, marked] of [
    ['pt/', true],
    ['en/', true],
    ['pt/estratos/formal/', false],
    ['en/strata/formal/', false],
  ] as const) {
    test(`/${path} — the labs are tiles named by their titles`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const items = page.locator('.lab-tiles > li');
      expect(await items.count()).toBeGreaterThan(0);
      for (const item of await items.all()) {
        const tile = item.locator('.lab-tile');
        const title = (await tile.locator('.lab-tile__title').textContent())?.trim() ?? '';
        expect(title.length).toBeGreaterThan(0);
        await expect(tile).toHaveAccessibleName(title);
        await expect(tile.locator('svg.lab-thumb')).toHaveAttribute('aria-hidden', 'true');
        const mark = item.locator('.lab-tile__stratum');
        if (marked) {
          await expect(mark.locator('.stratum-mark__glyph')).toBeVisible();
          await expect(mark.locator('.stratum-mark__label')).toBeVisible();
          await expect(mark.locator('.stratum-mark__label')).not.toBeEmpty();
        } else {
          await expect(mark).toHaveCount(0);
        }
      }
    });
  }
});
