// §5.9 — the broadcast build. This page is the video.
//
// Same eye, same shader, same themes as the website; three things differ:
//
//   audio      the microphone on this machine, not the Icecast stream, so the
//              visuals are locked to the sound YouTube is carrying (mic.js)
//   liveness   the operator, relayed from a phone, not a status poll (relay.js)
//   audience   none, here. Nobody clicks this page, so it arms itself once and
//              then runs the ceremony unattended.
//
// What is deliberately NOT different: state.js. The eye's hygiene rules —
// two positive polls to open, always drowse before sealing, a failed signal
// changes nothing — are the brand, and they are reused verbatim by feeding
// the machine from a local ticker instead of from the network.

import { CONFIG, readRelayTopic, writeRelayTopic, isValidTopic } from './config.js';
import { EyeState, createEyeMachine } from './state.js';
import { createEye } from './eye.js';
import { createViz } from './viz.js';
import { createThemeStore } from './themes.js';
import { createMicEngine, listInputs } from './mic.js';
import { createRelay, EYE_LIVE, EYE_SEALED } from './relay.js';
import { FeatureExtractor, syntheticFeatures, IDLE } from './features.js';

const qs = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEVICE_KEY = 'mim.micDevice';

const eyeCanvas = document.getElementById('eye');
const vizCanvas = document.getElementById('viz');
const viz = createViz(vizCanvas, { reducedMotion });
const eye = createEye(eyeCanvas, {
  reducedMotion,
  field: vizCanvas,
  radius: CONFIG.broadcastRadius, // §5.9: a 16:9 frame needs a bigger eye
});
const themes = createThemeStore();
const machine = createEyeMachine({
  stirMs: CONFIG.stirMs,
  drowseMs: CONFIG.broadcastDrowseMs,
});

let savedDevice = null;
try { savedDevice = localStorage.getItem(DEVICE_KEY); } catch (_) {}
const mic = createMicEngine({ deviceId: savedDevice });

// Reassigned when the operator pairs a new code, so this cannot be const.
let relay = createRelay({ mode: CONFIG.relayMode, topic: CONFIG.relayTopic });

document.body.dataset.viz = viz.kind;

// --- operator HUD ----------------------------------------------------------

const hud = document.getElementById('hud');
const armGate = document.getElementById('arm');
const el = {
  eye: document.getElementById('hEye'),
  theme: document.getElementById('hTheme'),
  audio: document.getElementById('hAudio'),
  relay: document.getElementById('hRelay'),
  viz: document.getElementById('hViz'),
  meter: document.getElementById('meterFill'),
  wake: document.getElementById('bWake'),
  seal: document.getElementById('bSeal'),
  devices: document.getElementById('devices'),
};

// In window-capture mode this page is the broadcast frame, so the furniture
// has to be able to leave completely.
if (qs.get('hud') === '0') hud.remove();

function say(node, text, cls = '') {
  if (!node) return;
  node.textContent = text;
  node.className = `v ${cls}`.trim();
}
say(el.viz, viz.kind, viz.kind === 'webgl' ? 'good' : 'warn');

let idleTimer = null;
function stirHud() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 6000);
}
window.addEventListener('pointermove', stirHud);
window.addEventListener('keydown', (e) => {
  stirHud();
  if (e.key === 'h' || e.key === 'H') {
    if (hud.isConnected) hud.hidden = !hud.hidden;
  }
});
stirHud();

// --- themes ----------------------------------------------------------------

let currentToken = null;
let themeSeq = 0;

function applyTheme(token) {
  if (token === currentToken) return;
  currentToken = token;
  const seq = ++themeSeq;
  themes.load(token).then((theme) => {
    if (seq !== themeSeq) return;
    viz.setTheme(theme);
    eye.setTheme(theme);
    document.body.dataset.theme = theme.name;
    say(el.theme, theme.name);
  });
}

// --- liveness --------------------------------------------------------------
//
// The relay says what the operator wants; the ticker turns that into the poll
// stream state.js was written against. Nothing here reaches into the machine.

