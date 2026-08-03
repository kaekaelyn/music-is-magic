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

// Aperture height over time, sampled inside the page so a ~190ms blink cannot
// fall between two round trips. One bright-pixel column down the middle of the
// plate IS the aperture's height, which is what a lid changes.
const sampleAperture = (page, ms) =>
  page.evaluate((duration) => new Promise((resolve) => {
    const c = document.getElementById('eye');
    const g = c.getContext('2d');
    const vals = [];
    const t0 = performance.now();
    const col = Math.round(c.width / 2);
    const tick = () => {
      const d = g.getImageData(col, 0, 1, c.height).data;
      let peak = 0;
      for (let i = 0; i < d.length; i += 4) {
        peak = Math.max(peak, d[i] + d[i + 1] + d[i + 2]);
      }
      let rows = 0;
      if (peak > 30) {
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] + d[i + 1] + d[i + 2] > peak * 0.5) rows++;
        }
      }
      vals.push(rows);
      if (performance.now() - t0 < duration) setTimeout(tick, 20);
      else resolve(vals);
    };
    tick();
  }), ms);

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

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
    await themeIs(page, 'night');
    check(true, 'unknown mood degrades to night (the fallback), not an error');

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

    // The frame-time readout (§14.8). A mood too expensive for the machine it
    // is running on is a bug the owner can only report usefully if the rig
    // tells them a number, so the row has to fill itself in unprompted — an
    // instrument that silently reads '—' forever is worse than no instrument,
    // because it looks like a measurement.
    const ms = await page
      .waitForFunction(() => {
        const m = /([\d.]+)\s*ms/.exec(document.getElementById('hFrame').textContent);
        return m ? Number(m[1]) : false;
      }, null, { timeout: 10000, polling: 200 })
      .then((h) => h.jsonValue());
    check(ms > 0 && ms < 10000, 'the HUD reports a frame time', `read ${ms}`);

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

    // §5.9's own mood panel. The operator judges the look from this machine,
    // so the panel has to work with no phone in the loop at all — and it has
    // to stay in step with one that IS in the loop, or the two panels become
    // two sources of truth and the rig disagrees with itself on stage.
    const moodCount = await stage.locator('#moods button').count();
    check(moodCount >= 8, 'the broadcast HUD has a button per mood', `${moodCount} found`);

    // The HUD fades to pointer-events:none when idle, so an operator wakes it
    // by moving the mouse before clicking anything. Doing the same here keeps
    // the check honest — forcing the click would test a panel no hand can hit.
    await stage.mouse.move(40, 40);
    await stage.click('#moods button:has-text("ocean")');
    await themeIs(stage, 'ocean');
    check(true, 'choosing a mood on the broadcast page applies it locally');

    await phone.waitForFunction(
      () => document.querySelector('#buttons button.current')?.textContent === 'ocean',
      null,
      { timeout: 8000 }
    );
    check(true, 'a mood chosen on the broadcast page reaches the control page');

    // The keyboard path is the one that gets used while actually watching the
    // field: no pointer to find a small target, and — unlike the buttons — it
    // still works once the HUD has faded, which is how the rig mostly sits.
    await stage.keyboard.press('2');
    await stage.waitForFunction(
      () => document.body.dataset.theme !== 'ocean',
      null,
      { timeout: 8000 }
    );
    check(true, 'number keys pick a mood on the broadcast page');

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

  // === 5d. pairing by typing a code, with no reload ==================
  //
  // The URL turned out to be the least durable place to keep the one piece of
  // configuration that matters. Typing it on the page has to work from a
  // completely bare address, and has to be undoable.
  {
    const ctx = await browser.newContext();
    const stage = await ctx.newPage();
    await stage.goto(`${BASE}/broadcast.html?nomic=1&fast=1`);
    await eyeIs(stage, 'sealed');
    check(
      /local only/.test(await stage.textContent('#hRelay')),
      'broadcast starts unpaired on a bare URL'
    );

    await stage.fill('#code', 'typed-in-code');
    await stage.click('#pair button');
    await stage.waitForFunction(
      () => !/local only/.test(document.getElementById('hRelay').textContent),
      null,
      { timeout: 5000 }
    );
    check(true, 'typing a code pairs the broadcast page without a reload');

    // Gibberish must be refused rather than silently joining a dead channel.
    await stage.fill('#code', 'not a valid topic!');
    await stage.click('#pair button');
    check(
      /only/.test(await stage.textContent('#hRelay')),
      'an invalid code is refused, not quietly accepted'
    );
    check(
      (await stage.inputValue('#code')) === 'not a valid topic!',
      'a refused code stays in the box to be corrected'
    );

    // And it survives a reload with nothing in the URL at all.
    await stage.fill('#code', 'typed-in-code');
    await stage.click('#pair button');
    await stage.goto(`${BASE}/broadcast.html?nomic=1&fast=1`);
    await eyeIs(stage, 'sealed');
    check(
      (await stage.inputValue('#code')) === 'typed-in-code'
        && !/local only/.test(await stage.textContent('#hRelay')),
      'a typed code survives a reload with no query string'
    );

    // Unpairing has to be possible, or a wrong code is a dead end.
    await stage.fill('#code', '');
    await stage.click('#pair button');
    await stage.waitForFunction(
      () => /local only/.test(document.getElementById('hRelay').textContent),
      null,
      { timeout: 5000 }
    );
    check(true, 'clearing the box unpairs it again');
    await ctx.close();
  }

  // === 5e. the control page pairs the same way =======================
  {
    const ctx = await browser.newContext();
    const phone = await ctx.newPage();
    await phone.goto(`${BASE}/control.html?fast=1`);
    check(await phone.isHidden('#ceremony'), 'control starts unpaired on a bare URL');
    check(await phone.isVisible('#noRelay'), 'and says so');

    await phone.fill('#code', 'typed-in-code');
    await phone.click('#pair button');
    await phone.waitForSelector('#ceremony', { state: 'visible', timeout: 5000 });
    check(
      await phone.isHidden('#noRelay'),
      'pairing reveals wake/seal on the control page without a reload'
    );

    await phone.fill('#code', '');
    await phone.click('#pair button');
    await phone.waitForSelector('#ceremony', { state: 'hidden', timeout: 5000 });
    check(true, 'and unpairing hides them again');
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

  // === 6b. the mock toggle ===========================================
  //
  // It exists so the moods can be judged in a silent room without editing the
  // URL. Three things have to hold: it toggles from both the button and the
  // keyboard, it never claims to be driving the picture when it is not, and
  // typing a pairing code does not fire it.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'mock toggle');
    await page.goto(BC);
    await eyeIs(page, 'sealed');

    const audio = () => page.textContent('#hAudio');
    const mockOn = () =>
      page.evaluate(() => document.getElementById('bMock').classList.contains('on'));

    check(!(await mockOn()), 'mock starts off');
    const before = await audio();

    await page.click('#bMock');
    check(await mockOn(), 'the mock button turns it on');
    check(
      /^mock · /.test(await audio()),
      'the audio row says mock is driving, and still says what capture is doing'
    );
    check(
      (await audio()).includes(before),
      'the capture state survives the prefix rather than being overwritten'
    );

    await page.click('#bMock');
    check(!(await mockOn()), 'and the button turns it back off');
    check((await audio()) === before, 'leaving the audio row exactly as it was');

    await page.keyboard.press('m');
    check(await mockOn(), 'm toggles it from the keyboard');
    await page.keyboard.press('m');
    check(!(await mockOn()), 'and back');

    // The guard: shortcuts must not fire while a pairing code is being typed.
    // 'm' used to be safe only by accident of not existing; 'h' was not.
    await page.click('#code');
    await page.type('#code', 'mh4');
    check(
      !(await mockOn()),
      'typing a pairing code containing m does not toggle mock'
    );
    check(
      await page.evaluate(() => !document.getElementById('hud').hidden),
      'nor does an h in it hide the HUD'
    );
    check(
      (await page.inputValue('#code')) === 'mh4',
      'and the characters land in the field'
    );

    assertClean();
    await ctx.close();
  }

  // === 6c. the lid: periodic blinks, and a closed eye between moods ===
  //
  // Measured as the aperture's HEIGHT in pixels — the thing a lid actually
  // changes — by scanning the centre column for rows brighter than half that
  // column's own peak. Self-normalising, so it does not care which mood is up
  // or how bright the field happens to be.
  //
  // Two probes were tried and discarded. A box at the centre reads a shallow
  // dip for a fully shut eye, because a vesica collapses to a horizontal slit
  // through exactly that point. Whole-plate lit AREA at litFraction's
  // threshold reads a flat 0.8 either way, because lit stone clears a sum of
  // 40 comfortably. Sampled inside the page so a ~190ms blink cannot fall
  // between two round trips.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'lid');
    await page.goto(BC);
    await relaySend(page, { eye: 'live' });
    await eyeIs(page, 'communing');
    await page.waitForTimeout(900); // settle at full open

    // What counts as "a lid came down", and the number is reasoned rather than
    // tuned. The only other thing that moves the aperture while communing is
    // the bass breath, and eye.js caps that at 5% (openEff *= 0.95 + bass*0.05)
    // — so anything past 15% below the median cannot be the music.
    //
    // Not stricter, because this suite renders through SwiftShader at roughly
    // 6fps: a 190ms blink spans about one rendered frame and a 920ms mood lid
    // only a handful, so both are usually caught mid-travel rather than shut.
    // Demanding a deeper dip would assert something about the CI renderer
    // rather than about the eye.
    const LID = 0.85;

    // --- a mood change closes it, and hands the mood over while shut ---
    //
    // Warm cave first. A mood is fetched from its own theme.json on first use,
    // and eye.transition only starts once that resolves — so on a cold theme
    // the lid begins after the sample window has largely gone, and a working
    // lid reads as no lid at all.
    await page.keyboard.press('3');
    await themeIs(page, 'cave', 9000);
    await page.waitForTimeout(1500);
    await page.keyboard.press('1');
    await themeIs(page, 'night', 9000);
    await page.waitForTimeout(1500);

    const changing = sampleAperture(page, 2200);
    await page.waitForTimeout(60);
    await page.keyboard.press('3'); // cave, third in index.json
    await page.waitForTimeout(120); // still inside the 276ms close
    const midTheme = await page.evaluate(() => document.body.dataset.theme);
    check(
      midTheme === 'night',
      'the mood is still the old one while the lid is coming down'
    );
    await themeIs(page, 'cave');
    const moodVals = await changing;
    const moodMed = median(moodVals);
    const moodMin = Math.min(...moodVals);
    check(
      moodMin < moodMed * LID,
      'the eye closes for a mood change',
      `min ${moodMin.toFixed(1)} vs median ${moodMed.toFixed(1)}`
    );

    // --- and it blinks on its own ---
    //
    // Sampled long and judged leniently, ON PURPOSE. A blink is ~190ms, and
    // this renderer is software: a frame can cost 200ms, so an individual
    // blink is allowed to fall entirely between two of them and never be
    // drawn. Over twenty seconds several are due, and catching any one of them
    // part-closed is enough to prove the scheduler runs — while a build where
    // blinking was broken outright would show no dip at all. The mood lid is
    // five times longer and is tested strictly above.
    // On sunshine, not on the cave we just switched to. The probe normalises
    // against the centre column's own peak, and cave is the darkest mood in
    // the set with a field that swings as clusters are nominated — enough to
    // move the peak, and so the row count, for reasons that have nothing to
    // do with the lid. A bright steady mood makes the dip unambiguous.
    await page.keyboard.press('8'); // sunshine, last in index.json
    await themeIs(page, 'sunshine');
    await page.waitForTimeout(1200); // let that transition's own lid finish
    // First blink is armed 3-8s after opening, so 13s catches one or two.
    const idleVals = await sampleAperture(page, 20000);
    const idleMed = median(idleVals);
    const idleMin = Math.min(...idleVals);
    check(
      idleMin < idleMed * LID,
      'the eye blinks on its own while communing',
      `min ${idleMin.toFixed(1)} vs median ${idleMed.toFixed(1)}`
    );
    // A blink is an event, not a flicker: it must spend most of its time open.
    const dim = idleVals.filter((v) => v < idleMed * LID).length;
    check(
      dim / idleVals.length < 0.3,
      'and spends most of its time open',
      `${dim}/${idleVals.length} samples dim`
    );

    assertClean();
    await ctx.close();
  }

  // === 6d. kin morph in the open =====================================
  //
  // A sub-mood is the same weather changing its mind, so it must NOT close the
  // eye — that is what lets rain reach sunshine through sunshower without the
  // lid ever dropping. "Does not close" is as much a behaviour as "closes",
  // and it is the easier one to break silently.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'kin morph');
    await page.goto(BC);
    await relaySend(page, { eye: 'live' });
    await eyeIs(page, 'communing');
    await page.waitForTimeout(900);

    const pickMood = (name) => page.evaluate((n) => {
      const b = [...document.querySelectorAll('#moods button')]
        .find((x) => x.textContent.replace(/^\d+/, '') === n);
      if (b) b.click();
      return !!b;
    }, name);

    // Measured as the DELAY between the click and the mood actually changing,
    // not as aperture height. A kin morph swaps immediately; a lid transition
    // hands the swap over at the closed moment, about 276ms in. Watching the
    // aperture instead looks obvious and is not: the eye blinks on its own
    // every few seconds, and a spontaneous blink inside the sample window is
    // indistinguishable from a lid. This discriminator cannot be fooled by one.
    // Asked as an ordering question, not a timing one. Under software
    // rendering a single frame costs ~200ms, which is the same order as the
    // lid's close, so wall-clock cannot tell the two apart. But a kin swap
    // settles on a microtask from the cached theme, while a lid needs a third
    // of a second of ANIMATION FRAMES to reach its closed moment — so
    // draining a couple of macrotask turns separates them regardless of how
    // slow the renderer is.
    const swapsImmediately = (name) => page.evaluate((n) => new Promise((resolve) => {
      const before = document.body.dataset.theme;
      const b = [...document.querySelectorAll('#moods button')]
        .find((x) => x.textContent.replace(/^\d+/, '') === n);
      if (!b) { resolve(null); return; }
      b.click();
      setTimeout(() => setTimeout(() => {
        resolve(document.body.dataset.theme !== before);
      }, 0), 0);
    }), name);

    // Warm every theme this block touches BEFORE timing anything. A mood is
    // fetched from its own theme.json on first use, and that fetch lands
    // inside the click-to-swap window — it measured 544ms on a cold sunshower,
    // which looks exactly like a lid and is not one.
    for (const name of ['sunshower', 'cave', 'rain']) {
      check(await pickMood(name), `${name} is on the panel`);
      await themeIs(page, name, 8000);
      await page.waitForTimeout(1300); // and let each transition's lid finish
    }

    const kinNow = await swapsImmediately('sunshower');
    await themeIs(page, 'sunshower', 8000);
    check(kinNow === true, 'rain to sunshower morphs in the open, no lid');

    await page.waitForTimeout(900);
    const cutNow = await swapsImmediately('cave');
    await themeIs(page, 'cave', 8000);
    check(cutNow === false, 'sunshower to cave still waits for the lid');

    assertClean();
    await ctx.close();
  }

  // === 6e. getting home from a sub-mood ==============================
  //
  // The owner's question, and the reason the panel was regrouped: from inside
  // forest-blooming, can you get back to forest easily? A number key has to
  // land on the BASE mood every time, from anywhere in the family, without the
  // operator having to know where either one sits in a list of sixteen.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const assertClean = watch(page, 'families');
    await page.goto(BC);
    await relaySend(page, { eye: 'live' });
    await eyeIs(page, 'communing');
    await page.waitForTimeout(600);

    // The panel is grouped: one row per family, sub-moods labelled by only
    // what distinguishes them.
    const shape = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#moods .fam')];
      const labelsOf = (r) =>
        [...r.querySelectorAll('button')].map((b) => b.textContent.replace(/^\d+/, ''));
      return {
        rows: rows.length,
        buttons: document.querySelectorAll('#moods button').length,
        forestRow: rows.map(labelsOf).find((l) => l[0] === 'forest'),
        rainRow: rows.map(labelsOf).find((l) => l[0] === 'rain'),
        sunshineRow: rows.map(labelsOf).find((l) => l[0] === 'sunshine'),
        topLevel: rows.map((r) => labelsOf(r)[0]),
      };
    });
    check(shape.rows === 11, 'the panel groups sixteen moods into eleven families',
      `got ${shape.rows} rows / ${shape.buttons} buttons`);
    // sunshower belongs to BOTH its parents and to neither alone, so it is a
    // sub-mood twice over and a family none of the time.
    check(
      !shape.topLevel.includes('sunshower'),
      'sunshower is not a mood in its own right',
      shape.topLevel.join(',')
    );
    check(
      shape.rainRow?.includes('sunshower') && shape.sunshineRow?.includes('sunshower'),
      'sunshower sits under both rain and sunshine',
      `rain [${shape.rainRow}] sunshine [${shape.sunshineRow}]`
    );
    check(
      JSON.stringify(shape.forestRow) === JSON.stringify(['forest', 'blooming', 'autumn', 'barren']),
      'the forest keeps its seasons beside it, named by what differs',
      JSON.stringify(shape.forestRow)
    );

    const pick = (label) => page.evaluate((n) => {
      const b = [...document.querySelectorAll('#moods button')]
        .find((x) => (x.title || x.textContent.replace(/^\d+/, '')) === n);
      if (b) b.click();
      return !!b;
    }, label);

    check(await pick('forest-blooming'), 'a season is one click from its parent row');
    await themeIs(page, 'forest-blooming', 9000);
    await page.waitForTimeout(900);

    // The whole point: one key home, pressed from a sub-mood.
    await page.keyboard.press('2');
    await themeIs(page, 'forest', 9000);
    check(true, 'a number key returns to the base mood from inside the family');

    // And shift walks the family without needing the mouse.
    await page.keyboard.press('Shift+Digit2');
    await themeIs(page, 'forest-blooming', 9000);
    check(true, 'shift and the same key walks that family');

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
