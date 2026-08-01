// Headless smoke test for the broadcast build (§5.8/§5.9).
//
//   cd tools && npm run smoke:broadcast
//
// smoke.mjs proves the website still works; this proves the YouTube build
// does, and that the two share an engine without sharing a failure. The
// broadcast page has no status endpoint to flip, so the lever here is the
// relay: every ceremony below is driven exactly the way the owner's phone
// drives it, through relay.js's local adapter.
//
// Mic capture is deliberately NOT faked. `?nomic=1` exercises the path a real
// broadcast falls back to when permission is denied — which is the failure
// most likely to happen live, in an OBS browser source, at the worst moment.

import { startPortal, launch } from './mock-portal.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.error('smoke: playwright is not installed. Run: cd tools && npm install');
  process.exit(2);
}

const portal = await startPortal();
const BASE = portal.base;

const results = [];
let failed = false;

function check(ok, label, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed = true;
}

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

const eyeIs = (page, want, timeout = 12000) =>
  page.waitForFunction((w) => document.body.dataset.eye === w, want, { timeout, polling: 100 });
const themeIs = (page, want, timeout = 6000) =>
  page.waitForFunction((w) => document.body.dataset.theme === w, want, { timeout, polling: 100 });

// Fraction of sampled pixels with any light in them. The eye is the only lit
// thing on the frame, so this is a proxy for how much of it the eye fills.
const litFraction = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('eye');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      n++;
      if (d[i] + d[i + 1] + d[i + 2] > 40) lit++;
    }
    return n ? lit / n : 0;
  });

// Drive the relay the way control.html does, from the page's own origin.
const relaySend = (page, state) =>
  page.evaluate((s) => {
    const env = { state: s, ts: Date.now() };
    localStorage.setItem('mim.relay.state', JSON.stringify(env));
    new BroadcastChannel('mim.relay').postMessage(s);
  }, state);

const BC = `${BASE}/broadcast.html?nomic=1&relay=local&fast=1`;
const browser = await launch(chromium);

