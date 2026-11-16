/**
 * The reading room (docs/adr/0014-sala-de-leitura.md): the three.js scene in the gutters of the essays.
 *
 * What is checked is the rule of the design — the room makes the atmosphere, the reading keeps the
 * priority — as observable facts:
 *
 *   cost      the room is off by default; on a viewport without gutters, or with the preference off, the
 *             scene's chunk is never requested; on a software renderer the automatic mode does not load it;
 *   switch    on a wide window the essay offers a switch (a toggle button), which lights the room and puts
 *             it out, by keyboard too, and the choice holds on the next page; without gutters, no switch;
 *   reading   with the room on, every piece of text of every essay lies on the opaque sheet (no glyph
 *             over the scene), and axe finds no violation in the light or in the dark scheme;
 *   motion    with prefers-reduced-motion the room is one still frame, redrawn only after the reader
 *             scrolled (the candle is a reading clock: a state, not an animation);
 *   control   turning the preference off removes the layer and returns the page to what it was;
 *   rest      a reader who does not move gets a room that slows, then holds still, and wakes when they do;
 *   the hand  in a gutter, the book under the pointer is named and a click opens its work; over the sheet,
 *             nothing of the room answers.
 *
 * The test browser draws WebGL on the CPU (SwiftShader), which the automatic mode refuses on purpose, so
 * the scene itself is exercised with the reader's preference set to "on". The `guard` fixture fails any
 * test in which a shader does not compile (three.js reports it with console.error).
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PREFS_STORAGE_KEY } from '../../src/core/chrome/preferences.ts';
import { ROOM_MIN_GUTTER_PX } from '../../src/core/chrome/room.ts';
import { AXE_TAGS } from './support/contract.ts';
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';

const ESSAY = /^(?:pt\/ensaios|en\/essays)\/[^/]+\/$/;
const essays = loadSitePages().filter((p) => ESSAY.test(p.path));
const sample = essays.filter((p, i) => essays.findIndex((q) => q.locale === p.locale) === i);

const WIDE = { width: 1920, height: 1080 };
const SCENE_CHUNK = /\/reading-room\.[\w-]+\.js$/;

const withPreference = async (page: Page, room: 'on' | 'off' | 'auto'): Promise<void> => {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [PREFS_STORAGE_KEY, JSON.stringify({ room })],
  );
};

/** URLs of the scene's chunk requested by the page (the element's own module is not the scene). */
const sceneRequests = (page: Page): string[] => {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (SCENE_CHUNK.test(new URL(request.url()).pathname)) seen.push(request.url());
  });
  return seen;
};

/** Long enough for the idle-time import to have started if it was ever going to. */
const idle = async (page: Page): Promise<void> => {
  await settle(page);
  await page.waitForTimeout(2500);
};

const scene = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.documentElement.getAttribute('data-scene'));

test.describe('reading room: cost', () => {
  test.skip(sample.length === 0, 'the build has no essay');
  const essay = sample[0]?.path ?? '';

  test('no gutter, no download: the default desktop viewport never requests the scene', async ({ page }) => {
    const requests = sceneRequests(page);
    await withPreference(page, 'on');
    await page.goto(essay);
    await idle(page);
    expect(await scene(page)).toBeNull();
    expect(requests).toEqual([]);
  });

  test('preference off: a wide viewport never requests the scene', async ({ page }) => {
    await page.setViewportSize(WIDE);
    const requests = sceneRequests(page);
    await withPreference(page, 'off');
    await page.goto(essay);
    await idle(page);
    expect(await scene(page)).toBeNull();
    expect(requests).toEqual([]);
  });

  test('off by default: a wide viewport never requests the scene until the reader asks', async ({ page }) => {
    await page.setViewportSize(WIDE);
    const requests = sceneRequests(page);
    await page.goto(essay);
    await idle(page);
    expect(await scene(page)).toBeNull();
    expect(requests).toEqual([]);
  });

  test('automatic: a software renderer gets no room and no download', async ({ page }) => {
    await page.setViewportSize(WIDE);
    const requests = sceneRequests(page);
    await withPreference(page, 'auto');
    await page.goto(essay);
    await idle(page);
    const software = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      const name: unknown = gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
      return gl === null || /swiftshader|llvmpipe|softpipe|software/i.test(String(name));
    });
    test.skip(!software, 'this browser has a hardware renderer: the automatic mode is allowed to show the room');
    expect(await scene(page)).toBeNull();
    expect(requests).toEqual([]);
  });
});

