// Wiring. The eye is the interface; everything else stays out of sight.

import { CONFIG } from './config.js';
import { createPoller } from './status.js';
import { EyeState, createEyeMachine } from './state.js';
import { createEye } from './eye.js';
import { createViz } from './viz.js';
import { createThemeStore } from './themes.js';
import { createAudioEngine } from './audio.js';
import { FeatureExtractor, syntheticFeatures, IDLE } from './features.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const eyeCanvas = document.getElementById('eye');
const vizCanvas = document.getElementById('viz');
const eye = createEye(eyeCanvas, { reducedMotion });
const viz = createViz(vizCanvas, { reducedMotion });
const themes = createThemeStore();
const machine = createEyeMachine({ stirMs: CONFIG.stirMs, drowseMs: CONFIG.drowseMs });
const audio = createAudioEngine(CONFIG.streamUrl);

// Which renderer won, for field debugging ("is this phone on the fallback?")
// and for the smoke test. CSS keys off data-eye; nothing keys off this.
document.body.dataset.viz = viz.kind;

// §5.7 — the summons. Absent from the DOM unless a topic is configured.
const summon = document.getElementById('summon');
if (CONFIG.summonUrl) {
  summon.href = CONFIG.summonUrl;
  summon.hidden = false;
} else {
  summon.remove();
}

let extractor = null;
let currentToken = null;
let themeSeq = 0;

function applyTheme(token) {
  if (token === currentToken) return;
  currentToken = token;
  const seq = ++themeSeq;
  themes.load(token).then((theme) => {
    if (seq !== themeSeq) return; // a newer token won the race
    viz.setTheme(theme);
    eye.setIris(theme);
    // The resolved name, not the raw token: unknown tokens land on 'default'.
    document.body.dataset.theme = theme.name;
  });
}

async function startAudio() {
  const r = await audio.start();
  if (r.analyser) {
    extractor = new FeatureExtractor(r.analyser, r.sampleRate);
  } else if (r.error) {
    // play() rejected (e.g. gesture context expired during the ceremony).
    // The very next tap anywhere retries — invisible to the visitor.
    extractor = null;
    const retry = () => { if (machine.state === EyeState.COMMUNING) startAudio(); };
    window.addEventListener('pointerdown', retry, { once: true });
  } else {
    extractor = null; // mock mode: synthetic motion instead
  }
}

// Resume goes through startAudio, not audio.resume(), so a first attempt that
// failed still gets its extractor built on the way back.
machine.on('commune', startAudio);
machine.on('resume', startAudio);
machine.on('sealed', () => { audio.stop(); extractor = null; });
machine.on('change', (next) => {
  eye.setState(next);
  document.body.dataset.eye = next; // drives the cursor affordance in CSS
});

const poller = createPoller(
  CONFIG.statusUrl,
  (res) => {
    if (res.ok && CONFIG.mockTheme) res.theme = CONFIG.mockTheme;
    machine.onPoll(res);
    if (res.ok && res.live) applyTheme(res.theme);
  },
  { pollMs: CONFIG.pollMs, jitterMs: CONFIG.pollJitterMs }
);

// The eye canvas covers the screen; any tap is a tap on the eye.
eyeCanvas.addEventListener('click', () => machine.gesture());
eyeCanvas.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    machine.gesture();
  }
});
eyeCanvas.addEventListener('focus', () => eye.setFocus(true));
eyeCanvas.addEventListener('blur', () => eye.setFocus(false));

function resize() {
  eye.resize();
  viz.resize();
}
window.addEventListener('resize', resize);

// Visualization intensity per state; eased so blooms and dims feel breathed.
const INTENSITY = {
  [EyeState.SEALED]: 0,
  [EyeState.STIRRING]: 0.25,
  [EyeState.OPEN]: 0.35,
  [EyeState.COMMUNING]: 1,
  [EyeState.DROWSING]: 0.28,
};
let intensity = 0;

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const state = machine.state;

  let feats = IDLE;
  if (state === EyeState.COMMUNING || state === EyeState.DROWSING) {
    feats = extractor ? extractor.frame(dt) : syntheticFeatures(t);
  } else if (state === EyeState.OPEN || state === EyeState.STIRRING) {
    feats = syntheticFeatures(t, 0.4); // faint ambient motion, no audio yet
  }

  const tau = state === EyeState.DROWSING ? 4 : 1.5;
  intensity += (INTENSITY[state] - intensity) * (1 - Math.exp(-dt / tau));

  viz.frame(t, dt, feats, intensity);
  eye.setAudio(state === EyeState.COMMUNING ? feats : null);
  eye.frame(dt, t);
  requestAnimationFrame(loop);
}

applyTheme('default');
themes.init();
resize();
poller.start();
requestAnimationFrame(loop);
