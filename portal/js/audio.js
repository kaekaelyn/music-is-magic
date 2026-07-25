// §5.5 — audio element + Web Audio graph.
//
// crossorigin="anonymous" plus CORS on the mount (D3) or the analyser
// silently reads zeros. On drowse→resume the src must be re-set and play()
// called again — live streams don't recover from a stall — and the original
// click gesture keeps play() permitted.

export function createAudioEngine(streamUrl) {
  let el = null;
  let ctx = null;
  let analyser = null;

  async function start() {
    if (!streamUrl) return { synthetic: true }; // mock mode: no real stream
    if (!el) {
      el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'none';
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
    el.src = `${streamUrl}?t=${Date.now()}`; // cache-bust straight to the live edge
    try {
      await el.play();
      return { analyser, sampleRate: ctx.sampleRate };
    } catch (error) {
      console.warn('audio: play() failed', error);
      return { error };
    }
  }

  function stop() {
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
