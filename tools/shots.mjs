// Photographs the portal: every eye state, every theme, at phone size, plus a
// contact sheet for comparing them side by side.
//
//   cd tools && npm run shots
//   npm run shots -- --themes forest,ice --width 430 --height 932
//
// This is the M5 loop. Dropping a texture bank in and seeing all seven themes
// at once is the difference between tuning art and guessing at it — and the
// looks are procedural, so there is nothing to look at in the repo otherwise.
//
// Output lands in tools/shots/ (gitignored). Nothing here runs in CI; it is a
// tool for eyes.

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, launch, PORTAL } from './mock-portal.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'shots');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const WIDTH = Number(arg('width', 390));
const HEIGHT = Number(arg('height', 844));
// A real topic so the §5.7 rune is in shot; it is never navigated to.
const TOPIC = arg('topic', 'preview-topic');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('shots: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const allThemes = JSON.parse(
  await readFile(join(PORTAL, 'assets/themes/index.json'), 'utf8')
);
const themes = arg('themes', '').trim()
  ? arg('themes').split(',').map((s) => s.trim())
  : allThemes;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const portal = await startPortal();
const { state } = portal;
state.topic = TOPIC;

const browser = await launch(chromium);
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('  page error:', e.message));

const shots = [];
let n = 0;
async function shot(label) {
  const file = join(OUT, `${String(++n).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`);
  await page.screenshot({ path: file });
  shots.push({ file, label });
  console.log(' ', label);
}

const eyeIs = (want, timeout = 15000) =>
  page.waitForFunction((w) => document.body.dataset.eye === w, want, { timeout, polling: 50 });
const themeIs = (want, timeout = 8000) =>
  page.waitForFunction((w) => document.body.dataset.theme === w, want, { timeout, polling: 50 });

state.live = false;
state.theme = themes[0];
await page.goto(`${portal.base}/?fast=1`);
await eyeIs('sealed');
await page.waitForTimeout(2500); // the summons takes 1.6s to fade in
await shot('sealed');

state.live = true;
await eyeIs('stirring');
await page.waitForTimeout(900); // mid-ceremony, where the stone is parting
await shot('stirring');

await eyeIs('open');
await page.waitForTimeout(700);
await shot('open');

await page.locator('#eye').click({ position: { x: WIDTH / 2, y: HEIGHT / 2 } });
await eyeIs('communing', 4000);
await page.waitForTimeout(5000); // intensity eases in over ~1.5s tau

for (const t of themes) {
  state.theme = t;
  try {
    await themeIs(t);
  } catch (_) {
    console.error(`  ! '${t}' never applied — is it in assets/themes/index.json?`);
    continue;
  }
  await page.waitForTimeout(3200); // the ~2.2s morph, then a beat to settle
  await shot(`communing ${t}`);
}

state.live = false;
await eyeIs('drowsing');
await page.waitForTimeout(2000);
await shot('drowsing');

// Contact sheet, composed in the browser so there is no image dependency.
const imgs = await Promise.all(
  shots.map(async (s) => ({
    label: s.label,
    data: `data:image/png;base64,${(await readFile(s.file)).toString('base64')}`,
  }))
);
const cols = Math.min(5, imgs.length);
const sheet = await ctx.newPage();
await sheet.setViewportSize({ width: cols * 344 + 32, height: 600 });
await sheet.setContent(
  `<body style="margin:0;background:#111015;font:13px/1.4 system-ui;color:#b9b2cc">
   <div id="g" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:14px;padding:16px"></div>
   </body>`
);
await sheet.evaluate((items) => {
  document.getElementById('g').innerHTML = items
    .map(
      (i) =>
        `<figure style="margin:0"><img src="${i.data}" style="width:100%;display:block;border-radius:6px">` +
        `<figcaption style="padding-top:6px;letter-spacing:.03em;opacity:.8">${i.label}</figcaption></figure>`
    )
    .join('');
}, imgs);
await sheet.waitForTimeout(400);
const h = await sheet.evaluate(() => document.getElementById('g').scrollHeight + 32);
await sheet.setViewportSize({ width: cols * 344 + 32, height: Math.ceil(h) });
await sheet.waitForTimeout(250);
await sheet.screenshot({ path: join(OUT, 'contact-sheet.png') });

await browser.close();
portal.close();
console.log(`\n${shots.length} shots + contact sheet → ${OUT}`);
