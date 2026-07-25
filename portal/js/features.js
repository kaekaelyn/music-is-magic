// §5.5 — the fixed per-frame feature set extracted from an AnalyserNode.
//
//   bass / mid / treble  band energies, 0–1 with slow auto-gain
//   rms                  overall loudness
//   flux                 spectral flux (attacks / onsets)
//   centroid             brightness of timbre
//
// Auto-gain: each feature is normalized against its own slowly-decaying peak
// so quiet and loud passages both use the full range.

const BANDS = { bass: [20, 250], mid: [250, 2000], treble: [2000, 8000] };

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
    this.freq = new Uint8Array(this.bins);
    this.wave = new Uint8Array(analyser.fftSize);
    this.prevSpec = new Float32Array(this.bins);
    this.peaks = { bass: 0.05, mid: 0.05, treble: 0.05, rms: 0.05, flux: 0.01 };
    this.out = { bass: 0, mid: 0, treble: 0, rms: 0, flux: 0, centroid: 0.4 };
  }

  _band(lo, hi) {
    const hzPerBin = this.sampleRate / 2 / this.bins;
    const i0 = Math.max(1, Math.floor(lo / hzPerBin));
    const i1 = Math.min(this.bins - 1, Math.ceil(hi / hzPerBin));
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
      this._smooth('centroid', num / den / this.bins, dt, 0.4, 0.6);
    }

    return this.out;
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Gentle stand-in motion for mock mode / when no analyser exists, so the
// visualization still breathes instead of freezing.
export function syntheticFeatures(t, gain = 1) {
  return {
    bass: clamp01(0.38 + 0.28 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 2.13 + 1.7)) * gain,
    mid: clamp01(0.4 + 0.2 * Math.sin(t * 0.53 + 2.1) + 0.1 * Math.sin(t * 1.7)) * gain,
    treble: clamp01(0.3 + 0.2 * Math.sin(t * 1.13 + 0.6) + 0.12 * Math.sin(t * 3.1)) * gain,
    rms: clamp01(0.42 + 0.25 * Math.sin(t * 0.61 + 1.1)) * gain,
    flux: clamp01(Math.pow(Math.max(0, Math.sin(t * 0.83)), 12)) * gain,
    centroid: clamp01(0.42 + 0.18 * Math.sin(t * 0.13)),
  };
}
