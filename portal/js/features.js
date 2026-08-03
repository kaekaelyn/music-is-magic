// §5.5 — the fixed per-frame feature set extracted from an AnalyserNode.
//
//   bass / mid / treble  band energies, 0–1 with slow auto-gain
//   rms                  overall loudness
//   flux                 spectral flux (attacks / onsets)
//   centroid             brightness of timbre
//
// Auto-gain: each feature is normalized against its own slowly-decaying peak
// so quiet and loud passages both use the full range. Centroid is the one
// exception — it is a position, not an energy, so it gets a fixed
// perceptual (log-frequency) scale instead; auto-gaining it would make the
// whole spectrum drift to the middle and erase the very contrast it reports.

const BANDS = { bass: [20, 250], mid: [250, 2000], treble: [2000, 8000] };

// Centroid scale: log-frequency between these bounds maps to 0–1. Chosen so a
// piano's working range lands mid-scale (≈1 kHz → 0.5), which is what IDLE and
// syntheticFeatures assume. A linear bin fraction would pin real music near
// 0.1 and leave the shiftCentroid mapping doing nothing.
// Exported so a readout can invert them. Keeping these private meant anything
// displaying the centroid had to restate the bounds, and would then go on
// quietly lying if they were ever retuned.
// THE RANGE A PIANO ACTUALLY OCCUPIES, not the range a spectrum analyser can
// display. This was 60..8000 Hz — seven octaves — and a piano's spectral
// centroid lives in a small part of it, because the fundamental dominates and
// the fundamentals stop at 4186 Hz. Measured against the old bounds, low
// playing landed near 0.25 and the brightest playing anyone could manage
// reached about 0.72. The top third of the scale was unreachable by
// construction.
//
// Everything gated on the register was therefore being judged against a number
// that could not get there — cave's lamp (a cube, so 0.72 delivers a third of
// its range), the aurora's charge (a gate at 0.66..0.86, whose upper half
// nothing could reach), the cave pool's rock light, and the hue sweep. The
// owner's note that "register is not affecting crystal illumination in any
// obvious way" is that arithmetic, not a taste question.
//
// 120..4000 Hz spans about five octaves and puts a left-hand chord near 0.15,
// the middle of the keyboard around 0.6, and bright high playing at 0.85 and
// up. A threshold now has to sit inside what the feature can reach — which is
// the rule that has already cost this project three passes at the aurora.
export const CENTROID_LO_HZ = 120;
export const CENTROID_HI_HZ = 4000;
const CENTROID_SPAN = Math.log2(CENTROID_HI_HZ / CENTROID_LO_HZ);

export const IDLE = Object.freeze({
  bass: 0, mid: 0, treble: 0, rms: 0, flux: 0, centroid: 0.4,
});

export class FeatureExtractor {
  constructor(analyser, sampleRate) {
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    this.analyser = analyser;
    this.sampleRate = sampleRate || 48000;
    this.bins = analyser.frequencyBinCount;
    this.hzPerBin = this.sampleRate / 2 / this.bins;
    this.freq = new Uint8Array(this.bins);
    this.wave = new Uint8Array(analyser.fftSize);
    this.prevSpec = new Float32Array(this.bins);
    this.peaks = { bass: 0.05, mid: 0.05, treble: 0.05, rms: 0.05, flux: 0.01 };
    this.out = { bass: 0, mid: 0, treble: 0, rms: 0, flux: 0, centroid: 0.4 };
  }

  _band(lo, hi) {
    const i0 = Math.max(1, Math.floor(lo / this.hzPerBin));
    const i1 = Math.min(this.bins - 1, Math.ceil(hi / this.hzPerBin));
    let sum = 0;
    for (let i = i0; i <= i1; i++) sum += this.freq[i];
    return sum / ((i1 - i0 + 1) * 255);
  }

  // Normalize v against a per-feature decaying peak (auto-gain).
  _norm(name, v, dt) {
    const floor = name === 'flux' ? 0.01 : 0.05;
    const decayed = this.peaks[name] * Math.pow(0.5, dt / 20); // 20s half-life
    this.peaks[name] = Math.max(v, decayed, floor);
    return Math.min(1, v / this.peaks[name]);
  }

  // Fast attack, slower release, so hits land and tails breathe.
  _smooth(name, v, dt, attackTau = 0.04, releaseTau = 0.3) {
    const cur = this.out[name];
    const tau = v > cur ? attackTau : releaseTau;
    this.out[name] = cur + (v - cur) * (1 - Math.exp(-dt / tau));
    return this.out[name];
  }

