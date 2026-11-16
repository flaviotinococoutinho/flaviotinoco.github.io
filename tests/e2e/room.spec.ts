/**
 * The reading room (docs/adr/0014-sala-de-leitura.md): the three.js scene behind the essays, seen in the band
 * above the sheet on every screen and in the gutters beside it on wide ones.
 *
 * What is checked is the rule of the design — the room makes the atmosphere, the reading keeps the
 * priority — as observable facts:
 *
 *   cost      the room is automatic by default, and the automatic mode does not load it on a software
 *             renderer; with the preference off, or in focus mode, the scene's chunk is never requested;
 *   reading   with the room on, every piece of text of every essay lies on the opaque sheet (no glyph
 *             over the scene), and axe finds no violation in the light or in the dark scheme;
 *   layout    lighting the room moves nothing: the sheet and the title are where they are without it;
 *   phone     on a phone the room is the band above the sheet; a tap names a book and a second tap opens
 *             it; once the band has scrolled away no frame is drawn at all;
 *   motion    with prefers-reduced-motion the room is one still frame, redrawn only after the reader
 *             scrolled (the candle is a reading clock: a state, not an animation);
 *   control   turning the preference off removes the layer and returns the page to what it was;
 *   rest      a reader who does not move gets a room that slows, then holds still, and wakes when they do;
 *   the hand  in a gutter, the book under the pointer is named and a click opens its work; over the sheet,
 *             nothing of the room answers;
 *   the desk  without the scene, every essay is a sheet on a desk, with the band of desk above it.
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
const PHONE = { width: 390, height: 844 };
const SCENE_CHUNK = /\/reading-room\.[\w-]+\.js$/;

const withPreference = async (
  page: Page,
  room: 'on' | 'off' | 'auto',
  more: Readonly<Record<string, string>> = {},
): Promise<void> => {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [PREFS_STORAGE_KEY, JSON.stringify({ room, ...more })],
  );
};

/**
 * The sheet (the essay's ::before) and the header's bottom in viewport px; whether the sheet is drawn, and
 * whether the desk is (the essay's wood, which gives way to the scene when the room is lit).
 */
const paper = (page: Page) =>
  page.locator('.essay').evaluate((essay) => {
    const box = essay.getBoundingClientRect();
    const sheet = getComputedStyle(essay, '::before');
    const width = Number.parseFloat(sheet.width);
    const sheeted = sheet.content !== 'none';
    return {
      sheet: sheeted,
      drawn: sheeted && getComputedStyle(essay).backgroundColor !== 'rgba(0, 0, 0, 0)',
      left: box.left + (box.width - width) / 2,
      right: box.left + (box.width + width) / 2,
      top: box.top + Number.parseFloat(sheet.top),
      header: document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0,
      headroom: getComputedStyle(essay).getPropertyValue('--room-headroom').trim(),
    };
  });

/** Text of the essay above `top` (viewport px): what would sit in the band, on the room, instead of the paper. */
const textAbove = (page: Page, top: number): Promise<string[]> =>
  page.evaluate((limit) => {
    const essay = document.querySelector('.essay');
    const above: string[] = [];
    if (essay === null) return ['no essay'];
    const walker = document.createTreeWalker(essay, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || (node.textContent ?? '').trim() === '') continue;
      if (!parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      if (parent.closest('.visually-hidden') !== null) continue;
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (rects.some((r) => r.top < limit - 0.5))
        above.push(`${parent.localName}: “${(node.textContent ?? '').trim()}”`);
    }
    return above;
  }, top);

/** URLs of the scene's chunk requested by the page (the element's own module is not the scene). */
const sceneRequests = (page: Page): string[] => {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (SCENE_CHUNK.test(new URL(request.url()).pathname)) seen.push(request.url());
  });
  return seen;
};

/**
 * Text of <main> that lies outside [left, right] (viewport px): the glyphs that would sit on the room instead
 * of the paper. What a scroll or clip container hides is not on screen, so each glyph box is clipped by every
 * ancestor that does not let its content overflow (the horizontal passages do this).
 */
