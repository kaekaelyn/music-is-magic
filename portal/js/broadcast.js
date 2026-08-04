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
import { createThemeStore, isKin, familiesOf } from './themes.js';
import { createMicEngine, listInputs } from './mic.js';
import { createRelay, EYE_LIVE, EYE_SEALED } from './relay.js';
import {
  FeatureExtractor, syntheticFeatures, manualFeatures, IDLE,
  CENTROID_LO_HZ, CENTROID_HI_HZ,
} from './features.js';

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
// Whether the cheap gradient path is available (see viz.js). Losing it
// triples the flock's per-fragment cost and nothing else would say so.
document.body.dataset.vizDeriv = viz.deriv ? '1' : '0';

// --- operator HUD ----------------------------------------------------------

const hud = document.getElementById('hud');
const armGate = document.getElementById('arm');
const el = {
  eye: document.getElementById('hEye'),
  theme: document.getElementById('hTheme'),
  audio: document.getElementById('hAudio'),
  relay: document.getElementById('hRelay'),
  viz: document.getElementById('hViz'),
  frame: document.getElementById('hFrame'),
  pitch: document.getElementById('hPitch'),
  meter: document.getElementById('meterFill'),
  wake: document.getElementById('bWake'),
  seal: document.getElementById('bSeal'),
  mock: document.getElementById('bMock'),
  mockPanel: document.getElementById('mockPanel'),
  mLevel: document.getElementById('mLevel'),
  mReg: document.getElementById('mReg'),
  mRead: document.getElementById('mRead'),
  strike: document.getElementById('bStrike'),
  auto: document.getElementById('bAuto'),
  devices: document.getElementById('devices'),
  moods: document.getElementById('moods'),
};

// The inverse of features.js's centroid scale, which is logarithmic between its
// two bounds. Imported rather than restated so retuning the scale moves the
// readout with it instead of leaving it confidently wrong.
const centroidHz = (c) => CENTROID_LO_HZ * Math.pow(CENTROID_HI_HZ / CENTROID_LO_HZ, c);

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
  // Every shortcut is behind this guard. `h` used not to be, so a pairing
  // code containing an h hid the HUD out from under whoever was typing it.
  const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
  if (typing) return;
  if (e.key === 'h' || e.key === 'H') {
    if (hud.isConnected) hud.hidden = !hud.hidden;
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    setMock(!mockAudio);
    return;
  }
  // Strike from the keyboard: judging an onset gesture means firing it over
  // and over while watching, and a mouse trip to the button each time is
  // enough friction to stop you looking properly.
  if (e.key === 's' || e.key === 'S') {
    if (mockAudio) strike();
    return;
  }
  // 1-9 pick a FAMILY and always land on its base mood; shift walks that
  // family's sub-moods. Judging a look means flipping through them repeatedly,
  // and a keystroke keeps your hands where they are — but only if one of them
  // reliably gets you home.
  if (e.key >= '1' && e.key <= '9') {
    const name = moodOrder[Number(e.key) - 1];
    if (name) chooseTheme(name);
    return;
  }
  if (e.shiftKey && e.code && /^Digit[1-9]$/.test(e.code)) {
    cycleFamily(Number(e.code.slice(5)) - 1);
  }
});
stirHud();

// --- themes ----------------------------------------------------------------

let currentToken = null;
let themeSeq = 0;

let firstTheme = true;
// The RESOLVED name of what is on screen, for the kinship test. The token
// is not enough: an unknown one lands on the fallback, and kinship is about
// where you actually are.
let currentName = null;
// What the most recently accepted token WILL resolve to, known when the theme
// loads rather than when the eye finally swaps it in. See applyTheme.
let pendingName = null;