test.describe('reading room: reading keeps the priority', () => {
  test.use({ viewport: WIDE });

  for (const { path } of essays) {
    test(`every glyph on the sheet: /${path}`, async ({ page }) => {
      await withPreference(page, 'on');
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
      await settle(page);

      const layer = page.locator('ft-reading-room');
      await expect(layer).toHaveAttribute('aria-hidden', 'true');
      expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

      const report = await page.evaluate(() => {
        const sheet = document.querySelector('.room__sheet')?.getBoundingClientRect();
        if (sheet === undefined) return { sheet: null, outside: ['no sheet'] };
        const main = document.querySelector('main');
        const outside: string[] = [];
        if (main !== null) {
          const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
          const range = document.createRange();
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const parent = node.parentElement;
            if (parent === null || (node.textContent ?? '').trim() === '') continue;
            if (!parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
            if (parent.closest('.visually-hidden') !== null) continue;
            // What a scroll or clip container hides is not on screen: clip the glyphs' box by every
            // ancestor that does not let its content overflow (the horizontal passages do this).
            let clipLeft = -Infinity;
            let clipRight = Infinity;
            for (let a: Element | null = parent; a !== null && a !== main; a = a.parentElement) {
              if (getComputedStyle(a).overflowX === 'visible') continue;
              const box = a.getBoundingClientRect();
              clipLeft = Math.max(clipLeft, box.left);
              clipRight = Math.min(clipRight, box.right);
            }
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width === 0 || rect.height === 0) continue;
              const left = Math.max(rect.left, clipLeft);
              const right = Math.min(rect.right, clipRight);
              if (right <= left) continue;
              if (left < sheet.left - 0.5 || right > sheet.right + 0.5) {
                const text = (node.textContent ?? '').trim().slice(0, 40);
                outside.push(`${parent.localName}.${parent.className}: “${text}”`);
                break;
              }
            }
          }
        }
        return { sheet: { left: sheet.left, right: sheet.right, width: innerWidth }, outside };
      });
      expect(report.outside, 'text outside the opaque sheet').toEqual([]);
      const { sheet } = report;
      expect(sheet).not.toBeNull();
      if (sheet !== null) {
        expect(Math.min(sheet.left, sheet.width - sheet.right)).toBeGreaterThanOrEqual(ROOM_MIN_GUTTER_PX);
      }

      // The bands that cross the gutters are opaque too.
      for (const selector of ['.site-header', '.site-footer']) {
        const alpha = await page.locator(selector).evaluate((el) => {
          const ctx = document.createElement('canvas').getContext('2d');
          if (ctx === null) return 0;
          ctx.fillStyle = getComputedStyle(el).backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          return ctx.getImageData(0, 0, 1, 1).data[3] ?? 0;
        });
        expect(alpha, `${selector} background alpha`).toBe(255);
      }
    });
  }

  for (const { path } of sample) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`axe with the room on, ${colorScheme}: /${path}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await withPreference(page, 'on');
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
        await settle(page);
        const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
        expect(
          results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`)),
          'axe violations with the room on',
        ).toEqual([]);
      });
    }
  }
});

test.describe('reading room: motion and control', () => {
  test.use({ viewport: WIDE });
  test.skip(sample.length === 0, 'the build has no essay');
  const essay = sample[0]?.path ?? '';

  test('reduced motion: one still frame, nothing animating', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'still', { timeout: 20_000 });
    await settle(page);
    const before = await page.locator('.room__canvas').screenshot();
    await page.waitForTimeout(700);
    const after = await page.locator('.room__canvas').screenshot();
    expect(after.equals(before), 'the canvas does not change over time').toBe(true);
  });

  test('the candle is a reading clock: with reduced motion it changes only when the reader has moved', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'still', { timeout: 20_000 });
    await settle(page);
    const top = await page.locator('.room__canvas').screenshot();
    // Half-way through the article the candle is shorter: a new still frame, drawn once scrolling stops.
    await page.evaluate(() => {
      const article = document.querySelector('.essay');
      const box = article?.getBoundingClientRect();
      if (box !== undefined) window.scrollTo({ top: box.top + window.scrollY + box.height / 2, behavior: 'instant' });
    });
    await page.waitForTimeout(900);
    const middle = await page.locator('.room__canvas').screenshot();
    expect(middle.equals(top), 'the candle burnt down with the reading').toBe(false);
    await page.waitForTimeout(700);
    const later = await page.locator('.room__canvas').screenshot();
    expect(later.equals(middle), 'and then stays as it is').toBe(true);
  });

  test('live: the room moves', async ({ page }) => {
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await settle(page);
    const before = await page.locator('.room__canvas').screenshot();
    await page.waitForTimeout(700);
    const after = await page.locator('.room__canvas').screenshot();
    expect(after.equals(before), 'rain and flame change the canvas').toBe(false);
  });

  test('turning the preference off removes the layer and restores the page', async ({ page }) => {
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    const paper = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

    await page.evaluate(() => document.documentElement.setAttribute('data-room', 'off'));
    await expect(page.locator('html')).not.toHaveAttribute('data-scene', /.*/);
    expect(await page.locator('ft-reading-room').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(paper);
  });
});

