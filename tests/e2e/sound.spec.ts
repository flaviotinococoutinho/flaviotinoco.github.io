/**
 * The sound of the reading room (docs/adr/0014-sala-de-leitura.md, decision 19), heard through an instrumented
 * AudioContext: an init script counts the contexts the page creates, taps whatever reaches their destination
 * with an analyser (so a test can tell sound from silence), and counts the page turns (the only events whose
 * buffers last PAGE_SECONDS).
 *
 *   silence   by default no AudioContext is ever created and the engine is never fetched, whatever the reader
 *             clicks;
 *   consent   with a sound chosen, nothing exists before the reader's first gesture on the page; after it, the
 *             room sounds. The strict case: the automated browser arrives with an activation carried over by the
 *             navigation (navigator.userActivation.isActive is already true), and still nothing may sound;
 *   panel     the sound is picked and mixed in the preferences panel: a preset sounds at once (the click is
 *             the gesture), a fader moved by keyboard makes the mix the reader's own (stored, `custom`), and
 *             "off" closes the context; the faders show only while a sound is chosen; axe finds nothing;
 *   reading   a page turns when the reader enters a section, and the sound rests while the tab is hidden.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { PREFS_STORAGE_KEY } from '../../src/core/chrome/preferences.ts';
import { MIX_STORAGE_KEY, SOUND_PRESETS, decodeMix } from '../../src/core/chrome/sound.ts';
import { AXE_TAGS, PREFERENCES_TRIGGER, preferenceRadio } from './support/contract.ts';
import { expect, settle, test } from './support/fixtures.ts';

const ESSAY = 'pt/ensaios/do-signo-a-informacao/';
const ENGINE_CHUNK = /\/room-sound\.[\w-]+\.js$/;
/** Length of a page-turn buffer (src/core/chrome/sound-synth.ts, page()). */
const PAGE_SECONDS = 0.6;
const FADER = (layer: string): string => `#ft-prefs input[type="range"][data-layer="${layer}"]`;

interface Probe {
  readonly contexts: number;
  readonly state: string;
  readonly rms: number;
  readonly pageTurns: number;
}

/**
 * Replaces AudioContext before any page script runs with a subclass that counts its instances, hands the page an
 * analyser as `destination` (wired to the real one, so it hears exactly what reaches the output) and counts the
 * buffers of PAGE_SECONDS it starts; window.__ftSound() reports what it saw.
 */
const instrument = async (page: Page): Promise<void> => {
  await page.addInitScript((pageSeconds: number) => {
    const made: AudioContext[] = [];
    const taps = new WeakMap<BaseAudioContext, AnalyserNode>();
    let pageTurns = 0;
    class Counted extends window.AudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        made.push(this);
        const tap = this.createAnalyser();
        tap.fftSize = 4096;
        tap.connect(super.destination);
        taps.set(this, tap);
      }
      override get destination(): AudioDestinationNode {
        return (taps.get(this) ?? super.destination) as AudioDestinationNode;
      }
      override createBufferSource(): AudioBufferSourceNode {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when?: number, offset?: number, duration?: number): void => {
          if (source.buffer !== null && Math.abs(source.buffer.duration - pageSeconds) < 0.01) pageTurns += 1;
          start(when, offset, duration);
        };
        return source;
      }
    }
    window.AudioContext = Counted;
    Reflect.set(window, '__ftSound', () => {
      const context = made.at(-1);
      const tap = context === undefined ? undefined : taps.get(context);
      const data = new Float32Array(tap?.fftSize ?? 1);
      tap?.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
      return { contexts: made.length, state: context?.state ?? 'none', rms, pageTurns };
    });
  }, PAGE_SECONDS);
};

const probe = (page: Page): Promise<Probe> => page.evaluate(() => (Reflect.get(window, '__ftSound') as () => Probe)());

const choose = async (page: Page, sound: string): Promise<void> => {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [PREFS_STORAGE_KEY, JSON.stringify({ sound })],
  );
};

/** A gesture that is not a link: a click on the essay's title. */
const gesture = (page: Page): Promise<void> => page.locator('.essay__title').click();

