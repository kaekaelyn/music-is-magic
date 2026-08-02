// The eye is a carved thing, not a face: a stone plate with a lens-shaped
// aperture cut through it. The aperture is a window onto the visualization —
// sealed, there is nothing to see but stone; open, you see what is inside.
//
// That inversion is the whole design. This canvas is the compositor: it draws
// the stone, clips to the aperture, and pulls the field in from the viz
// canvas (which is never displayed — it is only a source). Nothing here is
// anatomical; no sclera, no lashes, no glint. Stone doesn't blink.
//
// If assets/eye/manifest.json declares layers, they replace the procedural
// parts they cover (§5.3) and the engine animates them the same way.

import { EyeState } from './state.js';

const LAYER_NAMES = ['plate', 'socket', 'lid-lower', 'lid-upper', 'glow', 'frame'];

// Aperture half-height as a fraction of half-width. Lower than a human eye's
// proportion on purpose — a narrow vesica reads as carved, not drawn.
const APERTURE_RATIO = 0.52;
const EYE_RADIUS = 0.3; // half-width, as a fraction of the smaller screen edge

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => ease(clamp01((x - a) / (b - a)));

// Light comes from above and slightly left, consistently: the relief shading,
// the aperture bevel and the socket lip all agree on it, which is most of what
// makes a flat canvas read as carved.
const LIGHT_X = -0.5;
const LIGHT_Y = -0.87;

// --- procedural stone ----------------------------------------------------

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm2(x, y, octaves) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * f, y * f);
    f *= 2.07;
    amp *= 0.5;
  }
  return v;
}