// `restart` is for a DELIBERATE re-selection of the mood already showing.
//
// Normally re-applying the current token is a no-op, and it has to stay one:
// the relay and the poller both hand this the same name several times a
// minute, and re-entering the mood each time would restart the travel clock
// constantly.
//
// But an operator pressing the mood they are already looking at means
// something, and the owner named what: "to clear it, I would have to press ice
// again from the control panel, or switch back to it after another mood."
// Those two gestures should do the same thing, and now they do — the clock
// resets, so the frost clears and starts growing again, the cave's lamp swings
// back to the top, the sea's current begins from nothing.
function applyTheme(token, restart) {
  // A restart only means anything for the mood ALREADY showing. Applied to a
  // different one it would force the lid onto kin transitions — and rain into
  // sunshower morphing in the open is the whole point of kinship.
  const again = token === currentToken;
  if (again && !restart) return;
  currentToken = token;
  const seq = ++themeSeq;
  themes.load(token).then((theme) => {
    if (seq !== themeSeq) return;
    const swap = (seamless) => {
      // Checked again here, not only above: the eye holds this for the length
      // of a blink, and mashing the mood keys can land another change while
      // it is shut. The newest wins; the stale one simply never applies.
      if (seq !== themeSeq) return;
      viz.setTheme(theme, seamless);
      eye.setTheme(theme);
      currentName = theme.name;
      document.body.dataset.theme = theme.name;
      say(el.theme, theme.name);
      // Mark by the RESOLVED name, not the token: an unknown mood lands on
      // default (§5.2), and the panel should show where you actually are.
      markMood(theme.name);
    };
    // Kin morph in the open — a sub-mood is the same weather changing, and
    // shutting the eye on it would break the continuity that makes the passage
    // from rain through sunshower to sunshine worth having. The first mood is
    // not a change either; there is nothing to blink away from.
    // Re-entering the mood on screen is a fresh visit: it takes the lid and the
    // clock reset, which is what clears the frost. Everything else is unchanged.
    // Against the mood ARRIVING, not the one on screen: for a lid transition
    // swap() runs at the closed moment, so currentName names the previous mood
    // for the whole length of the blink and a mood chosen inside that window
    // gets tested against the mood before last. That is the one path we can find
    // to the owner's autumn-to-barren report.
    const from = pendingName || currentName;
    if (firstTheme) { firstTheme = false; swap(false); }
    else if (!again && isKin(from, theme.name)) swap(true);
    else eye.transition(() => swap(false));
    pendingName = theme.name;
  });
}

// --- mood panel (§5.9) -----------------------------------------------------
//
// The rig can be driven from a paired phone, but a mood is the control you
// reach for constantly while judging the look, and there is no reason to make
// the operator walk to another device to see what a theme does. Choosing here
// also PUBLISHES, so a phone or an open control page stays in step — the two
// panels are two views of one state, never two sources of truth.

const moodButtons = new Map();
let moodOrder = [];   // one entry per FAMILY, in panel order
let moodFamilies = [];

// One mood can own more than one button, so the map holds a list.
function addMoodButton(name, b) {
  const list = moodButtons.get(name);
  if (list) list.push(b); else moodButtons.set(name, [b]);
}

function markMood(name) {
  // Every button for that mood, not one: a shared sub-mood (sunshower) has a
  // button under each of its parents and both should light up.
  for (const [key, list] of moodButtons) {
    for (const b of list) b.classList.toggle('on', key === name);
  }
}

function chooseTheme(name) {
  // Pressing a mood is always deliberate, including when it is the mood
  // already showing.
  applyTheme(name, true);
  if (relay.active) relay.publish({ theme: name });
}

// Grouped by family, one row per base mood with its sub-moods beside it.
//
// A flat row was fine at eight and is not at sixteen: the seasons sat fourteen
// buttons away from the forest they belong to, and the number keys only ever
// reached the first nine, so half the set had no shortcut at all.
//
// The number now belongs to the FAMILY, and pressing it always lands on the
// base mood — so getting back from forest-blooming to forest is one key, from
// anywhere, without having to know where either sits in the list. Shift plus
// the same number walks that family's sub-moods.
function buildMoodPanel(names) {
  if (!el.moods) return;
  el.moods.innerHTML = '';
  moodButtons.clear();
  moodFamilies = familiesOf(names);
  moodOrder = moodFamilies.map((f) => f.parent);

  moodFamilies.forEach((fam, i) => {
    const row = document.createElement('div');
    row.className = 'fam';

    const b = document.createElement('button');
    if (i < 9) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(i + 1);
      b.appendChild(n);
    }
    b.appendChild(document.createTextNode(fam.parent));
    b.addEventListener('click', () => {
      chooseTheme(fam.parent);
      b.blur(); // or the HUD cannot fade back out on a broadcast machine
    });
    row.appendChild(b);
    addMoodButton(fam.parent, b);

    for (const child of fam.children) {
      const c = document.createElement('button');
      c.className = 'sub';
      // Labelled by what distinguishes it, not by its full name: under the
      // forest button, "blooming" says everything "forest-blooming" does.
      // Only when the name actually carries the parent's prefix, though — a
      // shared child (sunshower, which sits under both rain and sunshine) does
      // not, and slicing it blind turned it into "ower".
      c.textContent = child.startsWith(fam.parent + '-')
        ? child.slice(fam.parent.length + 1)
        : child;
      c.title = child;
      c.addEventListener('click', () => { chooseTheme(child); c.blur(); });
      row.appendChild(c);
      addMoodButton(child, c);
    }
    el.moods.appendChild(row);
  });
  if (currentToken) markMood(currentToken);
}

