// D10 — one visualization engine; themes are pure data.
//
// WebGL: a domain-warped noise field colored by the theme's 5-step palette.
// Audio features modulate it through the theme's mapping gains (computed on
// the CPU so the shader itself never changes per theme). Canvas2D fallback:
// drifting palette blobs for devices without WebGL.
//
// API: resize(), setTheme(theme), frame(t, dt, features, intensity)

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_t;       // pre-scaled time (speed applied CPU-side)
uniform vec3 u_c0, u_c1, u_c2, u_c3, u_c4;
uniform float u_scale;
uniform float u_warp;    // effective warp (theme warp + bass drive)
uniform float u_bright;  // rms-driven lift of the palette's top end
uniform float u_sparkle; // treble-driven glint density
uniform float u_pulse;   // decaying onset envelope -> expanding ripple
uniform float u_shift;   // centroid-driven gradient shift
uniform float u_open;    // overall intensity (drowse dims, commune blooms)
uniform sampler2D u_tex;
uniform float u_texAmt;
uniform float u_gloss;   // hardens the palette ramp and lets specular through
uniform float u_slant;   // how far falling things lean from vertical

// Motif weights (§5.4). Every theme sets all of them; most are 0. The branches
// below are uniform-coherent — every fragment takes the same path — so an
// unused motif costs nothing beyond the shader being longer.
uniform float u_mRays, u_mColumns, u_mDapple, u_mDrips;
uniform float u_mFacets, u_mCaustics, u_mCrags, u_mSnow;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

// --- motifs -------------------------------------------------------------
// Composition motifs (rays, columns, dapple, drips) work in aperture space so
// they stay anchored to the opening; texture motifs (facets, caustics, crags)
// work in scaled space so a theme's own scale still governs their grain.
// (No backticks in here — this whole block is a JS template literal.)
//
// DIRECTION. uv.y increases upward: gl_FragCoord has its origin bottom-left,
// and drawImage preserves that when the eye composites the field. So a feature
// sitting at constant "uv.y * k + t" moves DOWN as time passes, and one at
// "uv.y * k - t" moves UP. Both drips and rays shipped inverted once, and
// nothing about a screenshot says so. There is no automated guard for this:
// the composited output is dominated by the base field's own drift and by the
// socket shading, so no measurement of it isolates one motif's motion — two
// attempts at a smoke check were too flaky to keep. Reason about the sign
// here, and confirm any change by watching it move.

// Shafts from a source above and to the left, drifting slowly.
// uv.y increases upward, so the source's y is positive. Getting this backwards
// lights the aperture from below and nothing about the still image says so.
float mRays(vec2 uv, float t) {
  vec2 d = uv - vec2(-0.18, 0.95);
  float a = atan(d.x, d.y);
  float s = fbm(vec2(a * 4.5, t * 0.09));
  s = pow(clamp(s * 1.4, 0.0, 1.0), 3.0);
  return s * smoothstep(2.1, 0.1, length(d));
}

// Irregular vertical masses, leaning very slightly.
float mColumns(vec2 uv, float t) {
  return smoothstep(0.37, 0.67, fbm(vec2(uv.x * 2.4 + uv.y * 0.16 + t * 0.014, 4.7)));
}

// Patches of light moving at their own rate, so they read as something passing
// in front of the field rather than as part of it.
float mDapple(vec2 uv, float t) {
  return smoothstep(0.5, 0.87, fbm(uv * 3.4 + vec2(t * 0.11, -t * 0.06)));
}

// Falling streaks. Weight sets how many lanes there are AND how often a lane
// actually drips — without that duty cycle every lane runs continuously, so a
// low weight gives thin rain rather than a slow seep.
//
// The streak lives inside one cycle of the phase, so the per-cycle coin flip
// can never chop a drip in half partway down.
float mDrips(vec2 uv, float t, float w, float slant) {
  // Shear the lane coordinate rather than drifting the drops sideways: the
  // streaks themselves have to lean, or fast rain reads as vertical rain
  // sliding across the aperture.
  float lx = uv.x + uv.y * slant;

  float lanes = 4.0 + 22.0 * w;
  float col = floor(lx * lanes);
  vec2 h = hash2(vec2(col, 1.7));
  // +t, not -t: uv.y increases upward, so subtracting time makes drips rise.
  // Lane speeds vary, but not by much: a 4x spread had some drips crawling
  // while others raced, which reads as noise rather than weather.
  float phase = uv.y * 0.85 + t * (0.62 + h.x * 0.46) * 0.4 + h.y;
  float falls = step(1.0 - (0.14 + 0.86 * w), hash2(vec2(col, floor(phase))).x);
  float y = fract(phase);
  // Bright head low, tail trailing above it — a drop, not a bar.
  float streak = smoothstep(0.0, 0.025, y) * (1.0 - smoothstep(0.03, 0.34, y));
  // Narrow on its own terms rather than as a fraction of the lane, so a sparse
  // cave drip isn't a wide slab just because it has few lanes to sit in.
  float thin = smoothstep(0.16, 0.04, abs(fract(lx * lanes) - 0.5));
  return falls * streak * thin;
}