let desiredLive = false;

function setDesired(live) {
  desiredLive = !!live;
  el.wake.classList.toggle('on', desiredLive);
  el.seal.classList.toggle('on', !desiredLive);
}
setDesired(false);

setInterval(() => machine.onPoll({ ok: true, live: desiredLive }), CONFIG.broadcastTickMs);

// --- audio -----------------------------------------------------------------

let extractor = null;
let armed = false;

async function startAudio() {
  if (CONFIG.skipMic) {
    // Testing, or a deliberate no-mic broadcast source. Synthetic features
    // keep the eye breathing rather than freezing it.
    extractor = null;
    say(el.audio, 'synthetic (?nomic=1)', 'warn');
    return;
  }
  const r = await mic.start();
  if (r.analyser) {
    extractor = new FeatureExtractor(r.analyser, r.sampleRate);
    say(el.audio, 'live', 'good');
    populateDevices();
  } else {
    // Denied, unplugged, or an OBS browser source without media permission.
    // The show goes on, driven by synthetic features — see RUNNING.md for
    // why window capture avoids this failure entirely.
    extractor = null;
    const why = r.error && r.error.name === 'NotAllowedError' ? 'permission denied' : 'unavailable';
    say(el.audio, `synthetic — mic ${why}`, 'bad');
  }
}

mic.onDeviceLost(() => {
  say(el.audio, 'device lost — retrying', 'bad');
  startAudio();
});

async function populateDevices() {
  const inputs = await listInputs();
  if (!inputs.length || !el.devices) return;
  el.devices.hidden = false;
  el.devices.innerHTML = '';
  for (const d of inputs) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.label;
    if (d.id === savedDevice) o.selected = true;
    el.devices.appendChild(o);
  }
}

if (el.devices) {
  el.devices.addEventListener('change', async () => {
    savedDevice = el.devices.value;
    try { localStorage.setItem(DEVICE_KEY, savedDevice); } catch (_) {}
    // The engine holds the device id, so a change means a fresh engine.
    mic.stop();
    const fresh = createMicEngine({ deviceId: savedDevice });
    const r = await fresh.start();
    if (r.analyser) {
      extractor = new FeatureExtractor(r.analyser, r.sampleRate);
      say(el.audio, 'live', 'good');
    } else {
      say(el.audio, 'synthetic — device rejected', 'bad');
    }
  });
}

// Nobody is watching this page, so the visitor's click has to be synthesized.
// gesture() during STIRRING queues the commune exactly the way a visitor who
// clicked mid-ceremony would — the path state.js already has tests for.
function autoCommune() {
  if (!armed) return;
  if (machine.state === EyeState.STIRRING || machine.state === EyeState.OPEN) {
    machine.gesture();
  }
}

async function arm() {
  if (armed) return;
  armed = true;
  armGate.hidden = true;
  await startAudio();
  autoCommune();
}

armGate.addEventListener('click', arm);
if (CONFIG.skipMic) {
  // No capture means no gesture requirement, so the page can run headless.
  arm();
}

// The mic keeps running through a seal, unlike the website's audio element.
// There is no bandwidth to save here, and a live level meter while the eye is
// shut is how you sound-check before waking it.
machine.on('commune', startAudio);
machine.on('resume', startAudio);
machine.on('change', (next) => {
  eye.setState(next);
  document.body.dataset.eye = next;
  say(el.eye, next, next === EyeState.COMMUNING ? 'good' : '');
  if (next === EyeState.STIRRING || next === EyeState.OPEN) autoCommune();
});

// --- control ---------------------------------------------------------------

