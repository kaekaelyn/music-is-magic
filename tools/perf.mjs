// Measures what each mood costs to draw, in milliseconds per frame.
//
//   cd tools && npm run perf                 # the field alone, per mood
//   npm run perf -- --mode hud               # end-to-end, read off the HUD
//   npm run perf -- --themes cave,mountain --frames 40
//
// Why this exists: until now there was no instrumentation on the engine at
// all, so every performance claim in PLAN.md was arithmetic over the shader
// source. §14.8's P0 — "cave is unusable, and it is a performance bug" — was
// diagnosed that way and could not be checked that way.
//
// Two modes, because they answer different questions:
//
//   shader  (default) times the FIELD on its own: a viz instance at the
//           broadcast frame's field size, N frames back to back, with a pixel
//           read at the end to force the GPU to actually finish. Nothing else
//           on the page runs. This is the number a motif's cost shows up in.
//   hud     reads the broadcast HUD's own frame-time row while the whole page
//           runs — eye compositing, feature extraction and all. It is what
//           the owner is looking at, and it is the honest end-to-end figure,
//           but on a machine with no GPU it saturates: everything from night
//           to cave pins at the same rate and the moods stop being
//           distinguishable. Use it on a real machine, or to sanity-check
//           that the HUD readout itself is sane.
//
// READ THE RATIOS, NOT THE ABSOLUTE NUMBERS. Headless Chromium has no GPU
// here, so WebGL runs on SwiftShader — every fragment is shaded on the CPU.
// That makes absolute times far worse than any real machine's and, more
// usefully, makes them proportional to the fragment work a mood actually
// does. Compare moods against each other, and a run against the same run
// before a change. Do not quote these as what the owner's laptop will do.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startPortal, launch, PORTAL } from './mock-portal.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODE = arg('mode', 'shader');
// 1080p by default: the broadcast frame is what the owner actually runs, and
// the field's backing store is sized off it (907x472 here, against 605x314 at
// 720p — half as many fragments, and half the answer).
const WIDTH = Number(arg('width', 1920));
const HEIGHT = Number(arg('height', 1080));
const ROUNDS = Number(arg('rounds', 3));
const FRAMES = Number(arg('frames', 30)); // shader mode: frames per round
// hud mode: the 2.2s morph, then the readout's own 2s window, so nothing
// sampled still contains a frame drawn by the previous mood.
const SETTLE = Number(arg('settle', 4500));
const SAMPLE = Number(arg('sample', 2500));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('perf: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const allThemes = JSON.parse(
  await readFile(join(PORTAL, 'assets/themes/index.json'), 'utf8')
);
const themes = arg('themes', '').trim()
  ? arg('themes').split(',').map((s) => s.trim())
  : allThemes;

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};

const portal = await startPortal();
// Vsync is deliberately left ON. Turning the frame-rate limiter off makes hud
// mode's timings continuous instead of arriving in 16.7 ms steps, but with a
// software renderer it also lets requestAnimationFrame outrun the compositor:
// the callbacks queue, and the measured gap climbs through a run until the
// last mood tested reads four times the first regardless of which mood it is.
// shader mode does not go through rAF at all, so it is unaffected either way.
const browser = await launch(chromium);
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1, // a broadcast frame is 1:1; retina doubling is not the case under test
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('  page error:', e.message));

// nomic: synthetic features, and no arming gate to click.
// relay=none: nothing reaching for the network while we are timing.
await page.goto(`${portal.base}/broadcast.html?nomic=1&relay=none&fast=1`);
await page.waitForFunction(() => document.body.dataset.viz, null, { timeout: 15000 });

const env = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const viz = document.getElementById('viz');
  return {
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    kind: document.body.dataset.viz,
    w: viz.width,
    h: viz.height,
  };
});

console.log(`\n  ${env.kind} · ${env.renderer}`);
console.log(`  frame ${WIDTH}x${HEIGHT} · field ${env.w}x${env.h} · mode ${MODE}`);

const perMood = new Map(themes.map((t) => [t, []]));
const perRound = [];