// Crystal shards: a flat value per cell, and a lit seam where cells meet. The
// seam comes from the gap between nearest and second-nearest, which is the
// cheap way to get voronoi edges in one pass.
float mFacets(vec2 p, float t, out float seam) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 cell = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      o = 0.5 + 0.42 * sin(t * 0.22 + 6.283 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; cell = i + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  seam = smoothstep(0.2, 0.0, d2 - d1);
  return hash(cell * 1.7);
}

// Undulating light web, as on a pool floor.
float mCaustics(vec2 p, float t) {
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    v += sin(p.x * (2.6 + fi * 1.9) + t * (0.7 + fi * 0.35)
             + sin(p.y * (2.1 + fi * 1.1) + t * 0.6) * 1.5);
  }
  return pow(clamp(v / 3.0 * 0.5 + 0.5, 0.0, 1.0), 3.5);
}

// Angular rock planes. Each cell gets a pseudo-normal from its own hash, so
// facets catch the light at different angles and the mass reads as crags —
// with a dark joint where two planes meet.
//
// This replaced a horizontal-strata motif: regular banding inside a glowing
// aperture reads as scanlines, no matter how much it is warped. If a layered
// look is ever wanted again, it has to arrive as something other than bands.
//
// upface is how far this plane tilts skyward, which is what snow needs.
float mCrags(vec2 p, out float upface, out float joint) {
  // Warping the lattice first is what separates rock from mosaic: clean
  // voronoi cells read as tiles or cracked glass, which is ice's job.
  p += vec2(fbm(p * 0.85), fbm(p * 0.85 + 31.0)) * 1.1 - 0.55;

  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 cell = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + hash2(i + g) - f;   // static offsets: rock does not drift
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; cell = i + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  vec2 n = hash2(cell * 3.1) * 2.0 - 1.0;
  n /= max(length(n), 0.001);
  upface = clamp(n.y, 0.0, 1.0);                   // uv.y increases upward
  joint = smoothstep(0.16, 0.0, d2 - d1);          // a soft crease, not a line
  return clamp(0.42 + 0.42 * dot(n, vec2(-0.5, 0.87)), 0.0, 1.0); // lit upper left
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;

  vec2 q = vec2(fbm(p + vec2(0.0, u_t * 0.35)),
                fbm(p + vec2(5.2, 1.3) - u_t * 0.22));
  vec2 r = vec2(fbm(p + u_warp * q + vec2(1.7, 9.2) + u_t * 0.15),
                fbm(p + u_warp * q + vec2(8.3, 2.8) - u_t * 0.12));
  float f = fbm(p + u_warp * r);

  float g = clamp(f * 1.25 + u_shift - 0.1, 0.0, 1.0);

  // Motifs add light, take away mass, or leave a hard highlight behind.
  float lift = 0.0;
  float mass = 0.0;
  float spec = 0.0;
  float snow = 0.0; // coverage, applied after the ramp rather than through it

  if (u_mRays > 0.0) {
    float v = mRays(uv, u_t);
    lift += v * u_mRays * 0.62;
    spec += v * u_mRays * 0.3;
  }
  if (u_mDapple > 0.0) lift += mDapple(uv, u_t) * u_mDapple * 0.55;
  if (u_mCaustics > 0.0) {
    float v = mCaustics(p, u_t);
    lift += v * u_mCaustics * 0.5;
    spec += v * u_mCaustics * 1.1;
  }
  if (u_mDrips > 0.0) {
    // Weight controls density, not brightness: a cave's rare drip has to be
    // as bright as any of rain's, or the sparse case just disappears.
    float v = mDrips(uv, u_t, u_mDrips, u_slant);
    float amp = mix(0.62, 1.0, u_mDrips);
    lift += v * amp * 0.5;
    spec += v * amp * 1.5;
  }
  if (u_mColumns > 0.0) mass += mColumns(uv, u_t) * u_mColumns * 0.42;
  float skyward = 0.0; // where snow can lie, filled in by crags
  if (u_mCrags > 0.0) {
    float upface, joint;
    // A hair of drift so the face isn't frozen; u_t is already speed-scaled.
    float lit = mCrags(p * 2.6 + vec2(u_t * 0.012, 0.0), upface, joint);
    // Textured by the base field, or every plane is a flat plate.
    lit = clamp(lit * (0.7 + 0.55 * f), 0.0, 1.0);
    g = mix(g, lit, u_mCrags * 0.55);
    mass += joint * u_mCrags * 0.3;
    skyward = upface;
  }
  if (u_mSnow > 0.0) {
    // Snow is the one motif that goes straight to the top of the ramp: it is
    // a different material lying on the rock, not the rock lit harder.
    //
    // Blended with noise rather than taken straight from the face, so the
    // snowline wanders across a crag instead of stopping dead at its edge —
    // per-cell coverage is what made this read as tiling.
    float base = u_mCrags > 0.0 ? skyward : smoothstep(0.5, 0.82, f);
    float s = smoothstep(0.47, 0.9, base * 0.62 + fbm(p * 2.2 + 5.0) * 0.62);
    s *= smoothstep(-0.5, 0.32, uv.y); // a snowline
    snow = max(snow, s * u_mSnow);
    spec += s * u_mSnow * 0.4;
  }
  if (u_mFacets > 0.0) {
    float seam;
    float shard = mFacets(p * 1.4, u_t, seam);
    g = mix(g, shard, u_mFacets * 0.4); // flatten the field into shards
    lift += seam * u_mFacets * 0.3;
    spec += seam * u_mFacets * 0.85;
  }

  // Mass can shape the field but must never swallow it — an all-mass theme
  // would just be a black aperture, which is what Sealed is for.
  g = clamp(g + lift - min(mass, 0.5), 0.0, 1.0);
  // Gloss hardens the transitions: the difference between weather and ice.
  g = mix(g, smoothstep(0.24, 0.76, g), u_gloss);

  vec3 col = mix(u_c0, u_c1, smoothstep(0.0, 0.35, g));
  col = mix(col, u_c2, smoothstep(0.25, 0.6, g));
  col = mix(col, u_c3, smoothstep(0.5, 0.85, g));
  col = mix(col, u_c4, smoothstep(0.78, 1.0, g) * u_bright);
  // Snow lies over the palette, mixing the two brightest steps so it reads as
  // lit crust rather than blown-out highlight.
  col = mix(col, mix(u_c3, u_c4, 0.72), clamp(snow, 0.0, 1.0) * 0.88);
  col += u_c4 * clamp(spec, 0.0, 1.0) * (0.16 + u_gloss * 0.5);

  vec3 matter = texture2D(u_tex, q + r * 0.25).rgb;
  col = mix(col, col * matter * 1.7, u_texAmt);

  float glint = step(0.995 - u_sparkle * 0.012, noise(uv * u_scale * 42.0 + u_t * 3.0));
  col += glint * u_c4 * u_sparkle * 0.5;

  float d = length(uv);
  float ring = (1.0 - u_pulse) * 1.15;
  col += u_c3 * u_pulse * 0.35 * smoothstep(0.12, 0.0, abs(d - ring));

  col *= 1.0 - 0.28 * d * d;   // slight vignette; the eye's socket supplies the rest
  col *= u_open;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither against banding

  gl_FragColor = vec4(col, 1.0);
}
`;

import { MOTIFS, DEFAULT_PARAMS as THEME_DEFAULT_PARAMS } from './themes.js';

const MOTIF_NAMES = Object.keys(MOTIFS);
// rays -> u_mRays. One source of truth for the names: themes.js.
const MOTIF_UNIFORMS = MOTIF_NAMES.map((n) => `u_m${n[0].toUpperCase()}${n.slice(1)}`);

const DEFAULT_PARAMS = { ...THEME_DEFAULT_PARAMS };
const MORPH_SECONDS = 2.2;
// Cap on the field's longest edge, so a large phone doesn't shade more pixels
// than the aperture can show.
const MAX_EDGE = 1024;

const lerp = (a, b, k) => a + (b - a) * k;

function mixTheme(a, b, k) {
  const out = { paletteRGB: [], params: {}, mappings: {}, motifs: {} };
  for (let i = 0; i < 5; i++) {
    out.paletteRGB[i] = [0, 1, 2].map((c) => lerp(a.paletteRGB[i][c], b.paletteRGB[i][c], k));
  }
  for (const key of Object.keys(b.params)) {
    out.params[key] = lerp(a.params[key] ?? b.params[key], b.params[key], k);
  }
  for (const key of Object.keys(b.mappings)) {
    out.mappings[key] = lerp(a.mappings[key] ?? b.mappings[key], b.mappings[key], k);
  }
  // Motifs default to 0 when absent, not to the target's value: a theme that
  // doesn't have rays should fade them out, not snap them on.
  for (const key of MOTIF_NAMES) {
    out.motifs[key] = lerp(a.motifs?.[key] || 0, b.motifs?.[key] || 0, k);
  }
  out.textureImage = k > 0.5 ? b.textureImage : a.textureImage;
  return out;
}

export function createViz(canvas, { reducedMotion = false } = {}) {
  try {
    return createGL(canvas, reducedMotion);
  } catch (err) {
    console.warn('viz: WebGL unavailable, using 2D fallback', err);
    return create2D(canvas, reducedMotion);
  }
}

function themeStub() {
  return {
    paletteRGB: [
      [0.03, 0.03, 0.06], [0.09, 0.1, 0.2], [0.27, 0.24, 0.42],
      [0.55, 0.5, 0.72], [0.91, 0.89, 0.95],
    ],
    params: { ...DEFAULT_PARAMS },
    mappings: { warpBass: 0.9, brightRms: 0.6, sparkleTreble: 1.0, pulseFlux: 1.0, shiftCentroid: 0.2 },
    motifs: { ...MOTIFS },
    textureImage: null,
  };
}

const UNIFORM_NAMES = [
  'u_res', 'u_t', 'u_c0', 'u_c1', 'u_c2', 'u_c3', 'u_c4', 'u_scale', 'u_warp',
  'u_bright', 'u_sparkle', 'u_pulse', 'u_shift', 'u_open', 'u_tex', 'u_texAmt',
  'u_gloss', 'u_slant', ...MOTIF_UNIFORMS,
];

function createGL(canvas, reducedMotion) {
  const gl =
    canvas.getContext('webgl', { antialias: false, alpha: false }) ||
    canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
  if (!gl) throw new Error('no WebGL context');

  // Animation state lives outside build() so a context loss costs nothing but
  // the GPU objects — the field keeps its position in time and its theme morph.
  let cur = themeStub();
  let tgt = cur;
  let morph = 1;
  let tAcc = Math.random() * 100;
  let pulse = 0;
  let texAmt = 0;

  let U = {};
  let tex = null;
  let uploadedImage = null;
  let lost = false;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
    }
    return sh;
  }

  // Everything GPU-side. Called once at startup and again after a context
  // restore — mobile browsers drop the context on backgrounded tabs, and
  // without this the field would stay black for the rest of the visit.
  function build() {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    U = {};
    for (const name of UNIFORM_NAMES) U[name] = gl.getUniformLocation(prog, name);

    // 1x1 white placeholder until a theme texture arrives.
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.uniform1i(U.u_tex, 0);
    uploadedImage = null; // force the theme texture to re-upload
  }

  build();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // required, or 'restored' never fires
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      build();
      resize(); // the viewport resets with the context
      lost = false;
    } catch (err) {
      console.warn('viz: context restore failed', err);
    }
  });

  function isPow2(n) { return (n & (n - 1)) === 0; }

  function maybeUploadTexture(img) {
    if (img === uploadedImage) return;
    uploadedImage = img;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (img) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      const pow2 = isPow2(img.width) && isPow2(img.height);
      // GLES2 REPEAT needs power-of-two; fall back to mirrored clamp otherwise.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, pow2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, pow2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255]));
    }
  }

  // The field is never displayed directly — the eye composites it into the
  // aperture — so the caller sizes it to the aperture box, not the screen.
  let lastW = 2;
  let lastH = 2;
  function setSize(w, h) {
    lastW = Math.max(2, w);
    lastH = Math.max(2, h);
    const cap = Math.min(1, MAX_EDGE / Math.max(lastW, lastH));
    canvas.width = Math.round(lastW * cap);
    canvas.height = Math.round(lastH * cap);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  const resize = () => setSize(lastW, lastH); // context restore resets the viewport

  function setTheme(theme) {
    cur = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    tgt = theme;
    morph = 0;
  }

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / MORPH_SECONDS);
    const th = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    if (lost) return; // morph still advances; drawing waits for the restore
    const m = th.mappings;

    const motion = reducedMotion ? 0.35 : 1;
    tAcc += dt * th.params.speed * motion * (0.6 + intensity * 0.6);

    if (f.flux * m.pulseFlux > 0.55) pulse = Math.max(pulse, Math.min(1, f.flux));
    pulse *= Math.exp(-dt * 1.6);

    maybeUploadTexture(th.textureImage || null);
    const texTarget = th.textureImage ? 0.55 : 0;
    texAmt += (texTarget - texAmt) * (1 - Math.exp(-dt / 1.5));

    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform1f(U.u_t, tAcc);
    const pal = th.paletteRGB;
    gl.uniform3f(U.u_c0, ...pal[0]);
    gl.uniform3f(U.u_c1, ...pal[1]);
    gl.uniform3f(U.u_c2, ...pal[2]);
    gl.uniform3f(U.u_c3, ...pal[3]);
    gl.uniform3f(U.u_c4, ...pal[4]);
    gl.uniform1f(U.u_scale, th.params.scale);
    gl.uniform1f(U.u_warp, th.params.warp * (0.7 + f.bass * m.warpBass));
    gl.uniform1f(U.u_bright, 0.35 + f.rms * m.brightRms);
    gl.uniform1f(U.u_sparkle, th.params.sparkle * f.treble * m.sparkleTreble);
    gl.uniform1f(U.u_pulse, reducedMotion ? 0 : pulse);
    gl.uniform1f(U.u_shift, (f.centroid - 0.4) * m.shiftCentroid);
    gl.uniform1f(U.u_open, intensity);
    gl.uniform1f(U.u_texAmt, texAmt);
    gl.uniform1f(U.u_gloss, th.params.gloss || 0);
    gl.uniform1f(U.u_slant, th.params.slant || 0);
    for (let i = 0; i < MOTIF_NAMES.length; i++) {
      gl.uniform1f(U[MOTIF_UNIFORMS[i]], th.motifs?.[MOTIF_NAMES[i]] || 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { resize, setSize, setTheme, frame, kind: 'webgl' };
}

// Canvas2D fallback: soft palette blobs drifting around the center.
function create2D(canvas, reducedMotion) {
  const ctx = canvas.getContext('2d');
  let cur = themeStub();
  let tgt = cur;
  let morph = 1;
  let pulse = 0;
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    blobs.push({
      angle: Math.random() * Math.PI * 2,
      dist: 0.15 + Math.random() * 0.55,
      speed: (0.02 + Math.random() * 0.06) * (Math.random() < 0.5 ? -1 : 1),
      size: 0.1 + Math.random() * 0.22,
      color: 1 + (i % 3),
      phase: Math.random() * Math.PI * 2,
    });
  }

  let lastW = 2;
  let lastH = 2;
  function setSize(w, h) {
    lastW = Math.max(2, w);
    lastH = Math.max(2, h);
    const cap = Math.min(1, MAX_EDGE / Math.max(lastW, lastH));
    canvas.width = Math.round(lastW * cap);
    canvas.height = Math.round(lastH * cap);
  }
  const resize = () => setSize(lastW, lastH);

  function setTheme(theme) {
    cur = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    tgt = theme;
    morph = 0;
  }

  const css = (rgb, a) =>
    `rgba(${rgb[0] * 255 | 0},${rgb[1] * 255 | 0},${rgb[2] * 255 | 0},${a})`;

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / MORPH_SECONDS);
    const th = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    const W = canvas.width;
    const H = canvas.height;
    const R = Math.min(W, H);
    const motion = reducedMotion ? 0.35 : 1;

    if (f.flux > 0.55) pulse = Math.max(pulse, f.flux);
    pulse *= Math.exp(-dt * 1.6);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css(th.paletteRGB[0], 1);
    ctx.fillRect(0, 0, W, H);
    if (intensity <= 0.01) return;

    ctx.globalCompositeOperation = 'lighter';
    for (const b of blobs) {
      b.angle += b.speed * dt * motion * (0.5 + f.rms);
      const wob = 1 + 0.2 * Math.sin(t * 0.5 + b.phase) + f.bass * 0.35;
      const x = W / 2 + Math.cos(b.angle) * b.dist * R * wob * 0.5;
      const y = H / 2 + Math.sin(b.angle) * b.dist * R * wob * 0.42;
      const rad = b.size * R * (0.8 + f.bass * 0.5 + pulse * 0.3);
      const col = th.paletteRGB[b.color];
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, css(col, 0.1 * intensity * (0.5 + f.rms)));
      g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  return { resize, setSize, setTheme, frame, kind: 'canvas2d' };
}
