// Headless smoke test for the portal: drives the whole §2.1 ceremony against a
// status endpoint this process controls, and fails on any console error.
//
//   cd tools && npm install && npm test
//
// Why mock-portal.mjs instead of `python3 -m http.server`: the interesting
// assertions are all *transitions* — sealed→stirring needs the status endpoint
// to flip mid-run. Serving portal/ from this process makes `state.live = true`
// the whole mechanism, with no control endpoint and no portal-side test hooks.
//
// The portal itself stays dependency-free; Playwright is dev-only tooling and
// nothing under portal/ knows this file exists.

import { startPortal, launch } from './mock-portal.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('smoke: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const portal = await startPortal();
const { state } = portal;
const BASE = portal.base;

// --- harness -------------------------------------------------------------

const results = [];
let failed = false;

function check(ok, label, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed = true;
}

// A single console error is a failure: the portal is written to swallow every
// expected miss (absent manifest, unreachable theme.json), so anything reaching
// the console is by definition unplanned.
// `allow` is for noise the test itself provokes (aborted requests), never for
// noise the portal produces.
function watch(page, label) {
  const noise = [];
  page.on('console', (m) => {
    if (m.type() === 'error') noise.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => noise.push(`requestfailed: ${r.url()}`));
  return (allow) => {
    const real = allow ? noise.filter((n) => !allow.test(n)) : noise;
    check(real.length === 0, `${label}: clean console`, real.join(' | '));
  };
}

const eyeIs = (page, want, timeout = 9000) =>
  page.waitForFunction((w) => document.body.dataset.eye === w, want, { timeout, polling: 100 });
const themeIs = (page, want, timeout = 5000) =>
  page.waitForFunction((w) => document.body.dataset.theme === w, want, { timeout, polling: 100 });

// Sparse sample of the whole eye canvas: proves something was painted, and
// that it keeps changing (i.e. the render loop is alive).
const sampleEye = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('eye');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const v = d[i] + d[i + 1] + d[i + 2] + d[i + 3];
      sum += v;
      if (v > 0) lit++;
    }
    return { sum, lit };
  });

// Mean brightness of the middle of the aperture. This is the assertion that
// the whole design rests on (§2.1): stone when sealed, field when open.
const sampleAperture = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('eye');
    const w = Math.round(c.width * 0.16);
    const h = Math.round(c.height * 0.03);
    const d = c.getContext('2d')
      .getImageData(Math.round(c.width / 2 - w / 2), Math.round(c.height / 2 - h / 2), w, h)
      .data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4) / 3;
  });

const browser = await launch(chromium);

