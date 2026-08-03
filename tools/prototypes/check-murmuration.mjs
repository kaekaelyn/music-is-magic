// Headless compile + render check for the murmuration prototype.
//
// Two jobs. A GLSL error only shows as a blank stage in the browser, which
// costs a round trip with the user to discover. And the thing under test here
// is temporal — "it grows and shrinks" — which a still cannot answer, so it
// also samples the body's mass and extent over a full turn cycle. Turning
// edge-on should narrow the HEIGHT while the width and the darkness hold;
// a scale change moves both together.
// Run from anywhere:  node tools/prototypes/check-murmuration.mjs [file.html]
// Screenshots land in tools/prototypes/shots/ — read them, that is the point.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(process.argv[2] || (ROOT + '/murmuration.html'));
mkdirSync(ROOT + '/shots', { recursive: true });

const browser = await chromium.launch({
  // Pre-installed in this environment; do NOT run `playwright install`.
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

// So the frame can be read back after the fact, and so a sample can be taken
// immediately after each draw. Sampling from a separate rAF loop instead gives
// occasional double-steps where the two loops interleave differently, and
// those look exactly like the stutter being hunted.
await page.addInitScript(() => {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl' || type === 'experimental-webgl') {
      attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    }
    return real.call(this, type, attrs);
  };
  const realDraw = WebGLRenderingContext.prototype.drawArrays;
  WebGLRenderingContext.prototype.drawArrays = function (a, b, c) {
    realDraw.call(this, a, b, c);
    if (window.__onDraw) window.__onDraw(this.canvas);
  };
});

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(FILE);
await page.waitForTimeout(1200);

const failed = await page.$eval('#stage', (el) => el.dataset.failed === '1');
console.log('shader/webgl failed:', failed);
if (errors.length) console.log('errors:\n' + errors.join('\n'));
if (failed || errors.length) { await browser.close(); process.exit(1); }

// Rough cost signal. Software rendering, so the absolute number is
// meaningless — but a big drop between versions is not.
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  (function tick() {
    if (++n < 30) return requestAnimationFrame(tick);
    res(n / ((performance.now() - t0) / 1000));
  })();
}));

// Frame-to-frame change, per second of page time. A smoothly folding flock
// changes at a steady rate; a crossfade between two different configurations
// shows up as a spike. This is the only way to see a temporal artefact —
// stills cannot show it, and neither can I.
const jitter = () => page.evaluate(() => new Promise((res) => {
  const w = 150;
  let off = null, ctx = null;
  const out = [];
  let prev = null, prevT = 0, n = 0;
  window.__onDraw = (src) => {
    if (!off) {
      off = document.createElement('canvas');
      off.width = w; off.height = Math.round(w * src.height / src.width);
      ctx = off.getContext('2d', { willReadFrequently: true });
    }
    const h = off.height;
    ctx.drawImage(src, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const cur = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) cur[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
    const now = performance.now();
    if (prev) {
      let s = 0;
      for (let i = 0; i < w * h; i++) s += Math.abs(cur[i] - prev[i]);
      // Per second of page time, so a varying frame rate drops out and only
      // genuine changes in the picture's rate of change survive.
      out.push((s / (w * h)) / Math.max((now - prevT) / 1000, 1e-3));
    }
    prev = cur; prevT = now;
    if (++n >= 110) { window.__onDraw = null; res(out); }
  };
}));

const measure = () => page.evaluate(() => {
  const src = document.getElementById('c');
  const w = 300, h = Math.round(300 * src.height / src.width);
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  // The flock is a dark silhouette on a sky that is ITSELF dark at the top,
  // so an absolute threshold counts the top of the frame as birds. Compare
  // each pixel against the bright end of its own row instead.
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;

  let mass = 0, sum = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) {
    const row = Array.from(lum.slice(y * w, y * w + w)).sort((a, b) => a - b);
    const bg = row[Math.floor(w * 0.9)];
    for (let x = 0; x < w; x++) {
      const v = lum[y * w + x];
      if (v < bg * 0.55) {
        mass++; sum += (bg - v) / Math.max(bg, 1);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return {
    mass: mass / (w * h),
    dark: mass ? sum / mass : 0,
    bw: mass ? (x1 - x0) / w : 0,
    bh: mass ? (y1 - y0) / h : 0,
  };
});

// The adaptive resolution takes a couple of seconds to settle, and measuring
// while it is still descending gives a number that says more about when the
// stopwatch started than about the shader.
await page.waitForTimeout(6000);
const px = await page.$eval('#c', (c) => c.width + 'x' + c.height);
console.log('fps (swiftshader):', (await fps()).toFixed(1), 'at', px);

{
  const j = (await jitter()).slice(4);          // drop warm-up
  const sorted = [...j].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log('change/s  median', med.toFixed(2), ' p95', p95.toFixed(2),
              ' spike x' + (p95 / Math.max(med, 1e-3)).toFixed(2));
  console.log('series:', j.map((v) => v.toFixed(1)).join(' '));
}

// A turn cycle is about 24 s of page time; sample across one and a bit.
const rows = [];
for (let i = 0; i < 14; i++) {
  rows.push(await measure());
  await page.waitForTimeout(2000);
}
console.log('  t    mass   dark   width  height');
rows.forEach((r, i) => console.log(
  String(i * 2).padStart(3), r.mass.toFixed(3).padStart(7),
  r.dark.toFixed(1).padStart(6), r.bw.toFixed(2).padStart(7), r.bh.toFixed(2).padStart(7)));

const span = (k) => {
  const v = rows.map((r) => r[k]);
  return (Math.max(...v) / Math.max(Math.min(...v), 1e-3)).toFixed(2);
};
const mean=(k)=>(rows.reduce((s,r)=>s+r[k],0)/rows.length).toFixed(4);
console.log('mean  mass', mean('mass'), ' width', mean('bw'), ' height', mean('bh'));
console.log(`\nswing  mass x${span('mass')}  width x${span('bw')}  height x${span('bh')}`);

for (const [name, wait] of [['a', 0], ['b', 3500], ['c', 3500], ['d', 3500]]) {
  if (wait) await page.waitForTimeout(wait);
  await page.locator('#stage').screenshot({ path: `${ROOT}/shots/murm-${name}.png` });
}

await browser.close();
