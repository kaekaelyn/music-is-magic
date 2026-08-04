// Crop and magnify part of a field render, so a small feature can actually be
// looked at.
//
//   cd tools
//   node zoom.mjs field/forest-rms0.55.png /tmp/wisp.png          # auto-find
//   node zoom.mjs field/forest-rms0.55.png /tmp/out.png 420 180   # explicit
//   node zoom.mjs field/cave-rms0.55.png /tmp/out.png 420 180 90  # tighter crop
//
// Exists because several motifs are small, rare and easy to miss, and "it is
// there, honestly" is not an answer anybody should have to accept twice. The
// owner asked directly — "Can you show me a still of one?" — about the wisps,
// after being told twice that they were drawing.
//
// With no coordinates it finds the most COLOUR-DISTINCT bright pixel rather
// than the brightest one: every mood has a dominant hue and the things worth
// zooming in on (a wisp among green, a sparkle on grey quartz) are the ones
// that depart from it. Brightness alone just finds the sky.
//
// Goes through a browser canvas because there is no image library in this
// project's dependencies and adding one to crop a PNG would be silly. Playwright
// is already here for the smoke suites.
import { startPortal, launch } from './mock-portal.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('zoom: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const [src, out, xArg, yArg, halfArg] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node zoom.mjs <source.png> <out.png> [x y [half]]');
  process.exit(2);
}
const b64 = readFileSync(src).toString('base64');

const portal = await startPortal();
const browser = await launch(chromium);
const page = await browser.newPage();
await page.goto(`${portal.base}/index.html`);

const res = await page.evaluate(async ({ b64, x, y, half }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;

  let bx = x, by = y;
  if (bx == null || by == null) {
    // The frame's average colour is the mood; score each pixel on how far it
    // departs from that while still being bright.
    let ar = 0, ag = 0, ab = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; n++; }
    ar /= n; ag /= n; ab /= n;
    let best = -1;
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        const i = (py * c.width + px) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const lum = (r + gg + b) / 3;
        const dist = Math.abs(r - ar) + Math.abs(gg - ag) + Math.abs(b - ab);
        const score = dist * lum;
        if (score > best) { best = score; bx = px; by = py; }
      }
    }
  }

  const S = half || 150;
  const x0 = Math.max(0, Math.min(c.width - 2 * S, bx - S));
  const y0 = Math.max(0, Math.min(c.height - 2 * S, by - S));
  const o = document.createElement('canvas');
  o.width = 600;
  o.height = 600;
  const og = o.getContext('2d');
  og.drawImage(c, x0, y0, 2 * S, 2 * S, 0, 0, 600, 600);
  // A ring on the subject, so there is no argument about which blob is meant.
  og.strokeStyle = 'rgba(255,255,255,0.5)';
  og.lineWidth = 2;
  og.beginPath();
  og.arc(((bx - x0) * 600) / (2 * S), ((by - y0) * 600) / (2 * S), 70, 0, 6.2832);
  og.stroke();
  return { url: o.toDataURL('image/png'), bx, by, w: c.width, h: c.height };
}, { b64, x: xArg ? +xArg : null, y: yArg ? +yArg : null, half: halfArg ? +halfArg : null });

writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
console.log(`zoom: ${src} (${res.w}x${res.h}) at ${res.bx},${res.by} -> ${out}`);
await browser.close();
await portal.close();