// Shift+N walks the family's sub-moods, wrapping back to the base. Plain N is
// left alone as the way home, so there is always one key that gets you out.
function cycleFamily(index) {
  const fam = moodFamilies[index];
  if (!fam || !fam.children.length) return;
  const ring = [fam.parent, ...fam.children];
  const at = ring.indexOf(currentName);
  chooseTheme(ring[(at + 1 + ring.length) % ring.length]);
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

// Judging a mood means watching it move, and a silent room moves nothing. This
// runs the VISUALS on synthetic motion while leaving capture alone, so the
// shapes can be looked at without playing — the job ?nomic=1 used to do, minus
// the URL edit and the reload.
//
// Deliberately not persisted. A mock flag surviving a reload into a live set
// would mean a broadcast whose picture ignores the piano, and the failure is
// silent from the operator's side. It costs one keystroke to turn back on.
let mockAudio = false;
// Within mock: hand-driven by default, because being able to aim it is the
// reason the panel exists. `auto` returns the animated stand-in for when you
// want to walk away and watch it move on its own.
let mockAuto = false;
// The register the auto sweep is actually producing this frame. The slider's
// value is meaningless in auto mode, so the readout has to come from what is
// driving rather than from a control that is being ignored.
let autoRegister = 0.45;
let lastAutoHz = -1;
// The strike envelope, decayed in the loop. 0.12s to match the release the
// extractor gives flux (features.js), so a mocked onset dies at the same rate
// a real one does and a motif tuned against this is tuned against the truth.
let strikeEnv = 0;

// What the audio row would say about capture alone, kept so the row can be
// re-rendered when mock toggles without re-querying the device.
let audioState = { text: 'not armed', cls: '' };

function sayAudio(text, cls) {
  if (text !== undefined) audioState = { text, cls: cls || '' };
  // Mock never hides the capture state, it prefixes it: the operator needs to
  // know both what is driving the picture AND whether the mic is still good,
  // and those are now two different facts.
  if (mockAudio) say(el.audio, `mock · ${audioState.text}`, 'warn');
  else say(el.audio, audioState.text, audioState.cls);
}

const mockLevel = () => (el.mLevel ? Number(el.mLevel.value) / 100 : 0.45);
const mockRegister = () => (el.mReg ? Number(el.mReg.value) / 100 : 0.45);

// The register slider IS the centroid, so showing its frequency turns the
// panel and the pitch row into one instrument: dial 0.62, read 1246 Hz, and
// that is exactly where the aurora reaches full.
function readMock() {
  if (!el.mRead) return;
  const r = mockRegister();
  // SAY WHAT IS DRIVING, not what is idle. "auto — sliders idle" was read as
  // "auto sweeps within the slider settings" rather than "auto ignores the
  // sliders", and the owner spent a testing session reporting motifs as absent
  // when they had simply never been driven into range: "I had thought that the
  // register/level settings were still affecting the mock output... a lot of my
  // complaints about the aurora and stuff not appearing were probably bunkum."
  // That is a label failing, not a user failing. The auto line now names the
  // thing that IS in control and shows the value it is currently producing, so
  // the panel reads the same way in both modes and a glance says where the
  // register actually is.
  const ar = autoRegister;
  el.mRead.textContent = mockAuto
    ? `auto sweep (sliders ignored) · register ${ar.toFixed(2)} · ${Math.round(centroidHz(ar))} Hz`
    : `level ${mockLevel().toFixed(2)} · register ${r.toFixed(2)} · ${Math.round(centroidHz(r))} Hz`;
}

function setMock(on) {
  mockAudio = !!on;
  if (el.mock) {
    el.mock.classList.toggle('on', mockAudio);
    el.mock.blur(); // or the HUD cannot fade back out on a broadcast machine
  }
  if (el.mockPanel) el.mockPanel.hidden = !mockAudio;
  readMock();
  sayAudio();
}

function strike() {
  strikeEnv = 1;
  if (el.strike) el.strike.blur();
}

async function startAudio() {
  if (CONFIG.skipMic) {
    // Testing, or a deliberate no-mic broadcast source. Synthetic features
    // keep the eye breathing rather than freezing it.
    extractor = null;
    sayAudio('synthetic (?nomic=1)', 'warn');
    return;
  }
  const r = await mic.start();
  if (r.analyser) {
    extractor = new FeatureExtractor(r.analyser, r.sampleRate);
    sayAudio('live', 'good');
    populateDevices();
  } else {
    // Denied, unplugged, or an OBS browser source without media permission.
    // The show goes on, driven by synthetic features — see RUNNING.md for
    // why window capture avoids this failure entirely.
    extractor = null;
    const why = r.error && r.error.name === 'NotAllowedError' ? 'permission denied' : 'unavailable';
    sayAudio(`synthetic — mic ${why}`, 'bad');
  }
}

mic.onDeviceLost(() => {
  sayAudio('device lost — retrying', 'bad');
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
      sayAudio('live', 'good');
    } else {
      sayAudio('synthetic — device rejected', 'bad');
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
// Local only — never published. What drives this machine's picture is nobody
// else's business, and a phone has no reason to learn about it.
if (el.mock) el.mock.addEventListener('click', () => setMock(!mockAudio));
if (el.strike) el.strike.addEventListener('click', strike);
if (el.auto) {
  el.auto.addEventListener('click', () => {
    mockAuto = !mockAuto;
    el.auto.classList.toggle('on', mockAuto);
    el.auto.blur();
    readMock();
  });
}
for (const s of [el.mLevel, el.mReg]) {
  if (s) s.addEventListener('input', readMock);
}

// --- render ----------------------------------------------------------------

function resize() {
  eye.resize();
  const box = eye.apertureSize();
  viz.setSize(box.w, box.h);
}
// One per frame, not one per event — see the same guard in main.js. It matters
// more here: OBS resizes a Browser Source when the scene is edited, and the
// broadcast is the build running on the machine that is also encoding video.
let resizePending = false;
window.addEventListener('resize', () => {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => { resizePending = false; resize(); });
});

const INTENSITY = {
  [EyeState.SEALED]: 0,
  [EyeState.STIRRING]: 0.25,
  [EyeState.OPEN]: 0.35,
  [EyeState.COMMUNING]: 1,
  [EyeState.DROWSING]: 0.28,
};
let intensity = 0;
let meterAt = 0;

// --- frame time -------------------------------------------------------------
//
// The engine shipped with no instrumentation of any kind, so every performance
// claim about a mood was arithmetic over the shader source rather than a
// measurement — including the one that said cave was too expensive to use.
// This is the measurement, and it is deliberately the wall-clock gap between
// animation frames rather than any GPU timer: what "laggy" means to a
// broadcast is that the picture arrives late, whichever part of the machine
// was busy making it.
//
// The MEDIAN of a rolling window, never the mean. One garbage collection or
// one backgrounded second is not the cost of a mood, and a mean reports it as
// if it were. A machine with work to spare reads its vsync interval (~16.7 ms)
// whatever the shader is doing, so the number only starts moving once the
// frame budget is actually gone — which is exactly when it is worth reading.
//
// The window is measured in SECONDS, not in frames, and that is not a detail.
// A hundred-and-twenty-frame window is two seconds on a healthy machine and
// half a minute on a struggling one — so the readout went stale precisely on
// the machines it exists for, and a mood switched to seconds ago still
// reported the cost of the mood before it. (Found by disbelieving the tool:
// tools/perf.mjs walked the moods and reported a smooth ramp that followed
// the order they were tested in rather than what was on screen.)
const FRAME_WINDOW = 240;
const FRAME_SPAN_MS = 2000;
const FRAME_MIN = 12; // two seconds may only be a handful of frames down here
const frameMs = new Float64Array(FRAME_WINDOW);
const frameAt = new Float64Array(FRAME_WINDOW);
const frameSorted = new Float64Array(FRAME_WINDOW);
let frameCount = 0;
let frameSaidAt = 0;

function noteFrame(ms, now) {
  const slot = frameCount % FRAME_WINDOW;
  frameMs[slot] = ms;
  frameAt[slot] = now;
  frameCount++;
  if (now - frameSaidAt < 500) return; // 2 Hz: readable, and free
  frameSaidAt = now;
  // Newest backwards: everything inside the span, and never fewer than
  // FRAME_MIN samples — a median of three is a coin toss.
  const have = Math.min(frameCount, FRAME_WINDOW);
  let n = 0;
  while (n < have) {
    const j = (frameCount - 1 - n) % FRAME_WINDOW;
    if (n >= FRAME_MIN && now - frameAt[j] > FRAME_SPAN_MS) break;
    frameSorted[n++] = frameMs[j];
  }
  if (n < FRAME_MIN) return;
  const win = frameSorted.subarray(0, n);
  win.sort();
  const med = win[n >> 1];
  // 21 ms is a frame and a bit at 60 Hz — the point where dropped frames start
  // being visible in motion. 33 ms is half rate, which is where the owner's
  // word for it becomes "laggy".
  say(el.frame, `${med.toFixed(1)} ms · ${Math.round(1000 / med)} fps`,
      med > 33 ? 'bad' : med > 21 ? 'warn' : 'good');
}

let last = performance.now();
function loop(now) {
  const raw = now - last;
  const dt = Math.min(0.1, raw / 1000);
  last = now;
  const t = now / 1000;
  const state = machine.state;

  // The extractor is read every frame regardless of state, so the meter still
  // moves while the eye is sealed — that is the sound-check.
  const live = extractor ? extractor.frame(dt) : null;

  // `live` is still read every frame above, mock or not: the meter and the
  // pitch row are measurement, and they go on telling the truth about the room
  // while the picture runs on something else.
  strikeEnv *= Math.exp(-dt / 0.12);
  const driving = mockAudio
    ? (mockAuto ? syntheticFeatures(t) : manualFeatures(mockLevel(), mockRegister(), strikeEnv))
    : live;
  // The sweep moves on its own, so the readout has to follow it — but not at
  // sixty DOM writes a second in the build that is also encoding video. The
  // text only changes when the rounded frequency does, so that is the trigger.
  if (mockAudio && mockAuto && driving) {
    autoRegister = driving.centroid;
    const hz = Math.round(centroidHz(autoRegister));
    if (hz !== lastAutoHz) { lastAutoHz = hz; readMock(); }
  }

  let feats = IDLE;
  if (state === EyeState.COMMUNING || state === EyeState.DROWSING) {
    feats = driving || syntheticFeatures(t);
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
    // The centroid, beside the frequency it stands for — the bare 0–1 is not
    // judgeable by ear, and the whole point of this row is to be checked
    // against what is actually being played.
    //
    // `live`, never `feats`: feats falls back to syntheticFeatures, and a
    // calibration readout showing invented numbers is worse than no readout.
    // Dashes mean no microphone, which is itself the answer to a different
    // question.
    if (el.pitch) {
      el.pitch.textContent = live
        ? `${live.centroid.toFixed(2)} · ${Math.round(centroidHz(live.centroid))} Hz`
        : '—';
    }
  }

  noteFrame(raw, now);
  requestAnimationFrame(loop);
}

applyTheme('night');
// The panel is built from whatever index.json lists, so adding a theme folder
// updates this page and the control page alike. init() falls back to the
// built-in names if the fetch fails, so the panel is never empty.
themes.init().then(buildMoodPanel);
resize();
requestAnimationFrame(loop);
