// Print the GLSL compile log when the shader fails to build.
//
//   cd tools && node shader-errors.mjs
//
// Exists because the smoke suite can only tell you THAT the shader broke, not
// why: a compile failure surfaces as `FAIL viz renderer selected (none) — none`
// and the actual error is buried in a console warning the harness discards.
// Every editing session on viz.js has cost at least one round trip to find a
// backtick, a redefinition or a syntax slip that this prints in ten seconds.
//
// Exits non-zero if the page fell back to canvas2d, so it can gate a commit.
import { startPortal, launch } from './mock-portal.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('shader-errors: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const portal = await startPortal();
const browser = await launch(chromium);
const page = await browser.newPage();

let broke = false;
const report = (label, text) => {
  // The compile log arrives inside the fallback warning, newlines and all.
  if (/WebGL unavailable|no 2D context|ERROR: \d+:\d+/.test(text)) broke = true;
  console.log(`[${label}] ${text}`);
};
page.on('console', (m) => { if (m.type() === 'error' || /viz:/.test(m.text())) report(m.type(), m.text()); });
page.on('pageerror', (e) => report('pageerror', e.message));

await page.goto(`${portal.base}/broadcast.html?nomic=1&relay=local&fast=1`);
await page.waitForTimeout(3000);

const kind = await page.evaluate(() => document.body.dataset.viz || 'unknown');
await browser.close();
await portal.close();

if (broke) {
  console.error('\nshader did NOT compile — the page is on the 2D fallback.');
  process.exit(1);
}
console.log(`\nshader compiled (renderer: ${kind}).`);