test.describe('reading room: the switch', () => {
  test.skip(sample.length === 0, 'the build has no essay');
  const essay = sample[0]?.path ?? '';
  const button = (page: Page) => page.locator('ft-room-switch button');

  test('no gutter, no switch: the default desktop viewport does not offer the room', async ({ page }) => {
    await page.goto(essay);
    await idle(page);
    await expect(page.locator('ft-room-switch')).toBeHidden();
  });

  test('lights the room and puts it out, by keyboard; the choice holds on the next page', async ({ page }) => {
    await page.setViewportSize(WIDE);
    const requests = sceneRequests(page);
    await page.goto(essay);
    await settle(page);
    await expect(button(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(button(page)).toHaveAccessibleName(/Sala de leitura|Reading room/);

    await button(page).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
    expect(requests.length, 'the scene is downloaded once asked for').toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');

    await button(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveAttribute('data-scene', /.*/);
    await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(button(page)).toBeFocused();
    // Off is the default: nothing is left in storage for the room.
    expect(await page.evaluate((key) => localStorage.getItem(key) ?? '{}', PREFS_STORAGE_KEY)).not.toContain('room');
  });
});

test.describe('reading room: rest and the hand', () => {
  test.use({ viewport: WIDE });
  test.skip(sample.length === 0, 'the build has no essay');
  const essay = sample[0]?.path ?? '';
  const pace = (page: Page): Promise<string | null> =>
    page.locator('ft-reading-room').evaluate((el) => el.getAttribute('data-pace'));

  test('a still reader gets a room that slows, then holds still; moving wakes it', async ({ page }) => {
    test.setTimeout(90_000);
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await expect.poll(() => pace(page), { timeout: 15_000 }).toBe('ambient');
    await expect.poll(() => pace(page), { timeout: 40_000 }).toBe('rest');
    const before = await page.locator('.room__canvas').screenshot();
    await page.waitForTimeout(700);
    expect((await page.locator('.room__canvas').screenshot()).equals(before), 'at rest nothing is drawn').toBe(true);
    await page.mouse.move(10, 500);
    await expect.poll(() => pace(page)).toBe('full');
  });

  test('in a gutter the book under the pointer is named and opens its work; over the sheet nothing answers', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await settle(page);
    const labels = (await page.evaluate(async () => {
      const url = document.querySelector('ft-reading-room')?.getAttribute('labels') ?? '';
      return (await (await fetch(url)).json()) as unknown;
    })) as readonly { readonly title: string; readonly href: string }[];
    expect(labels.length).toBeGreaterThan(0);

    const sheetLeft = await page.locator('.room__sheet').evaluate((el) => el.getBoundingClientRect().left);
    const label = page.locator('.room__label');
    let found: { readonly x: number; readonly y: number } | null = null;
    for (let y = 120; y < WIDE.height - 120 && found === null; y += 14) {
      for (let x = 12; x < sheetLeft - 24 && found === null; x += 12) {
        await page.mouse.move(x, y);
        if (await page.locator('html[data-room-point]').count()) found = { x, y };
      }
    }
    expect(found, 'a book on the shelf answers the pointer').not.toBeNull();
    await expect(label).toBeVisible();
    const title = (await label.textContent()) ?? '';
    const target = labels.find((l) => l.title === title);
    expect(target, `the label names a work of the shelf (“${title}”)`).toBeDefined();

    // Over the sheet the room does not answer: no name, no hand.
    await page.mouse.move(sheetLeft + 200, 600);
    await expect(label).toBeHidden();
    await expect(page.locator('html[data-room-point]')).toHaveCount(0);

    if (found !== null && target !== undefined) {
      await page.mouse.move(found.x, found.y);
      await expect(page.locator('html[data-room-point]')).toHaveCount(1);
      const named = (await label.textContent()) ?? '';
      const opened = labels.find((l) => l.title === named);
      await page.mouse.click(found.x, found.y);
      await page.waitForURL((url) => url.pathname === opened?.href);
    }
  });
});
