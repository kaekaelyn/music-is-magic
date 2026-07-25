// The eye. Procedural by default (D11 — placeholder art is a real
// deliverable); if assets/eye/manifest.json exists, image layers replace the
// procedural parts they cover (§5.3) and the engine animates them the same way.

import { EyeState } from './state.js';

const LAYER_NAMES = ['frame', 'glow', 'sclera', 'iris', 'lid-lower', 'lid-upper'];

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createEye(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;

  // Animated parameters: current value eases toward its target each frame.
  const p = {
    open: 0, openTarget: 0, openSpeed: 1.2,
    glow: 0.08, glowTarget: 0.08,
    pupil: 0.42, pupilTarget: 0.42,
    scale: 1, scaleTarget: 1,
  };
  let state = EyeState.SEALED;
  let irisRGB = [141, 128, 184];
  let irisTargetRGB = irisRGB.slice();
  let features = null;
  let focusGlow = false;

  // Occasional blinks make an open eye alive rather than painted.
  let nextBlinkAt = 0;
  let blinkStart = -1;
  const BLINK_MS = 0.26;

  // §5.3 manifest plug
  let manifest = null;
  const layers = {};
  (async () => {
    try {
      const res = await fetch('assets/eye/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      manifest = await res.json();
      for (const name of LAYER_NAMES) {
        const spec = manifest.layers && manifest.layers[name];
        if (!spec || !spec.file) continue;
        const img = new Image();
        img.src = `assets/eye/${spec.file}`;
        img.onload = () => { layers[name] = { img, spec }; };
      }
    } catch (_) {
      // No manifest — fully procedural eye, by design.
    }
  })();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function setState(next) {
    state = next;
    switch (next) {
      case EyeState.SEALED:
        p.openTarget = 0; p.openSpeed = 0.5; p.glowTarget = 0.08; p.scaleTarget = 1;
        break;
      case EyeState.STIRRING:
        p.openTarget = 1; p.openSpeed = 0.42; p.glowTarget = 0.55; p.scaleTarget = 1;
        break;
      case EyeState.OPEN:
        p.openTarget = 1; p.openSpeed = 1.4; p.glowTarget = 0.4; p.scaleTarget = 1;
        break;
      case EyeState.COMMUNING:
        p.openTarget = 1; p.openSpeed = 1.4; p.glowTarget = 0.35; p.scaleTarget = 0.82;
        break;
      case EyeState.DROWSING:
        p.openTarget = 0.32; p.openSpeed = 0.35; p.glowTarget = 0.15; p.scaleTarget = 0.9;
        break;
    }
  }

  function setIris(theme) {
    const c = theme.paletteRGB[3];
    irisTargetRGB = [c[0] * 255, c[1] * 255, c[2] * 255];
  }

  function setAudio(f) { features = f; }
  function setFocus(v) { focusGlow = v; }

  function approach(cur, target, dt, speed) {
    return cur + (target - cur) * (1 - Math.exp(-dt * speed * 3));
  }

  function blinkFactor(t) {
    const open = state === EyeState.OPEN || state === EyeState.COMMUNING;
    if (!open || reducedMotion) { blinkStart = -1; return 1; }
    if (nextBlinkAt === 0) nextBlinkAt = t + 4 + Math.random() * 8;
    if (blinkStart < 0 && t >= nextBlinkAt) blinkStart = t;
    if (blinkStart < 0) return 1;
    const ph = (t - blinkStart) / BLINK_MS;
    if (ph >= 1) {
      blinkStart = -1;
      nextBlinkAt = t + 5 + Math.random() * 9;
      return 1;
    }
    return 1 - Math.sin(ph * Math.PI) * 0.96;
  }

  function frame(dt, t) {
    // Integrate parameters.
    p.open = approach(p.open, p.openTarget, dt, p.openSpeed);
    let glowTarget = p.glowTarget;
    if (state === EyeState.COMMUNING && features) {
      glowTarget = 0.3 + features.rms * 0.5;
      p.pupilTarget = 0.36 - features.bass * 0.14; // pupil tightens on the low end
    } else {
      p.pupilTarget = 0.42;
    }
    if (focusGlow) glowTarget = Math.max(glowTarget, 0.3);
    p.glow = approach(p.glow, glowTarget, dt, 1);
    p.pupil = approach(p.pupil, p.pupilTarget, dt, 1.4);
    p.scale = approach(p.scale, p.scaleTarget, dt, 0.5);
    for (let i = 0; i < 3; i++) irisRGB[i] = approach(irisRGB[i], irisTargetRGB[i], dt, 0.4);

    // Sealed breathing (~8s cycle) so the page feels alive, not broken.
    const breathAmp = reducedMotion ? 0.4 : 1;
    const breath =
      state === EyeState.SEALED
        ? 1 + 0.014 * breathAmp * Math.sin((t * 2 * Math.PI) / 8)
        : 1;
    const breathGlow =
      state === EyeState.SEALED
        ? 0.05 * breathAmp * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 8))
        : 0;

    const openEff = ease(clamp01(p.open)) * blinkFactor(t);
    const glowEff = clamp01(p.glow + breathGlow);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.3 * p.scale * breath; // eye half-width
    const hFull = R * 0.62;

    ctx.save();
    ctx.translate(cx, cy);

    drawOrnamentRing(t, R, glowEff);
    drawGlow(R, glowEff);

    if (layers['sclera'] || layers['iris'] || layers['lid-upper']) {
      drawManifestEye(R, openEff, glowEff, t);
    } else {
      drawProceduralEye(R, hFull, openEff, t);
    }

    ctx.restore();
  }

  // --- procedural rendering ---------------------------------------------

  function aperturePath(R, h) {
    ctx.beginPath();
    ctx.moveTo(-R, 0);
    ctx.quadraticCurveTo(0, -2 * h, R, 0);
    ctx.quadraticCurveTo(0, 1.7 * h, -R, 0);
    ctx.closePath();
  }

  function drawProceduralEye(R, hFull, open, t) {
    const h = hFull * open;
    const [ir, ig, ib] = irisRGB;

    if (open > 0.02) {
      ctx.save();
      aperturePath(R, h);
      ctx.clip();

      // Sclera: muted moonstone, darker at the corners.
      const sg = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
      sg.addColorStop(0, '#b6b0a1');
      sg.addColorStop(0.75, '#7d7869');
      sg.addColorStop(1, '#3d3a31');
      ctx.fillStyle = sg;
      ctx.fillRect(-R, -hFull * 2, R * 2, hFull * 4);

      // Iris wanders slowly, as if looking around.
      const wander = open * R * 0.06;
      const ix = (Math.sin(t * 0.11 + 1) * 0.7 + Math.sin(t * 0.043) * 0.3) * wander;
      const iy = Math.sin(t * 0.07 + 2.6) * wander * 0.4;
      const ri = hFull * 0.92;

      ctx.save();
      ctx.translate(ix, iy);

      const igr = ctx.createRadialGradient(0, 0, ri * 0.15, 0, 0, ri);
      igr.addColorStop(0, `rgb(${ir * 1.15 | 0},${ig * 1.15 | 0},${ib * 1.15 | 0})`);
      igr.addColorStop(0.7, `rgb(${ir * 0.6 | 0},${ig * 0.6 | 0},${ib * 0.6 | 0})`);
      igr.addColorStop(1, `rgb(${ir * 0.25 | 0},${ig * 0.25 | 0},${ib * 0.25 | 0})`);
      ctx.beginPath();
      ctx.arc(0, 0, ri, 0, Math.PI * 2);
      ctx.fillStyle = igr;
      ctx.fill();

      // Striations.
      ctx.save();
      ctx.rotate(t * 0.004);
      ctx.strokeStyle = `rgba(${ir | 0},${ig | 0},${ib | 0},0.35)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const r0 = ri * (0.35 + 0.1 * ((i * 7) % 5) / 5);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * ri * 0.96, Math.sin(a) * ri * 0.96);
        ctx.stroke();
      }
      ctx.restore();

      // Pupil with a soft edge.
      const rp = ri * p.pupil;
      const pg = ctx.createRadialGradient(0, 0, rp * 0.6, 0, 0, rp * 1.25);
      pg.addColorStop(0, '#05060a');
      pg.addColorStop(0.8, '#05060a');
      pg.addColorStop(1, 'rgba(5,6,10,0)');
      ctx.beginPath();
      ctx.arc(0, 0, rp * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = pg;
      ctx.fill();

      // Specular glint.
      ctx.beginPath();
      ctx.arc(-ri * 0.28, -ri * 0.3, ri * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,252,0.55)';
      ctx.fill();

      ctx.restore(); // iris translate
      ctx.restore(); // clip

      // Lid edges.
      ctx.strokeStyle = `rgba(${ir | 0},${ig | 0},${ib | 0},0.8)`;
      ctx.lineWidth = Math.max(1.5, R * 0.012);
      ctx.beginPath();
      ctx.moveTo(-R, 0);
      ctx.quadraticCurveTo(0, -2 * h, R, 0);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(-R, 0);
      ctx.quadraticCurveTo(0, 1.7 * h, R, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Closed / low-open seam with lash ticks — the sealed sigil.
    if (open < 0.35) {
      const seamAlpha = 1 - open / 0.35;
      const droop = R * 0.22 * (1 - open);
      ctx.strokeStyle = `rgba(${ir | 0},${ig | 0},${ib | 0},${0.85 * seamAlpha})`;
      ctx.lineWidth = Math.max(1.5, R * 0.014);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-R, 0);
      ctx.quadraticCurveTo(0, droop * 2, R, 0);
      ctx.stroke();
      // Lashes: short ticks following the seam's normal.
      for (const s of [0.12, 0.3, 0.5, 0.7, 0.88]) {
        const x = -R + 2 * R * s;
        const y = 2 * droop * s * (1 - s); // point on the quadratic
        const dx = 2 * R;
        const dy = 2 * droop * (1 - 2 * s);
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        const lash = R * (0.1 + 0.04 * Math.sin(s * 17));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - nx * lash, y - ny * lash);
        ctx.stroke();
      }
    }
  }

  function drawGlow(R, glow) {
    if (glow <= 0.01) return;
    const [ir, ig, ib] = irisRGB;
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 2.1);
    g.addColorStop(0, `rgba(${ir | 0},${ig | 0},${ib | 0},${0.28 * glow})`);
    g.addColorStop(0.6, `rgba(${ir | 0},${ig | 0},${ib | 0},${0.1 * glow})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R * 2.2, -R * 2.2, R * 4.4, R * 4.4);
  }

  // Druidic ornament: a broken ring with cardinal marks, turning slowly.
  function drawOrnamentRing(t, R, glow) {
    const [ir, ig, ib] = irisRGB;
    const rr = R * 1.5;
    const rot = reducedMotion ? 0 : t * 0.012;
    ctx.save();
    ctx.rotate(rot);
    ctx.strokeStyle = `rgba(${ir | 0},${ig | 0},${ib | 0},${0.1 + glow * 0.12})`;
    ctx.lineWidth = Math.max(1, R * 0.008);
    for (let k = 0; k < 4; k++) {
      const a0 = (k * Math.PI) / 2 + 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + Math.PI / 2 - 0.56);
      ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ir | 0},${ig | 0},${ib | 0},${0.25 + glow * 0.2})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // --- manifest (image layer) rendering ---------------------------------

  function drawManifestEye(R, open, glow, t) {
    const box = R * 2.4; // layers are authored on a shared square canvas
    const draw = (name, dx = 0, dy = 0, alpha = 1) => {
      const layer = layers[name];
      if (!layer) return false;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(layer.img, -box / 2 + dx, -box / 2 + dy, box, box);
      ctx.restore();
      return true;
    };

    const travel = (name, fallback) => {
      const spec = layers[name] && layers[name].spec;
      return spec && typeof spec.travel === 'number' ? spec.travel : fallback;
    };

    draw('sclera');
    const wander = open * R * 0.05;
    const ix = Math.sin(t * 0.11 + 1) * wander;
    const iy = Math.sin(t * 0.07 + 2.6) * wander * 0.4;
    draw('iris', ix, iy);
    draw('lid-lower', 0, open * travel('lid-lower', 0.25) * box);
    draw('lid-upper', 0, -open * travel('lid-upper', 0.45) * box);
    if (layers['glow']) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      draw('glow', 0, 0, glow);
      ctx.restore();
    }
    draw('frame');
  }

  return { resize, frame, setState, setIris, setAudio, setFocus };
}