try {
  // === 1. the full ceremony ============================================
  {
    state.live = false;
    state.theme = 'night';
    const page = await browser.newPage();
    const assertClean = watch(page, 'ceremony');
    await page.goto(`${BASE}/?fast=1`);

    await eyeIs(page, 'sealed');
    const kind = await page.evaluate(() => document.body.dataset.viz);
    check(['webgl', 'canvas2d'].includes(kind), `viz renderer selected (${kind})`, kind);
    check(
      await page.evaluate(() => document.body.dataset.theme) === 'night',
      'night (the fallback) applied at rest'
    );
    check(
      await page.evaluate(() => !document.getElementById('summon')),
      'summons absent with no topic configured (§5.7)'
    );

    const sealed = await sampleEye(page);
    check(sealed.lit > 0, 'sealed plate is painted', JSON.stringify(sealed));
    const sealedAperture = await sampleAperture(page);
    check(sealedAperture < 40, 'nothing shows through the sealed stone', `${sealedAperture.toFixed(1)}`);

    // Opening needs two consecutive positive polls (§2.1 hygiene).
    state.live = true;
    await eyeIs(page, 'stirring');
    check(true, 'stirring on two positive polls');
    await eyeIs(page, 'open');
    check(true, 'open after the stir ceremony');

    await page.locator('#eye').click({ position: { x: 400, y: 300 } });
    await eyeIs(page, 'communing', 2000);
    check(true, 'click communes');

    const a = await sampleEye(page);
    await page.waitForTimeout(500);
    const b = await sampleEye(page);
    check(a.sum !== b.sum, 'render loop advances while communing', `${a.sum} vs ${b.sum}`);

    // The field has to reach the visitor through the aperture, and only there.
    await page.waitForTimeout(3500); // intensity eases in over ~1.5s tau
    const openAperture = await sampleAperture(page);
    check(
      openAperture > sealedAperture * 3,
      'the field shows through the open aperture',
      `sealed ${sealedAperture.toFixed(1)} vs communing ${openAperture.toFixed(1)}`
    );

    // §5.2 — a theme token arriving on the metadata field.
    state.theme = 'cave';
    await themeIs(page, 'cave');
    check(true, 'theme token morphs the visualization');

    // Unknown tokens fall back silently; a typo must never break a live stream.
    state.theme = 'definitely-not-a-theme';
    await themeIs(page, 'night');
    check(true, 'unknown token degrades to default, not an error');

    // D12 — drowse, then resume from drowse without going through sealed.
    state.theme = 'ocean';
    state.live = false;
    await eyeIs(page, 'drowsing');
    check(true, 'signal loss drowses rather than slamming shut');
    state.live = true;
    await eyeIs(page, 'communing');
    check(true, 'source returning mid-drowse resumes communing');

    // And the full way down.
    state.live = false;
    await eyeIs(page, 'drowsing');
    await eyeIs(page, 'sealed');
    check(true, 'drowse expiry seals the eye');

    // A failed fetch must never move the machine (§5.1).
    await page.route('**/mock/status.json*', (r) => r.abort());
    state.live = true;
    await page.waitForTimeout(2500);
    check(
      await page.evaluate(() => document.body.dataset.eye) === 'sealed',
      'failed polls change nothing'
    );
    await page.unroute('**/mock/status.json*');

    // The aborts above are ours; Chromium logs every one at browser level.
    assertClean(/net::ERR_FAILED|requestfailed: .*\/mock\/status\.json/);
    await page.close();
  }

  // === 2. the control page (§5.6) ======================================
  {
    state.live = false;
    state.theme = 'night';
    const page = await browser.newPage();
    const assertClean = watch(page, 'control');
    await page.goto(`${BASE}/control.html?fast=1`);

    const buttons = page.locator('#buttons button');
    await buttons.first().waitFor({ timeout: 5000 });
    const count = await buttons.count();
    check(count === 8, 'a button per theme in index.json', `got ${count}`);

    await page.waitForFunction(
      () => document.getElementById('statusText').textContent.startsWith('sealed'),
      null, { timeout: 5000 }
    );
    check(true, 'control page reports the sealed stream');

    await page.locator('#buttons button', { hasText: 'cave' }).click();
    await page.waitForFunction(
      () => document.querySelector('#buttons button.current')?.textContent === 'cave',
      null, { timeout: 3000 }
    );
    check(true, 'tapping a theme marks it current');

    state.live = true;
    state.theme = 'ocean';
    await page.waitForFunction(
      () => document.getElementById('statusText').textContent.includes('live — ocean'),
      null, { timeout: 5000 }
    );
    check(true, 'control page tracks the live theme');

    assertClean();
    await page.close();
  }

  // === 3. the summons, with a topic configured (§5.7) ==================
  {
    state.live = false;
    state.topic = 'smoke-topic-0123456789ab';
    const page = await browser.newPage();
    const assertClean = watch(page, 'summons');
    await page.goto(`${BASE}/?fast=1`);
    await eyeIs(page, 'sealed');

    const href = await page.getAttribute('#summon', 'href');
    check(href === `https://ntfy.sh/${state.topic}`, 'summons points at the topic', String(href));
    check(
      await page.getAttribute('#summon', 'target') === '_blank' &&
        (await page.getAttribute('#summon', 'rel')).includes('noopener'),
      'summons opens safely in a new tab'
    );

    const opacity = () =>
      page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('summon')).opacity));
    await page.waitForFunction(
      () => parseFloat(getComputedStyle(document.getElementById('summon')).opacity) > 0.1,
      null, { timeout: 5000 }
    );
    check(true, 'summons fades in while sealed');

    state.live = true;
    await eyeIs(page, 'open');
    await page.waitForFunction(
      () => parseFloat(getComputedStyle(document.getElementById('summon')).opacity) < 0.02,
      null, { timeout: 5000 }
    );
    check(await opacity() < 0.02, 'summons withdraws once the eye is open');

    state.topic = '';
    assertClean();
    await page.close();
  }

  // === 4. WebGL context loss and restore ==============================
  // Backgrounded mobile tabs really do lose the context; unhandled, the field
  // stays black for the rest of the visit.
  {
    state.live = false;
    state.theme = 'night';
    const page = await browser.newPage();
    const assertClean = watch(page, 'context-loss');
    await page.goto(`${BASE}/?fast=1`);
    await eyeIs(page, 'sealed');

    if (await page.evaluate(() => document.body.dataset.viz) !== 'webgl') {
      check(true, 'context loss n/a (canvas2d fallback in this browser)');
    } else {
      const lost = await page.evaluate(() => {
        // Same canvas, same context object the portal is drawing with.
        const gl = document.getElementById('viz').getContext('webgl');
        window.__smokeExt = gl.getExtension('WEBGL_lose_context');
        if (!window.__smokeExt) return false;
        window.__smokeExt.loseContext();
        return true;
      });
      check(lost, 'WEBGL_lose_context available');

      await page.waitForFunction(
        () => document.getElementById('viz').getContext('webgl').isContextLost(),
        null, { timeout: 3000 }
      );
      check(true, 'context reported lost');

      await page.evaluate(() => window.__smokeExt.restoreContext());
      // A non-null CURRENT_PROGRAM proves our handler re-linked the shader —
      // a bare browser restore would leave the context program-less.
      await page.waitForFunction(
        () => {
          const gl = document.getElementById('viz').getContext('webgl');
          return !gl.isContextLost() && gl.getParameter(gl.CURRENT_PROGRAM) !== null;
        },
        null, { timeout: 5000 }
      );
      check(true, 'engine rebuilds itself on context restore');
    }

    assertClean();
    await page.close();
  }

  // === 5. prefers-reduced-motion ======================================
  {
    state.live = false;
    state.theme = 'forest';
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const assertClean = watch(page, 'reduced-motion');
    await page.goto(`${BASE}/?fast=1`);
    await eyeIs(page, 'sealed');
    check((await sampleEye(page)).lit > 0, 'reduced motion still paints the eye');
    state.live = true;
    await eyeIs(page, 'open');
    await themeIs(page, 'forest');
    check(true, 'reduced motion completes the ceremony');
    assertClean();
    await ctx.close();
  }
} catch (err) {
  check(false, 'smoke run', err.message);
} finally {
  await browser.close();
  portal.close();
}

for (const line of results) console.log(line);
const bad = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - bad}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