try {
  // === 1. the ceremony, driven by the relay ==========================
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const assertClean = watch(page, 'broadcast');
    await page.goto(BC);

    await eyeIs(page, 'sealed');
    check(true, 'broadcast opens sealed');

    check(
      await page.evaluate(() => document.getElementById('arm').hidden),
      '?nomic=1 arms without a gesture'
    );

    await relaySend(page, { eye: 'live' });
    // No visitor to click, so the page must commune on its own — straight
    // through stirring, never resting at open.
    await eyeIs(page, 'communing');
    check(true, 'relay wake runs the ceremony and auto-communes');

    await relaySend(page, { theme: 'cave' });
    await themeIs(page, 'cave');
    check(true, 'relay carries a mood');

    await relaySend(page, { theme: 'not-a-real-theme' });
    await themeIs(page, 'default');
    check(true, 'unknown mood degrades to default, not an error');

    await relaySend(page, { theme: 'ice' });
    await themeIs(page, 'ice');

    await relaySend(page, { eye: 'sealed' });
    await eyeIs(page, 'drowsing');
    check(true, 'seal drowses rather than slamming shut');
    await eyeIs(page, 'sealed');
    check(true, 'drowse expiry seals the eye');

    // The eye must survive a second cycle — the whole point is repeat sets.
    await relaySend(page, { eye: 'live' });
    await eyeIs(page, 'communing');
    check(true, 'the eye reopens for a second set');

    assertClean();
    await ctx.close();
  }

  // === 2. junk on a public topic cannot drive the eye =================
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'sanitize');
    await page.goto(BC);
    await eyeIs(page, 'sealed');

    const verdicts = await page.evaluate(async () => {
      const { sanitize } = await import('./js/relay.js');
      return {
        junkString: sanitize('hello'),
        empty: sanitize({}),
        badEye: sanitize({ eye: 'ajar' }),
        pathTheme: sanitize({ theme: '../../etc/passwd' }),
        longTheme: sanitize({ theme: 'x'.repeat(64) }),
        goodTheme: sanitize({ theme: '  CAVE ' }),
        partial: sanitize({ eye: 'live', theme: 'nope/nope' }),
      };
    });

    check(verdicts.junkString === null, 'a non-JSON message is dropped');
    check(verdicts.empty === null, 'an empty object is dropped');
    check(verdicts.badEye === null, 'an unknown eye state is dropped');
    check(verdicts.pathTheme === null, 'a path-traversal mood is dropped');
    check(verdicts.longTheme === null, 'an overlong mood is dropped');
    check(
      verdicts.goodTheme && verdicts.goodTheme.theme === 'cave',
      'a mood is trimmed and lowercased'
    );
    check(
      verdicts.partial && verdicts.partial.eye === 'live' && !verdicts.partial.theme,
      'a half-valid message keeps only the valid half'
    );

    // And the eye must not have moved for any of it.
    await relaySend(page, { eye: 'ajar', theme: '../secrets' });
    await page.waitForTimeout(600);
    check(
      (await page.evaluate(() => document.body.dataset.eye)) === 'sealed',
      'junk on the topic leaves the eye sealed'
    );

    assertClean();
    await ctx.close();
  }

  // === 3. control.html drives broadcast.html, end to end ==============
  {
    const ctx = await browser.newContext();
    const stage = await ctx.newPage();
    const assertStage = watch(stage, 'e2e broadcast');
    await stage.goto(BC);
    await eyeIs(stage, 'sealed');

    const phone = await ctx.newPage();
    const assertPhone = watch(phone, 'e2e control');
    await phone.goto(`${BASE}/control.html?relay=local&fast=1`);

    check(
      await phone.isVisible('#ceremony'),
      'control page shows wake/seal when a relay is configured'
    );

    // A broadcast rig has no Icecast, so the status line must not report one.
    // "sealed (mock)" beside a working broadcast reads as a broken broadcast.
    await phone.waitForFunction(
      () => /control/.test(document.getElementById('statusText').textContent),
      null,
      { timeout: 8000 }
    );
    const line = await phone.textContent('#statusText');
    check(
      !/mock|sealed/.test(line),
      'control page reports the channel, not a stream that does not exist',
      `status line reads "${line}"`
    );

    await phone.click('#bWake');
    await eyeIs(stage, 'communing');
    check(true, 'tapping wake on the control page opens the broadcast eye');

    await phone.click('button:text-is("rain")');
    await themeIs(stage, 'rain');
    check(true, 'tapping a mood on the control page morphs the broadcast');

    await phone.click('#bSeal');
    await eyeIs(stage, 'sealed');
    check(true, 'tapping seal closes the broadcast eye');

    assertStage();
    assertPhone();
    await ctx.close();
  }

  // === 4. the website is untouched by all of the above ================
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'website isolation');
    await page.goto(`${BASE}/control.html?fast=1`);
    check(
      await page.isHidden('#ceremony'),
      'control page hides wake/seal with no relay configured'
    );
    // Hiding it silently reads as a broken page. It has to say why.
    check(
      await page.isVisible('#noRelay'),
      'control page explains why wake/seal is absent'
    );
    assertClean();
    await ctx.close();
  }

  // === 5. the eye fills a 16:9 frame ==================================
  //
  // Measured on the aperture, not on lit pixels: the stone covers the whole
  // frame at any scale, so a brightness count mostly measures stone. #viz is
  // sized to the aperture's bounding box, which IS the eye's scale.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const apertureWidth = (page) =>
      page.evaluate(() => document.getElementById('viz').width);

    const site = await ctx.newPage();
    portal.state.live = true; // the mock's liveness is this variable, not the URL
    await site.goto(`${BASE}/?fast=1`);
    await eyeIs(site, 'open');
    const siteW = await apertureWidth(site);

    const stage = await ctx.newPage();
    await stage.goto(BC);
    await relaySend(stage, { eye: 'live' });
    await eyeIs(stage, 'communing');
    const stageW = await apertureWidth(stage);

    // 0.42 vs 0.30 of the short edge — a ratio of 1.4, checked with slack for
    // device-pixel rounding but tight enough to catch the option not applying.
    const ratio = siteW ? stageW / siteW : 0;
    check(
      ratio > 1.3 && ratio < 1.5,
      'the broadcast eye is scaled up for a 16:9 frame',
      `aperture ${siteW}px website vs ${stageW}px broadcast (ratio ${ratio.toFixed(2)})`
    );

    // And the website's own composition must not have moved: 0.3 of the 720px
    // short edge, doubled for full width.
    check(
      siteW === Math.round(2 * 0.3 * 720),
      'the website eye is exactly its original size',
      `expected ${Math.round(2 * 0.3 * 720)}, got ${siteW}`
    );
    portal.state.live = false;
    await ctx.close();
  }

  // === 5b. a topic beats a stale ?relay=local ========================
  //
  // The combination is a contradiction, and resolving it the other way sent
  // a broadcast page to a channel its phone could not reach while both ends
  // looked healthy. No watch() here: the ntfy subscription cannot connect
  // from a test machine, and its failure is the point, not noise to police.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/broadcast.html?nomic=1&relay=local&topic=smoke-test-topic&fast=1`);
    await eyeIs(page, 'sealed');
    const detail = await page.textContent('#hRelay');
    check(
      !/this machine/.test(detail),
      'a ?topic= overrides a leftover ?relay=local',
      `control row reads "${detail}"`
    );

    // A topic persists per origin now, so this has to be a clean context or
    // it inherits the one above and stops testing local mode at all.
    const soloCtx = await browser.newContext();
    const solo = await soloCtx.newPage();
    await solo.goto(`${BASE}/broadcast.html?nomic=1&relay=local&fast=1`);
    await eyeIs(solo, 'sealed');
    const soloDetail = await solo.textContent('#hRelay');
    const soloClass = await solo.getAttribute('#hRelay', 'class');
    check(
      /this machine/.test(soloDetail) && /warn/.test(soloClass || ''),
      'local mode says it cannot leave the machine, and is not shown as healthy',
      `control row reads "${soloDetail}" (${soloClass})`
    );
    await soloCtx.close();
    await ctx.close();
  }

  // === 5c. the topic outlives the query string =======================
  //
  // `serve` redirects /broadcast.html to /broadcast and drops the query on
  // the way, so a topic that only lived in the URL was gone before the page
  // ran — and the page then reported "local only", which reads as a
  // misconfiguration rather than as something having been taken away.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/broadcast.html?nomic=1&topic=persist-me&fast=1`);
    await eyeIs(page, 'sealed');

    // Second load with a bare URL, exactly what the redirect leaves behind.
    await page.goto(`${BASE}/broadcast.html?nomic=1&fast=1`);
    await eyeIs(page, 'sealed');
    const detail = await page.textContent('#hRelay');
    check(
      !/local only/.test(detail),
      'a topic set once survives a URL that lost its query string',
      `control row reads "${detail}"`
    );

    // And it must be forgettable, or a wrong topic is unfixable.
    await page.goto(`${BASE}/broadcast.html?nomic=1&topic=clear&fast=1`);
    await eyeIs(page, 'sealed');
    check(
      /local only/.test(await page.textContent('#hRelay')),
      '?topic=clear forgets it again'
    );
    await ctx.close();
  }

  // === 6. the frame can be made clean ================================
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'clean frame');
    await page.goto(`${BASE}/broadcast.html?nomic=1&relay=local&fast=1&hud=0`);
    await eyeIs(page, 'sealed');
    check(
      await page.evaluate(() => !document.getElementById('hud')),
      '?hud=0 removes the operator furniture from the frame'
    );
    assertClean();
    await ctx.close();
  }

  // === 7. a denied microphone does not stop the show =================
  {
    // No fake-device flags and no granted permission: getUserMedia rejects,
    // which is exactly what an OBS browser source without media access does.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'mic denied');
    await page.goto(`${BASE}/broadcast.html?relay=local&fast=1`);
    await page.click('#arm');
    await page.waitForFunction(
      () => /synthetic/.test(document.getElementById('hAudio').textContent),
      null,
      { timeout: 8000 }
    );
    check(true, 'a refused microphone falls back to synthetic features');

    await relaySend(page, { eye: 'live' });
    await eyeIs(page, 'communing');
    const a = await litFraction(page);
    await page.waitForTimeout(600);
    const b = await litFraction(page);
    check(a > 0 && b > 0, 'the eye still opens and paints with no microphone');
    assertClean();
    await ctx.close();
  }
} catch (err) {
  check(false, 'broadcast smoke run', err.stack || err.message);
} finally {
  await browser.close();
  portal.close();
}

for (const line of results) console.log(line);
const bad = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - bad}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
