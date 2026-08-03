// Photographs the FIELD on its own, big, with the audio held at a chosen level.
//
//   cd tools && npm run field                       # every mood, quiet and loud
//   npm run field -- --themes cave --rms 0.6 --seconds 8
//   npm run field -- --themes mountain --frames 3 --gap 4
//
// shots.mjs photographs the portal as a visitor sees it, which is the honest
// composition and a terrible microscope: the field arrives clipped to a lens
// a few hundred pixels wide, dimmed by intensity and overlaid with socket
// shading. Tuning a motif through that is guessing. This renders the same
// engine, same shader, same theme data, straight to a full-size canvas.
//
// Two things it can do that a still of the portal cannot:
//
//   --rms/--treble/--pulse   hold the room at a level. Motifs answer u_rms and
//                            u_pulse now, so a screenshot at silence shows the
//                            quiet half of every mood and nothing else (§14.5).
//   --frames/--gap           a strip of the SAME mood N seconds apart, which is
//                            the only way a still shows motion: put them side
//                            by side and see what moved and what did not.
//
// Output lands in tools/field/ (gitignored), one PNG per mood per level.

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, launch, PORTAL } from './mock-portal.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'field');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const W = Number(arg('width', 900));
const H = Number(arg('height', 470)); // the aperture's proportions at 1080p
const SECONDS = Number(arg('seconds', 6));   // how long the mood has been running
// How finely that time is simulated. Several moods only become themselves after
// a while — frost growing, the cave's lamp swinging, the walk through the trees
// — and reaching 30s of mood at 60fps is 1800 full-size draws on a renderer with
// no GPU behind it, which is minutes per mood. Every clock in the engine
// integrates dt properly (the smoothers are exp(-dt/tau), the travel clock and
// the onset envelope both integrate), so a coarser step lands in very nearly the
// same state for a fifth of the work. Drop it for a fast look at a slow mood;
// leave it at 60 when the thing being judged is per-frame motion.
const FPS = Number(arg('fps', 60));
const FRAMES = Number(arg('frames', 1));     // how many stills per mood
const GAP = Number(arg('gap', 3));           // seconds between them
const RMS = arg('rms', null);                // null = do both quiet and loud

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('field: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const allThemes = JSON.parse(
  await readFile(join(PORTAL, 'assets/themes/index.json'), 'utf8')
);
const themes = arg('themes', '').trim()
  ? arg('themes').split(',').map((s) => s.trim())
  : allThemes;

// Quiet is a mood's resting state; loud is what the owner is actually looking
// at while they play. Both, unless one is asked for.
const levels = RMS !== null
  ? [{ tag: `rms${RMS}`, rms: Number(RMS) }]
  : [{ tag: 'quiet', rms: 0.06 }, { tag: 'loud', rms: 0.55 }];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const portal = await startPortal();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('  page error:', e.message));
await page.goto(`${portal.base}/broadcast.html?nomic=1&relay=none&fast=1`);
await page.waitForFunction(() => document.body.dataset.viz, null, { timeout: 15000 });

const shots = await page.evaluate(
  async ({ names, w, h, seconds, frames, gap, levels, treble, pulse, fps, centroid }) => {
    // Same origin, so these are the engine's own modules — this photographs
    // the shipped shader, not a copy of it.
    const [{ createViz }, { createThemeStore }] = await Promise.all([
      import('./js/viz.js'),
      import('./js/themes.js'),
    ]);
    const canvas = document.createElement('canvas');
    // preserveDrawingBuffer is off in the engine, so toDataURL must happen in
    // the same task as the draw. Everything below is synchronous per frame for
    // exactly that reason.
    const viz = createViz(canvas, { reducedMotion: false });
    if (viz.kind !== 'webgl') return { error: `viz fell back to ${viz.kind}` };
    viz.setSize(w, h);

    const store = createThemeStore();
    await store.init();
    const out = [];
    const step = 1 / fps;

    for (const name of names) {
      const theme = await store.load(name);
      for (const lv of levels) {
        const f = {
          bass: lv.rms * 0.8, mid: lv.rms * 0.8, treble: treble * lv.rms * 2,
          rms: lv.rms, flux: 0, centroid,
        };
        viz.setTheme(theme);
        // Run the mood forward from a standing start, so the travel clock has
        // advanced the way it would have while someone was playing — several
        // moods only become themselves after a while (frost, the cave's light
        // sweep, the walk through the trees).
        let t = 0;
        const advance = (secs) => {
          for (let i = 0; i < Math.round(secs * fps); i++) {
            t += step;
            // One onset every ~1.4s, decaying, so pulse-driven gestures are
            // somewhere in their life rather than always at rest.
            f.flux = (t % 1.4) < step ? pulse : 0;
            viz.frame(t, step, f, 1);
          }
        };
        advance(seconds);
        for (let k = 0; k < frames; k++) {
          if (k) advance(gap);
          // Draw and read back in one go: no await between them.
          viz.frame(t, step, f, 1);
          out.push({
            name: `${name}-${lv.tag}${frames > 1 ? `-${k}` : ''}`,
            data: canvas.toDataURL('image/png'),
          });
        }
      }
    }
    return { out };
  },
  {
    names: themes, w: W, h: H, seconds: SECONDS, frames: FRAMES, gap: GAP,
    levels, fps: FPS,
    treble: Number(arg('treble', 0.5)), pulse: Number(arg('pulse', 0.9)),
    // Register. Several motifs are gated on it and are meant to be absent
    // outside their range — night's aurora most of all — so a fixed 0.45 can
    // only ever photograph one of the two things those moods do.
    centroid: Number(arg('centroid', 0.45)),
  }
);

if (shots.error) {
  console.error(`  ! ${shots.error}`);
} else {
  for (const s of shots.out) {
    const file = join(OUT, `${s.name}.png`);
    await writeFile(file, Buffer.from(s.data.split(',')[1], 'base64'));
    console.log(' ', s.name);
  }
  console.log(`\n${shots.out.length} field renders → ${OUT}`);
}

await browser.close();
portal.close();
