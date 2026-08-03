// §5.9 — local audio capture, the broadcast counterpart to audio.js.
//
// On the website the analyser is fed by the Icecast stream, so every visitor
// analyses their own buffered copy. Broadcasting inverts that: the machine
// running this page is the source, so the analyser reads the microphone
// directly. Two consequences worth knowing:
//
//  - The visuals and the audio are captured on the same machine at the same
//    moment and travel to YouTube in one container, so they arrive locked.
//    This is strictly tighter than the website version can be.
//  - The graph must NOT connect to ctx.destination. On the website that line
//    is what makes sound audible; here it would feed the microphone back into
//    the speakers, and anything capturing desktop audio would capture the
//    howl. The analyser is a tap, not a monitor path.
//
// Failure is never fatal: a denied permission or a missing device leaves the
// extractor null, and broadcast.js falls back to synthetic features so the
// eye still breathes. A broadcast that looks alive but silent beats a black
// frame on a live channel.

// Voice defaults are actively hostile to music. Auto gain control pumps the
// dynamics flat, noise suppression eats sustained piano tails and reverb, and
// echo cancellation notches whatever it thinks is feedback. All three off.
const MUSIC_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

export function createMicEngine({ deviceId = null } = {}) {
  let ctx = null;
  let analyser = null;
  let stream = null;
  let source = null;
  let wanted = false;
  let onLost = null;

  function teardownStream() {
    if (source) {
      try { source.disconnect(); } catch (_) {}
      source = null;
    }
    if (stream) {
      for (const track of stream.getTracks()) {
        try { track.stop(); } catch (_) {}
      }
      stream = null;
    }
  }

  async function start() {
    wanted = true;

    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      return { error: new Error('no getUserMedia (needs HTTPS or localhost)') };
    }

    const audio = { ...MUSIC_CONSTRAINTS };
    // `exact` on purpose: silently landing on the laptop's built-in mic when
    // the chosen interface is unplugged is the kind of failure you discover
    // in the archive afterwards.
    if (deviceId) audio.deviceId = { exact: deviceId };

    try {
      teardownStream();
      stream = await md.getUserMedia({ audio, video: false });
    } catch (error) {
      return { error };
    }

    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return { error: new Error('no Web Audio') };
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (_) { /* retried on the next gesture */ }
    }

    // Unlike createMediaElementSource, createMediaStreamSource is per-stream
    // and cheap, so it is rebuilt whenever the device changes. The analyser
    // is kept, because FeatureExtractor holds a reference to it.
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
    }
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser); // and nowhere else — see the header note

    // A USB interface pulled mid-set ends the track silently otherwise.
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => {
        if (wanted && onLost) onLost();
      });
    }

    return { analyser, sampleRate: ctx.sampleRate };
  }

  function stop() {
    wanted = false;
    teardownStream();
  }

  return {
    start,
    resume: start,
    stop,
    onDeviceLost(fn) { onLost = fn; },
    get analyser() { return analyser; },
    get sampleRate() { return ctx ? ctx.sampleRate : 48000; },
  };
}

// Labels are empty until permission has been granted once — that is the
// browser's rule, not ours, which is why the picker is populated after the
// first successful start rather than on page load.
export async function listInputs() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ id: d.deviceId, label: d.label || 'input' }));
  } catch (_) {
    return [];
  }
}