const textOutside = (page: Page, left: number, right: number): Promise<string[]> =>
  page.evaluate(
    ([sheetLeft, sheetRight]) => {
      const main = document.querySelector('main');
      const outside: string[] = [];
      if (main === null) return ['no main'];
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null || (node.textContent ?? '').trim() === '') continue;
        if (!parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        if (parent.closest('.visually-hidden') !== null) continue;
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
          const l = Math.max(rect.left, clipLeft);
          const r = Math.min(rect.right, clipRight);
          if (r <= l) continue;
          if (l < (sheetLeft ?? 0) - 0.5 || r > (sheetRight ?? 0) + 0.5) {
            outside.push(`${parent.localName}.${parent.className}: “${(node.textContent ?? '').trim().slice(0, 40)}”`);
            break;
          }
        }
      }
      return outside;
    },
    [left, right],
  );

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

  test('focus mode: nothing decorative, so the scene is never requested even when asked for', async ({ page }) => {
    await page.setViewportSize(WIDE);
    const requests = sceneRequests(page);
    await withPreference(page, 'on', { focus: 'on' });
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

  test('automatic by default: a software renderer gets no room and no download', async ({ page }) => {
    await page.setViewportSize(WIDE);
    const requests = sceneRequests(page);
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

      await expect(layer).toHaveAttribute('data-stage', 'gutters');
      const sheet = await paper(page);
      expect(sheet.sheet, 'the sheet is drawn').toBe(true);
      expect(await textOutside(page, sheet.left, sheet.right), 'text outside the opaque sheet').toEqual([]);
      expect(await textAbove(page, sheet.top), 'text above the sheet').toEqual([]);
      expect(Math.min(sheet.left, WIDE.width - sheet.right)).toBeGreaterThanOrEqual(ROOM_MIN_GUTTER_PX);

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

test.describe('reading room: lighting it moves nothing', () => {
  test.use({ viewport: WIDE });
  test.skip(sample.length === 0, 'the build has no essay');

  for (const { path } of sample) {
    test(`the sheet and the title stay where they are: /${path}`, async ({ context }) => {
      const where = async (page: Page): Promise<readonly number[]> => {
        const p = await paper(page);
        const title = await page.locator('.essay__title').evaluate((el) => el.getBoundingClientRect().top);
        return [p.left, p.right, p.top, title];
      };
      // One page per preference (an init script runs again on every load of its page).
      const unlitPage = await context.newPage();
      await withPreference(unlitPage, 'off');
      await unlitPage.goto(path);
      await settle(unlitPage);
      const unlit = await where(unlitPage);
      await unlitPage.close();

      const page = await context.newPage();
      await withPreference(page, 'on');
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
      await settle(page);
      expect(await where(page)).toEqual(unlit);
    });
  }
});

test.describe('reading room on a phone: the band above the sheet', () => {
  test.use({ viewport: PHONE, hasTouch: true });
  test.skip(sample.length === 0, 'the build has no essay');
  const essay = sample[0]?.path ?? '';

  test('the room is the band: lit, above the sheet, and no text in it', async ({ page }) => {
    const requests = sceneRequests(page);
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await expect(page.locator('ft-reading-room')).toHaveAttribute('data-stage', 'band');
    expect(requests.length, 'the scene is downloaded').toBeGreaterThan(0);
    await settle(page);
    const sheet = await paper(page);
    expect(sheet.top - sheet.header, 'the band is tall enough for the room').toBeGreaterThanOrEqual(ROOM_MIN_GUTTER_PX);
    expect(await textAbove(page, sheet.top), 'text in the band').toEqual([]);
  });

  test('a tap names the book, a second tap opens it', async ({ page }) => {
    test.setTimeout(90_000);
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await settle(page);
    const labels = (await page.evaluate(async () => {
      const url = document.querySelector('ft-reading-room')?.getAttribute('labels') ?? '';
      return (await (await fetch(url)).json()) as unknown;
    })) as readonly { readonly title: string; readonly href: string }[];
    const sheet = await paper(page);
    const label = page.locator('.room__label');
    let found: { readonly x: number; readonly y: number } | null = null;
    for (let y = sheet.header + 12; y < sheet.top - 8 && found === null; y += 8) {
      for (let x = 8; x < PHONE.width / 2 && found === null; x += 8) {
        await page.touchscreen.tap(x, y);
        if (await label.isVisible()) found = { x, y };
      }
    }
    expect(found, 'a book on the shelf answers a tap').not.toBeNull();
    const title = (await label.textContent()) ?? '';
    const target = labels.find((l) => l.title === title);
    expect(target, `the label names a work of the shelf (“${title}”)`).toBeDefined();
    expect(new URL(page.url()).pathname, 'the first tap only names').toContain(essay);
    if (found !== null && target !== undefined) {
      await page.touchscreen.tap(found.x, found.y);
      await page.waitForURL((url) => url.pathname === target.href);
    }
  });

  test('once the band has scrolled away, no frame is drawn', async ({ page }) => {
    // Every animation frame the page asks for is counted: the room's loop is the only one that runs by itself.
    await page.addInitScript(() => {
      const ask = window.requestAnimationFrame.bind(window);
      (window as Window & { frames_?: number }).frames_ = 0;
      window.requestAnimationFrame = (callback) => {
        (window as Window & { frames_?: number }).frames_ =
          ((window as Window & { frames_?: number }).frames_ ?? 0) + 1;
        return ask(callback);
      };
    });
    await withPreference(page, 'on');
    await page.goto(essay);
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await settle(page);
    const frames = (): Promise<number> => page.evaluate(() => (window as Window & { frames_?: number }).frames_ ?? 0);
    const during = async (ms: number): Promise<number> => {
      const before = await frames();
      await page.waitForTimeout(ms);
      return (await frames()) - before;
    };
    expect(await during(800), 'the band in view: the room is drawn').toBeGreaterThan(0);
    await page.evaluate(() => {
      const box = document.querySelector('.essay')?.getBoundingClientRect();
      if (box !== undefined) window.scrollTo({ top: box.top + window.scrollY + box.height / 2, behavior: 'instant' });
    });
    await page.waitForTimeout(400);
    expect(await during(1000), 'only paper in view: nothing is drawn').toBe(0);
  });
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

    const sheetLeft = (await paper(page)).left;
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

test.describe('reading room without the scene: the desk', () => {
  // A laptop window: gutters too narrow for the scene's furniture, wide enough for the desk to show.
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const { path } of essays) {
    test(`every glyph on the paper, none on the wood: /${path}`, async ({ page }) => {
      await withPreference(page, 'off');
      await page.goto(path);
      await settle(page);
      const d = await paper(page);
      expect(d.drawn, 'the desk is there without the scene').toBe(true);
      expect(d.left, 'wood shows beside the paper').toBeGreaterThan(0);
      expect(d.top - d.header, 'and above it, the band').toBeGreaterThanOrEqual(ROOM_MIN_GUTTER_PX);
      expect(await textOutside(page, d.left, d.right), 'text on the wood').toEqual([]);
      expect(await textAbove(page, d.top), 'text on the band of wood').toEqual([]);
    });
  }

  test('nothing decorative in focus mode or with more contrast: no desk, no band', async ({ page }) => {
    await withPreference(page, 'off');
    await page.goto(sample[0]?.path ?? '');
    await settle(page);
    for (const attribute of [
      ['data-focus', 'on'],
      ['data-contrast', 'more'],
    ] as const) {
      await page.evaluate(([name, value]) => document.documentElement.setAttribute(name, value), attribute);
      const d = await paper(page);
      expect(d.drawn, `${attribute.join('=')}: no desk`).toBe(false);
      expect(d.headroom, `${attribute.join('=')}: no band`).toBe('0px');
      await page.evaluate(([name]) => document.documentElement.removeAttribute(name), attribute);
    }
    expect((await paper(page)).drawn).toBe(true);
  });
});