if (MODE === 'shader') {
  console.log(`  ${ROUNDS} rounds x ${FRAMES} frames\n`);
  const res = await page.evaluate(
    async ({ names, w, h, frames, rounds }) => {
      // Same origin as the page, so the engine's own modules load unmodified —
      // this measures the shipped shader, not a copy of it.
      const [{ createViz }, { createThemeStore }] = await Promise.all([
        import('./js/viz.js'),
        import('./js/themes.js'),
      ]);
      const canvas = document.createElement('canvas');
      const viz = createViz(canvas, { reducedMotion: false });
      if (viz.kind !== 'webgl') return { error: `viz fell back to ${viz.kind}` };
      viz.setSize(w, h);
      const gl = canvas.getContext('webgl');
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);

      const store = createThemeStore();
      await store.init();
      const loaded = {};
      for (const n of names) loaded[n] = await store.load(n);

      // A room being played in: motifs answer u_rms, and measuring them at
      // silence measures the wrong half of every mood.
      const feats = { bass: 0.4, mid: 0.4, treble: 0.4, rms: 0.5, flux: 0.2, centroid: 0.5 };
      const out = {};
      for (const n of names) out[n] = [];

      for (let r = 0; r < rounds; r++) {
        for (const n of names) {
          viz.setTheme(loaded[n]);
          // Finish the 2.2s morph before timing, or half of what is timed is
          // a blend of this mood and the last one.
          for (let i = 0; i < 4; i++) viz.frame(0, 1, feats, 1);
          sync();
          let t = 100;
          const t0 = performance.now();
          for (let i = 0; i < frames; i++) {
            t += 1 / 60;
            viz.frame(t, 1 / 60, feats, 1);
          }
          sync(); // forces every queued draw to have actually happened
          out[n].push((performance.now() - t0) / frames);
        }
      }
      return { out };
    },
    { names: themes, w: env.w, h: env.h, frames: FRAMES, rounds: ROUNDS }
  );

  if (res.error) {
    console.error(`  ! ${res.error}`);
    await browser.close();
    portal.close();
    process.exit(1);
  }
  for (const [name, xs] of Object.entries(res.out)) perMood.set(name, xs);
  for (let r = 0; r < ROUNDS; r++) {
    perRound.push(median(themes.map((t) => perMood.get(t)[r]).filter(Boolean)));
  }
} else {
  console.log(`  ${ROUNDS} rounds · ${SETTLE / 1000}s settle + ${SAMPLE / 1000}s sample per mood\n`);
  const readFrame = () =>
    page.evaluate(() => {
      const m = /([\d.]+)\s*ms/.exec(document.getElementById('hFrame').textContent);
      return m ? Number(m[1]) : null;
    });

  // Wake it: the field only carries a mood's full weight while communing.
  await page.click('#bWake');
  await page.waitForFunction(() => document.body.dataset.eye === 'communing',
    null, { timeout: 20000, polling: 100 });
  await page.waitForTimeout(2000); // intensity eases in over ~1.5s

  for (let round = 0; round < ROUNDS; round++) {
    const marks = [];
    for (const name of themes) {
      await page.evaluate((n) => {
        // The same path a keystroke takes, without depending on the panel's order.
        document.querySelectorAll('#moods button').forEach((b) => {
          if (b.textContent.replace(/^\d+/, '') === n) b.click();
        });
      }, name);
      try {
        await page.waitForFunction((n) => document.body.dataset.theme === n, name,
          { timeout: 8000, polling: 100 });
      } catch (_) {
        console.error(`  ! '${name}' never applied — is it in assets/themes/index.json?`);
        continue;
      }
      await page.waitForTimeout(SETTLE);

      const samples = [];
      const until = Date.now() + SAMPLE;
      while (Date.now() < until) {
        const v = await readFrame();
        if (v) samples.push(v);
        await page.waitForTimeout(250);
      }
      const ms = median(samples);
      perMood.get(name).push(ms);
      marks.push(ms);
      console.log(`  round ${round + 1}  ${name.padEnd(10)} ${ms.toFixed(1).padStart(7)} ms`);
    }
    perRound.push(median(marks));
  }
}

const rows = themes
  .filter((t) => perMood.get(t) && perMood.get(t).length)
  .map((t) => {
    const xs = perMood.get(t);
    return { name: t, ms: median(xs), lo: Math.min(...xs), hi: Math.max(...xs) };
  })
  .sort((a, b) => b.ms - a.ms);

const best = Math.min(...rows.map((r) => r.ms));
console.log('\n  median of all rounds, dearest first:\n');
console.log(`  ${'mood'.padEnd(10)} ${'ms'.padStart(7)}  ${'spread'.padStart(13)}   relative`);
for (const r of rows) {
  const x = r.ms / best;
  console.log(
    `  ${r.name.padEnd(10)} ${r.ms.toFixed(1).padStart(7)}  ` +
    `${`${r.lo.toFixed(1)}–${r.hi.toFixed(1)}`.padStart(13)}   ` +
    `${x.toFixed(2)}x ${'█'.repeat(Math.round(x * 6))}`
  );
}
// Honesty about the instrument: if the rounds themselves drifted, the spread
// column is that drift and not a property of any mood.
if (perRound.length > 1) {
  const d = perRound[perRound.length - 1] / perRound[0];
  console.log(`\n  round medians: ${perRound.map((m) => m.toFixed(0)).join(' → ')} ms` +
    ` (${d > 1.15 || d < 0.87 ? 'the machine drifted — trust the ratios, not the ms' : 'stable'})`);
}
console.log();

await browser.close();
portal.close();