// `radius` overrides EYE_RADIUS. The default is the website's composition and
// must not drift; broadcast (§5.9) passes a larger value because a 16:9 frame
// is sized off its height and would otherwise strand the eye in black.
export function createEye(canvas, { reducedMotion = false, field = null, radius = EYE_RADIUS } = {}) {
  const eyeRadius = radius;
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let R = 0;      // aperture half-width, CSS px
  let hFull = 0;  // aperture half-height at full open, CSS px
  let plate = null; // baked stone, redrawn only on resize

  // Animated parameters: current value eases toward its target each frame.
  const p = {
    open: 0, openTarget: 0, openSpeed: 1.2,
    glow: 0, glowTarget: 0,
  };
  let state = EyeState.SEALED;
  let glowRGB = [141, 128, 184];
  let glowTargetRGB = glowRGB.slice();
  let features = null;
  let focusGlow = false;

  // --- the lid -------------------------------------------------------------
  //
  // A gesture that closes the aperture and reopens it, held as a MULTIPLIER on
  // the open amount rather than as a change to p.openTarget. That separation is
  // the whole design: a blink cannot fight the ceremony. Land one mid-STIRRING
  // and it rides on top of the opening curve, which carries on underneath and
  // arrives where it was always going.
  //
  // Shape is close / hold / open, as fractions of the duration. Closing faster
  // than opening is what makes it read as a lid and not a pulse — an eyelid
  // snaps shut and rolls back up.
  const BLINK = { dur: 0.19, closeF: 0.42, holdF: 0.06, depth: 1 };
  // The changeover. Slower, deeper, and with a real hold at the bottom, which
  // is the point: the mood swap happens while this is shut. PLAN.md §5.5 notes
  // that resetting the travel clock cuts the outgoing mood's motion mid
  // crossfade, accepted because "the whole image is dissolving at that moment
  // anyway" — behind a closed lid it is not merely dissolving, it is unseen.
  const MOOD_LID = { dur: 0.92, closeF: 0.3, holdF: 0.24, depth: 0.94 };

  let lid = null;
  let lidT = 0;
  let lidAtClosed = null; // fired once, at the instant the hold begins

  // Blinks are scheduled on the frame clock rather than a timer, so a
  // backgrounded tab (which stops rAF) does not wake to a queue of them.
  let nextBlink = 0;

  function startLid(shape, atClosed) {
    lid = shape;
    lidT = 0;
    lidAtClosed = atClosed || null;
  }

  function lidAmount(dt) {
    if (!lid) return 1;
    lidT += dt;
    const u = lidT / lid.dur;
    if (u >= 1) {
      // Never strand the callback: a gesture cut short by a resize or a stall
      // still has to hand the swap over, or the mood would never arrive.
      if (lidAtClosed) { lidAtClosed(); lidAtClosed = null; }
      lid = null;
      return 1;
    }
    let k;
    if (u < lid.closeF) {
      k = ease(u / lid.closeF);
    } else if (u < lid.closeF + lid.holdF) {
      k = 1;
      if (lidAtClosed) { lidAtClosed(); lidAtClosed = null; }
    } else {
      k = ease(1 - (u - lid.closeF - lid.holdF) / (1 - lid.closeF - lid.holdF));
    }
    return 1 - lid.depth * k;
  }

  // §5.3 manifest plug
  const layers = {};
  (async () => {
    try {
      const res = await fetch('assets/eye/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const manifest = await res.json();
      for (const name of LAYER_NAMES) {
        const spec = manifest.layers && manifest.layers[name];
        if (!spec || !spec.file) continue;
        const img = new Image();
        img.src = `assets/eye/${spec.file}`;
        img.onload = () => { layers[name] = { img, spec }; };
      }
      if (manifest.aperture) layers.aperture = manifest.aperture;
    } catch (_) {
      // No manifest — fully procedural, by design.
    }
  })();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    R = Math.min(W, H) * eyeRadius;
    hFull = R * APERTURE_RATIO;
    plate = buildPlate();
  }

  // The size the field should be rendered at: the aperture's bounding box in
  // device pixels. Everything outside it is stone, so rendering more is waste.
  function apertureSize() {
    return { w: Math.round(2 * R * dpr), h: Math.round(2 * hFull * dpr) };
  }

  function setState(next) {
    state = next;
    switch (next) {
      case EyeState.SEALED:
        p.openTarget = 0; p.openSpeed = 0.5; p.glowTarget = 0;
        break;
      case EyeState.STIRRING:
        p.openTarget = 1; p.openSpeed = 0.42; p.glowTarget = 0.75;
        break;
      case EyeState.OPEN:
        p.openTarget = 1; p.openSpeed = 1.4; p.glowTarget = 0.5;
        break;
      case EyeState.COMMUNING:
        p.openTarget = 1; p.openSpeed = 1.4; p.glowTarget = 0.55;
        break;
      case EyeState.DROWSING:
        p.openTarget = 0.26; p.openSpeed = 0.35; p.glowTarget = 0.16;
        break;
    }
  }

  // The stone is neutral; the theme reaches the plate only as spilled light.
  function setTheme(theme) {
    const c = theme.paletteRGB[3];
    glowTargetRGB = [c[0] * 255, c[1] * 255, c[2] * 255];
  }

  // Smoothed on the same principle as viz.js: features that move an edge
  // need a far longer time constant than features that move light.
  let bassSmooth = 0;
  function setAudio(f) { features = f; }
  function setFocus(v) { focusGlow = v; }

  const approach = (cur, target, dt, speed) =>
    cur + (target - cur) * (1 - Math.exp(-dt * speed * 3));

  // --- geometry ----------------------------------------------------------

  // A vesica: two arcs meeting at points. Symmetric top and bottom, which is
  // what keeps it from reading as an eyelid.
  function aperturePath(c, r, h) {
    c.beginPath();
    c.moveTo(-r, 0);
    c.quadraticCurveTo(0, -2 * h, r, 0);
    c.quadraticCurveTo(0, 2 * h, -r, 0);
    c.closePath();
  }

  // --- the baked stone plate ---------------------------------------------

  // Dark basalt. The trick that makes it read as rock rather than fog is
  // shading by the *slope* of the noise instead of its value — a cheap bump
  // map. Value alone gives you clouds no matter how you tune it.
  //
  // Built at reduced resolution (one fbm per pixel, gradients taken from
  // neighbours in the height buffer) and scaled up; the full-resolution grain
  // pass on top hides the interpolation.
  function buildPlate() {
    const cw = Math.max(1, canvas.width);
    const chh = Math.max(1, canvas.height);
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = chh;
    const g = out.getContext('2d');

    g.fillStyle = '#04050a';
    g.fillRect(0, 0, cw, chh);

    const LW = Math.max(64, Math.min(420, Math.round(cw / 2)));
    const LH = Math.max(64, Math.round((LW * chh) / cw));

    // Pass 1: height field.
    const hgt = new Float32Array(LW * LH);
    const freq = 7.5 / LW * (LW / 380); // features stay the same size at any LW
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        hgt[y * LW + x] = fbm2(x * freq, y * freq, 5);
      }
    }

    // Pass 2: shade.
    const low = document.createElement('canvas');
    low.width = LW;
    low.height = LH;
    const lg = low.getContext('2d');
    const img = lg.createImageData(LW, LH);
    const d = img.data;
    const unit = Math.min(cw, chh) * eyeRadius;
    const halfDiag = Math.hypot(cw, chh) / 2;

    for (let y = 0; y < LH; y++) {
      const ym = y > 0 ? y - 1 : y;
      const yp = y < LH - 1 ? y + 1 : y;
      for (let x = 0; x < LW; x++) {
        const i = y * LW + x;
        const xm = x > 0 ? x - 1 : x;
        const xp = x < LW - 1 ? x + 1 : x;
        const hh = hgt[i];
        const gx = hgt[y * LW + xp] - hgt[y * LW + xm];
        const gy = hgt[yp * LW + x] - hgt[ym * LW + x];

        // Lambert against the shared light direction.
        const lam = clamp01(0.5 - (gx * LIGHT_X + gy * LIGHT_Y) * 26);
        let v = (0.30 + 0.34 * hh) * (0.34 + 0.9 * lam);

        // Slow albedo drift, so the face reads as one weathered block rather
        // than a tiled rock texture.
        v *= 0.74 + 0.52 * fbm2(x * freq * 0.16 + 91, y * freq * 0.16 + 17, 2);

        // Fissures: ridged noise cuts dark veins through the face.
        const ridge = 1 - Math.abs(2 * hh - 1);
        v *= 1 - 0.6 * smoothstep(0.88, 0.995, ridge);

        // The plate is a wall, not an object: it fills the frame and falls
        // into darkness at the corners so the aperture is the only light.
        const px = ((x + 0.5) / LW) * cw - cw / 2;
        const py = ((y + 0.5) / LH) * chh - chh / 2;
        v *= 0.18 + 0.82 * smoothstep(1.0, 0.12, Math.hypot(px, py) / halfDiag);
        // Slight extra lift right around the socket, as if it catches more light.
        v *= 1 + 0.25 * smoothstep(3.2, 0.6, Math.hypot(px / unit, py / unit));

        const o = i * 4;
        d[o] = Math.min(255, v * 138);
        d[o + 1] = Math.min(255, v * 134);
        d[o + 2] = Math.min(255, v * 152); // a violet bias toward the accent
        d[o + 3] = 255;
      }
    }
    lg.putImageData(img, 0, 0);
    g.drawImage(low, 0, 0, cw, chh);

    // Carved features, in device pixels about the center.
    g.save();
    g.translate(cw / 2, chh / 2);
    carve(g, unit, unit * APERTURE_RATIO);
    g.restore();

    // Fine grain at full resolution, over everything, so the engraving sits in
    // the same material as the stone.
    const TILE = 96;
    const tile = document.createElement('canvas');
    tile.width = TILE;
    tile.height = TILE;
    const tg = tile.getContext('2d');
    const timg = tg.createImageData(TILE, TILE);
    for (let i = 0; i < timg.data.length; i += 4) {
      const v = 128 + (hash2(i, 7) - 0.5) * 150;
      timg.data[i] = timg.data[i + 1] = timg.data[i + 2] = v;
      timg.data[i + 3] = 255;
    }
    tg.putImageData(timg, 0, 0);
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.3;
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(0, 0, cw, chh);
    g.restore();

    return out;
  }

  // A line reads as cut or raised entirely from which side of it catches the
  // light. Groove: shadow on the line, highlight just below it. Ridge: the
  // reverse. Both must agree with LIGHT_Y or the surface stops reading as
  // stone and starts reading as a drawing of stone.
  function relief(g, drawPath, width, strength, raised) {
    const off = width * 0.75 * (raised ? -1 : 1);
    g.save();
    g.lineCap = 'round';
    g.lineWidth = width;
    g.translate(0, -off);
    g.strokeStyle = `rgba(0,0,0,${0.8 * strength})`;
    drawPath(g);
    g.stroke();
    g.translate(0, off * 2);
    g.strokeStyle = `rgba(206,201,224,${0.26 * strength})`;
    drawPath(g);
    g.stroke();
    g.restore();
  }

  const engrave = (g, path, w, s = 1) => relief(g, path, w, s, false);
  const emboss = (g, path, w, s = 1) => relief(g, path, w, s, true);

  function carve(g, r, h) {
    const lw = Math.max(1.3, r * 0.012);

    // The socket: a depression the aperture sits in. Shadow pooled toward the
    // top (light comes from above, so the upper wall is the one in shade) and
    // a lit lip along the bottom where the recess turns back to the surface.
    const rx = r * 1.62;
    const ry = h * 3.0;
    g.save();
    g.scale(1, ry / rx);
    const sock = g.createRadialGradient(0, -rx * 0.16, rx * 0.18, 0, 0, rx);
    sock.addColorStop(0, 'rgba(0,0,0,0.62)');
    sock.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    sock.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sock;
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();

    const lip = g.createLinearGradient(0, ry * 0.15, 0, ry * 1.0);
    lip.addColorStop(0, 'rgba(0,0,0,0)');
    lip.addColorStop(1, 'rgba(208,204,224,0.1)');
    g.save();
    g.fillStyle = lip;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Every carved line echoes the lens. Concentric circles around a lens-
    // shaped hole read as a targeting reticle no matter how faint they are;
    // concentric vesicas read as the shape radiating out through the stone.
    for (const [s, strength] of [[1.4, 0.7], [1.9, 0.45], [2.45, 0.28]]) {
      engrave(g, (c) => aperturePath(c, r * s, h * s), lw * 1.3, strength);
    }

    // No brow. A raised arc above the aperture pulls the composition upward
    // and crosses the outer vesica, which already does that work — and the
    // moment the face has a brow it starts being a face again.

    // Chisel ticks along the lens axis, reinforcing the one direction the
    // whole face agrees on.
    for (const side of [-1, 1]) {
      for (const s of [1.4, 1.9, 2.45]) {
        engrave(g, (c) => {
          c.beginPath();
          c.moveTo(side * r * s + side * lw * 2, 0);
          c.lineTo(side * r * s + side * lw * 6, 0);
        }, lw * 1.2, 0.55);
      }
    }
  }

  // --- frame -------------------------------------------------------------

  function frame(dt, t) {
    p.open = approach(p.open, p.openTarget, dt, p.openSpeed);

    let glowTarget = p.glowTarget;
    if (state === EyeState.COMMUNING && features) {
      glowTarget = 0.4 + features.rms * 0.55;
    }
    if (state === EyeState.SEALED) {
      // Sealed must feel patient, not broken (§2.1). A stone idol shouldn't
      // breathe, so the life-sign is a slow ember in the carved seam instead
      // of movement — barely there, on the same ~8s cycle.
      const amp = reducedMotion ? 0.4 : 1;
      glowTarget = 0.035 * amp * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 8));
    }
    if (focusGlow) glowTarget = Math.max(glowTarget, 0.35);
    p.glow = approach(p.glow, glowTarget, dt, 1);
    for (let i = 0; i < 3; i++) {
      glowRGB[i] = approach(glowRGB[i], glowTargetRGB[i], dt, 0.4);
    }

    bassSmooth += ((features ? features.bass : 0) - bassSmooth)
      * (1 - Math.exp(-dt / 0.35));

    // The aperture widens a little with the music: the idol's one movement.
    //
    // Two rules, both learned the hard way. It must never exceed 1: the field
    // is drawn at the *fixed* full aperture box, so an aperture that opens
    // past full reveals the edge of the plane behind it — a black band above
    // and below on loud notes, which is exactly what it looked like. And it
    // rides a smoothed bass, not the raw one: §5.5 gives bass a 40 ms attack
    // so hits land crisply, which on a moving edge is a flinch, not a breath.
    // Blink only where there is an open eye to blink: sealed has no lid to
    // move, stirring and drowsing are mid-ceremony and own the aperture for
    // the moment. Rearmed from zero each time it opens, so the first blink
    // after waking is a fresh interval rather than one that came due while
    // the stone was shut.
    const canBlink = state === EyeState.COMMUNING || state === EyeState.OPEN;
    if (canBlink && !reducedMotion) {
      if (nextBlink === 0) nextBlink = t + 3 + Math.random() * 5;
      else if (t >= nextBlink && !lid) {
        startLid(BLINK);
        nextBlink = t + 5.5 + Math.random() * 7.5;
      }
    } else if (!canBlink) {
      nextBlink = 0;
    }

    let openEff = ease(clamp01(p.open));
    if (state === EyeState.COMMUNING && features && !reducedMotion) {
      openEff *= 0.95 + bassSmooth * 0.05;
    }
    // Applied last, over the breath and the ceremony alike, so a closing lid
    // always wins: nothing should be able to hold the eye open through one.
    openEff *= lidAmount(dt);
    const h = hFull * openEff;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (plate) ctx.drawImage(plate, 0, 0, W, H);
    else { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H); }

    ctx.save();
    ctx.translate(W / 2, H / 2);

    if (layers.plate || layers.socket || layers['lid-upper']) {
      drawManifestEye(openEff, h);
    } else {
      drawAperture(h, openEff);
    }

    ctx.restore();
  }

  // The window. Everything visible inside it belongs to the visualization.
  function drawAperture(h, open) {
    const [gr, gg, gb] = glowRGB;

    const lw = Math.max(1.3, R * 0.013);

    if (open > 0.004) {
      // The shadow the recess casts onto the surrounding stone.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = R * 0.09;
      ctx.shadowOffsetY = R * 0.012;
      ctx.lineWidth = lw * 1.4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      aperturePath(ctx, R, h);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      aperturePath(ctx, R, h);
      ctx.clip();

      if (field && field.width > 0) {
        // Drawn at the full aperture box regardless of how open the eye is, so
        // the field is a fixed plane seen through a changing gap — not
        // something that stretches as the stone parts.
        ctx.drawImage(field, -R, -hFull, R * 2, hFull * 2);
      }

      // Inside the recess: the upper wall is in shadow, the lower one catches
      // the light. Same light direction as the relief, so it reads as depth.
      const wall = ctx.createLinearGradient(0, -h, 0, h);
      wall.addColorStop(0, 'rgba(0,0,0,0.72)');
      wall.addColorStop(0.42, 'rgba(0,0,0,0)');
      wall.addColorStop(0.88, 'rgba(0,0,0,0)');
      wall.addColorStop(1, 'rgba(222,216,236,0.09)');
      ctx.fillStyle = wall;
      ctx.fillRect(-R, -hFull, R * 2, hFull * 2);

      // And the points of the vesica fall away into the stone.
      const ends = ctx.createLinearGradient(-R, 0, R, 0);
      ends.addColorStop(0, 'rgba(0,0,0,0.8)');
      ends.addColorStop(0.16, 'rgba(0,0,0,0)');
      ends.addColorStop(0.84, 'rgba(0,0,0,0)');
      ends.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = ends;
      ctx.fillRect(-R, -hFull, R * 2, hFull * 2);
      ctx.restore();

      // The cut edge itself: dark all round, lit where the light strikes it.
      ctx.save();
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      aperturePath(ctx, R, h);
      ctx.stroke();
      ctx.lineWidth = lw * 0.9;
      ctx.strokeStyle = 'rgba(214,209,230,0.2)';
      ctx.beginPath();
      ctx.moveTo(-R, -lw * 0.5);
      ctx.quadraticCurveTo(0, -2 * h - lw * 0.5, R, -lw * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // The sealed seam: a cut where the stone will part. It has to be clearly
    // deliberate — a closed eye, not a crack — without becoming a feature in
    // its own right.
    if (open < 0.4) {
      const a = 1 - open / 0.4;
      const seam = (c) => {
        c.beginPath();
        c.moveTo(-R, 0);
        c.quadraticCurveTo(0, hFull * 0.18, R, 0);
      };
      engrave(ctx, seam, lw * 2.2, a);
    }

    // Light spilling out onto the stone. This is the only place the theme
    // colors anything outside the aperture.
    const spill = p.glow * (0.25 + open * 0.75);
    if (spill > 0.005) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 2.6);
      g.addColorStop(0, `rgba(${gr | 0},${gg | 0},${gb | 0},${0.3 * spill})`);
      g.addColorStop(0.45, `rgba(${gr | 0},${gg | 0},${gb | 0},${0.09 * spill})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 2.6, -R * 2.6, R * 5.2, R * 5.2);
      ctx.restore();
    }
  }

  // --- manifest (image layer) rendering ----------------------------------

  function drawManifestEye(open, h) {
    const box = R * 2.4; // layers are authored on a shared square canvas
    const draw = (name, dx = 0, dy = 0, alpha = 1, blend = 'source-over') => {
      const layer = layers[name];
      if (!layer) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blend;
      ctx.drawImage(layer.img, -box / 2 + dx, -box / 2 + dy, box, box);
      ctx.restore();
    };
    const travel = (name, fallback) => {
      const spec = layers[name] && layers[name].spec;
      return spec && typeof spec.travel === 'number' ? spec.travel : fallback;
    };

    draw('plate');

    // The aperture the art was cut for, if it declared one.
    const ap = layers.aperture || {};
    const ar = (typeof ap.w === 'number' ? ap.w : 0.42) * box;
    const ah = (typeof ap.h === 'number' ? ap.h : 0.22) * box * open;
    if (open > 0.004 && field && field.width > 0) {
      ctx.save();
      aperturePath(ctx, ar, ah);
      ctx.clip();
      ctx.drawImage(field, -ar, -ar * APERTURE_RATIO, ar * 2, ar * APERTURE_RATIO * 2);
      ctx.restore();
    }

    draw('socket');
    draw('lid-lower', 0, open * travel('lid-lower', 0.25) * box);
    draw('lid-upper', 0, -open * travel('lid-upper', 0.45) * box);
    draw('glow', 0, 0, p.glow, 'lighter');
    draw('frame');
  }

  // Close, hand the mood over while shut, and open again on the new one. The
  // caller passes the swap rather than doing it before or after, because the
  // whole value of the gesture is WHEN it happens: behind the lid.
  //
  // Falls back to swapping immediately if there is no eye to close — sealed,
  // or reduced motion, where a lid drop is unrequested movement and the plain
  // crossfade is the gentler option.
  function transition(swap) {
    const shut = state === EyeState.SEALED || state === EyeState.STIRRING;
    if (reducedMotion || shut) { if (swap) swap(); return; }
    startLid(MOOD_LID, swap);
  }

  return {
    resize, frame, setState, setTheme, setAudio, setFocus, apertureSize,
    transition,
  };
}