test.describe('the room sound', () => {
  test('is silent by default: no AudioContext, and the engine is never fetched', async ({ page }) => {
    const fetched: string[] = [];
    page.on('request', (request) => {
      if (ENGINE_CHUNK.test(request.url())) fetched.push(request.url());
    });
    await instrument(page);
    await page.goto(ESSAY);
    await settle(page);
    await gesture(page);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    expect((await probe(page)).contexts).toBe(0);
    expect(fetched).toEqual([]);
  });

  test('with a sound chosen, waits for the reader’s gesture, then sounds', async ({ page }) => {
    await instrument(page);
    await choose(page, 'rain');
    await page.goto(ESSAY);
    await settle(page);
    await page.waitForTimeout(500);
    expect((await probe(page)).contexts, 'nothing before a gesture').toBe(0);

    await gesture(page);
    await expect.poll(async () => (await probe(page)).state).toBe('running');
    // The fade in has a time constant of 0.8 s: well under way after two seconds.
    await expect.poll(async () => (await probe(page)).rms, { timeout: 8000 }).toBeGreaterThan(0.002);
    expect((await probe(page)).contexts, 'one context for the page').toBe(1);
  });

  test('is picked and mixed in the panel, by keyboard; off closes it', async ({ page }) => {
    await instrument(page);
    await page.goto(ESSAY);
    await settle(page);
    await page.locator(PREFERENCES_TRIGGER).first().click();
    const mixer = page.locator('#ft-prefs .prefs__mixer');
    await expect(page.locator(preferenceRadio('sound', 'off'))).toBeChecked();
    await expect(mixer, 'no faders while the room is silent').toBeHidden();

    await page.locator(preferenceRadio('sound', 'rain')).check();
    await expect(page.locator('html')).toHaveAttribute('data-sound', 'rain');
    await expect(mixer).toBeVisible();
    await expect(page.locator(FADER('rain'))).toHaveValue(String(SOUND_PRESETS.rain.rain));
    await expect.poll(async () => (await probe(page)).state, 'the click on the preset is the gesture').toBe('running');

    await page.locator(FADER('wind')).focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(FADER('wind'))).toHaveValue(String(SOUND_PRESETS.rain.wind + 1));
    await expect(page.locator(preferenceRadio('sound', 'custom')), 'the mix is now the reader’s own').toBeChecked();
    const stored = await page.evaluate(
      ([prefs, mix]) => [localStorage.getItem(prefs as string), localStorage.getItem(mix as string)],
      [PREFS_STORAGE_KEY, MIX_STORAGE_KEY],
    );
    expect(JSON.parse(stored[0] ?? '{}')).toMatchObject({ sound: 'custom' });
    expect(decodeMix(stored[1])).toEqual({ ...SOUND_PRESETS.rain, wind: SOUND_PRESETS.rain.wind + 1 });

    const results = await new AxeBuilder({ page })
      .include('#ft-prefs')
      .withTags([...AXE_TAGS])
      .analyze();
    expect(results.violations, 'axe on the panel with its mixer').toEqual([]);

    await page.locator(preferenceRadio('sound', 'off')).check();
    await expect(mixer).toBeHidden();
    await expect.poll(async () => (await probe(page)).state).toBe('closed');
  });

  test('turns a page when the reader enters a section, and rests while the tab is hidden', async ({ page }) => {
    await instrument(page);
    await choose(page, 'scribe');
    await page.goto(ESSAY);
    await settle(page);
    await gesture(page);
    await expect.poll(async () => (await probe(page)).state).toBe('running');
    const before = (await probe(page)).pageTurns;

    const heading = page.locator('#essay-article h2').nth(1);
    await heading.evaluate((h) => window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120));
    await expect.poll(async () => (await probe(page)).pageTurns, 'a page for the new section').toBe(before + 1);

    const hide = (hidden: boolean): Promise<void> =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await hide(true);
    await expect.poll(async () => (await probe(page)).state).toBe('suspended');
    await hide(false);
    await expect.poll(async () => (await probe(page)).state).toBe('running');
  });
});