  frame(dt) {
    const a = this.analyser;
    a.getByteFrequencyData(this.freq);
    a.getByteTimeDomainData(this.wave);

    let sq = 0;
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128;
      sq += v * v;
    }
    const rms = Math.sqrt(sq / this.wave.length);

    let flux = 0;
    let num = 0;
    let den = 0;
    for (let i = 1; i < this.bins; i++) {
      const m = this.freq[i] / 255;
      const d = m - this.prevSpec[i];
      if (d > 0) flux += d;
      this.prevSpec[i] = m;
      num += i * m;
      den += m;
    }
    flux /= this.bins;

    this._smooth('bass', this._norm('bass', this._band(...BANDS.bass), dt), dt);
    this._smooth('mid', this._norm('mid', this._band(...BANDS.mid), dt), dt);
    this._smooth('treble', this._norm('treble', this._band(...BANDS.treble), dt), dt);
    this._smooth('rms', this._norm('rms', rms, dt), dt);
    this._smooth('flux', this._norm('flux', flux, dt), dt, 0.015, 0.12);
    if (den > 0.001) {
      const hz = (num / den) * this.hzPerBin;
      const c = Math.log2(Math.max(CENTROID_LO_HZ, hz) / CENTROID_LO_HZ) / CENTROID_SPAN;
      this._smooth('centroid', clamp01(c), dt, 0.4, 0.6);
    }

    return this.out;
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Operator-driven features: the mock panel's two sliders and its strike,
// shaped into the same vector the extractor produces.
//
// syntheticFeatures animates on its own, which proves the eye still breathes
// and is useless for judging a motif that only wakes under particular playing:
// you cannot AIM it. The aurora is the case that forced this — it is gated on
// centroid, so "is it too subtle" is unanswerable until you can hold the
// register somewhere and look.
//
//   level     dynamics, straight onto rms
//   register  timbre brightness, straight onto centroid — the same 0–1 the
//             pitch readout shows, so a slider position and a HUD reading are
//             the same number
//   strike    a decaying onset envelope, supplied by the caller
export function manualFeatures(level, register, strike) {
  // Energy splits across the bands the way a keyboard does: low playing is
  // nearly all bass, high playing nearly all treble, and the middle carries
  // both, because a real chord is never one band. Combining range and
  // dynamics is the whole point of the panel, so this cannot be a single knob.
  const lo = clamp01(1.25 - register * 2.1);
  const hi = clamp01(register * 2.1 - 0.85);
  const mid = clamp01(1.15 - Math.abs(register - 0.5) * 2.3);
  return {
    bass: clamp01(lo) * level,
    mid: clamp01(mid) * level,
    treble: clamp01(hi) * level,
    rms: level,
    flux: strike,
    centroid: register,
  };
}

// Gentle stand-in motion for mock mode / when no analyser exists, so the
// visualization still breathes instead of freezing.
export function syntheticFeatures(t, gain = 1) {
  return {
    bass: clamp01(0.38 + 0.28 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 2.13 + 1.7)) * gain,
    mid: clamp01(0.4 + 0.2 * Math.sin(t * 0.53 + 2.1) + 0.1 * Math.sin(t * 1.7)) * gain,
    treble: clamp01(0.3 + 0.2 * Math.sin(t * 1.13 + 0.6) + 0.12 * Math.sin(t * 3.1)) * gain,
    rms: clamp01(0.42 + 0.25 * Math.sin(t * 0.61 + 1.1)) * gain,
    flux: clamp01(Math.pow(Math.max(0, Math.sin(t * 0.83)), 12)) * gain,
    // THE STAND-IN HAS TO REACH BOTH ENDS. This used to run 0.24-0.60, which is
    // the middle of the register and nothing else — so any motif gated on bright
    // playing (the aurora is the whole reason this matters) could never fire
    // under mock:auto, and the operator watching it had no way to tell a motif
    // that was too subtle from one that was switched off. A stand-in that
    // cannot visit a range cannot stand in for it.
    //
    // Two slow terms with incommensurable periods (48s and 134s), so the sweep
    // does not repeat on a short cycle: it spends most of its time mid-register
    // and takes an excursion to the very top, and to the very bottom, every
    // couple of minutes. That is roughly how a piece behaves, and it means the
    // high-register moods can be watched arriving without touching a slider.
    centroid: clamp01(0.45 + 0.34 * Math.sin(t * 0.13)
                           + 0.16 * Math.sin(t * 0.047 + 1.3)),
  };
}