const relayHandlers = {
  onState: (s) => {
    if (s.theme) applyTheme(s.theme);
    if (s.eye) setDesired(s.eye === EYE_LIVE);
  },
  onCatchUp: (s, ts) => {
    if (!s) return;
    // Mood is always safe to adopt. Liveness is not: a page opened the next
    // morning must not be woken by yesterday's last message, so the eye state
    // is only honored if the message is recent enough to be this session's.
    if (s.theme) applyTheme(s.theme);
    if (s.eye && Date.now() - ts < CONFIG.catchUpMaxAgeMs) {
      setDesired(s.eye === EYE_LIVE);
    }
  },
  // Only a real, off-machine channel earns green. `local` is working-as-built
  // but cannot reach a phone, and showing that as healthy is how an evening
  // gets spent looking for the fault somewhere else.
  onStatus: ({ ok, detail }) =>
    say(el.relay, detail, ok && relay.mode === 'ntfy' ? 'good' : 'warn'),
};

// Say what is actually known. Until onStatus fires, "connecting" is the
// truth — showing anything more confident sends you hunting for the fault
// somewhere it is not.
function announceRelay() {
  if (!relay.active) say(el.relay, 'local only', 'warn');
  else if (relay.mode === 'ntfy') say(el.relay, 'connecting…', 'warn');
}

relay.start(relayHandlers);
announceRelay();

// --- pairing ---------------------------------------------------------------
//
// The code is typed on the page rather than carried in the URL. A query
// string turned out to be the least durable place to keep the one piece of
// configuration that matters: the dev server strips it on its .html redirect,
// and home-screen shortcuts and OBS browser sources lose it too. Typing it
// here also means no reload, so a mistyped code costs seconds.

const pairForm = document.getElementById('pair');
const codeInput = document.getElementById('code');

if (pairForm && codeInput) {
  codeInput.value = readRelayTopic();

  const flash = (cls) => {
    codeInput.classList.add(cls);
    setTimeout(() => codeInput.classList.remove(cls), 1400);
  };

  pairForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (code && !isValidTopic(code)) {
      flash('fail');
      say(el.relay, 'code: letters, numbers, - and _ only', 'bad');
      return;
    }

    writeRelayTopic(code);
    relay.stop();
    relay = createRelay({ mode: code ? 'ntfy' : 'none', topic: code });
    relay.start(relayHandlers);
    announceRelay();
    flash('ok');
    codeInput.blur(); // let the HUD fade again on a broadcast machine
  });
}

el.wake.addEventListener('click', () => {
  setDesired(true);
  relay.publish({ eye: EYE_LIVE });
});
el.seal.addEventListener('click', () => {
  setDesired(false);
  relay.publish({ eye: EYE_SEALED });
});

// --- render ----------------------------------------------------------------

function resize() {
  eye.resize();
  const box = eye.apertureSize();
  viz.setSize(box.w, box.h);
}
window.addEventListener('resize', resize);

const INTENSITY = {
  [EyeState.SEALED]: 0,
  [EyeState.STIRRING]: 0.25,
  [EyeState.OPEN]: 0.35,
  [EyeState.COMMUNING]: 1,
  [EyeState.DROWSING]: 0.28,
};
let intensity = 0;
let meterAt = 0;

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const state = machine.state;

  // The extractor is read every frame regardless of state, so the meter still
  // moves while the eye is sealed — that is the sound-check.
  const live = extractor ? extractor.frame(dt) : null;

  let feats = IDLE;
  if (state === EyeState.COMMUNING || state === EyeState.DROWSING) {
    feats = live || syntheticFeatures(t);
  } else if (state === EyeState.OPEN || state === EyeState.STIRRING) {
    feats = syntheticFeatures(t, 0.4);
  }

  const tau = state === EyeState.DROWSING ? 4 : 1.5;
  intensity += (INTENSITY[state] - intensity) * (1 - Math.exp(-dt / tau));

  viz.frame(t, dt, feats, intensity);
  eye.setAudio(state === EyeState.COMMUNING ? feats : null);
  eye.frame(dt, t);

  if (el.meter && now - meterAt > 60) {
    meterAt = now;
    const rms = live ? live.rms : 0;
    el.meter.style.width = `${Math.min(100, rms * 100).toFixed(1)}%`;
  }

  requestAnimationFrame(loop);
}

applyTheme('default');
themes.init();
resize();
requestAnimationFrame(loop);
