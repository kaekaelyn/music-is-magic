// §5.5 — audio element + Web Audio graph.
//
// crossorigin="anonymous" plus CORS on the mount (D3) or the analyser
// silently reads zeros. On drowse→resume the src must be re-set and play()
// called again — live streams don't recover from a stall — and the original
// click gesture keeps play() permitted.

// A cell hiccup shorter than the drowse window (D12) can still stall the
// audio element for good while the status poll keeps saying "live". The
// watchdog notices the frozen playhead and re-primes; the visitor hears a
// gap, not silence for the rest of the set.
const STALL_CHECK_MS = 4000;
const REPRIME_COOLDOWN_MS = 8000; // also covers initial buffering

export function createAudioEngine(streamUrl) {
  let el = null;
  let ctx = null;
  let analyser = null;

  let wanted = false; // we believe audio should be playing right now
  let watchdog = null;
  let lastTime = -1;
  let lastPrimeAt = 0;

  // Live streams are not seekable: recovery is always a fresh src, never a
  // play() on the stalled one. The cache-bust lands us at the live edge.
  function prime() {
    lastPrimeAt = Date.now();
    lastTime = -1;
    el.src = `${streamUrl}?t=${lastPrimeAt}`;
    return el.play();
  }

  function checkStall() {
    if (!wanted || !el) return;
    if (Date.now() - lastPrimeAt < REPRIME_COOLDOWN_MS) return;
    const t = el.currentTime;
    const stalled = el.paused || el.ended || t === lastTime;
    lastTime = t;
    if (stalled) prime().catch(() => { /* next check tries again */ });
  }

  async function start() {
    if (!streamUrl) return { synthetic: true }; // mock mode: no real stream
    if (!el) {
      el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'none';
      el.addEventListener('error', checkStall);
    }
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      // createMediaElementSource is once-per-element; keep the graph forever.
      const source = ctx.createMediaElementSource(el);
      analyser = ctx.createAnalyser();
      source.connect(analyser);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (_) { /* retried on next gesture */ }
    }
    wanted = true;
    if (!watchdog) watchdog = setInterval(checkStall, STALL_CHECK_MS);
    try {
      await prime();
      return { analyser, sampleRate: ctx.sampleRate };
    } catch (error) {
      console.warn('audio: play() failed', error);
      return { error };
    }
  }

  function stop() {
    wanted = false;
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  return {
    start,
    resume: start, // resume is by definition a fresh src + play()
    stop,
    get analyser() { return analyser; },
    get sampleRate() { return ctx ? ctx.sampleRate : 48000; },
  };
}
