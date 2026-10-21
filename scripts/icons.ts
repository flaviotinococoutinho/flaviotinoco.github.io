/**
 * Shell: renders public/apple-touch-icon.png (180 × 180) from public/favicon.svg.
 *   node scripts/icons.ts            write the file
 *   node scripts/icons.ts --check    fail if the committed file differs (same resvg version)
 * The drawing is composed by the pure helper (scripts/lib/icons.ts); resvg rasterises it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { TOUCH_ICON, touchIconSvg } from './lib/icons.ts';

const SOURCE = new URL('../public/favicon.svg', import.meta.url);
const TARGET = new URL('../public/apple-touch-icon.png', import.meta.url);

const svg = touchIconSvg(await readFile(SOURCE, 'utf8'), TOUCH_ICON);
if (!svg.ok) {
  console.error(`icons: ${svg.error}`);
  process.exit(1);
}
const png = new Resvg(svg.value, { fitTo: { mode: 'width', value: TOUCH_ICON.size } }).render().asPng();

if (process.argv.includes('--check')) {
  const current = await readFile(TARGET).catch(() => Buffer.alloc(0));
  if (!current.equals(png)) {
    console.error('public/apple-touch-icon.png is out of date. Run `node scripts/icons.ts` and commit the result.');
    process.exit(1);
  }
  console.log('apple-touch-icon.png is up to date.');
} else {
  await writeFile(TARGET, png);
  console.log(`wrote ${TARGET.pathname} (${png.byteLength} bytes)`);
}
