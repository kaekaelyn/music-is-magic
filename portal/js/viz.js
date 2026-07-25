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

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
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

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;

  vec2 q = vec2(fbm(p + vec2(0.0, u_t * 0.35)),
                fbm(p + vec2(5.2, 1.3) - u_t * 0.22));
  vec2 r = vec2(fbm(p + u_warp * q + vec2(1.7, 9.2) + u_t * 0.15),
                fbm(p + u_warp * q + vec2(8.3, 2.8) - u_t * 0.12));
  float f = fbm(p + u_warp * r);

  float g = clamp(f * 1.25 + u_shift - 0.1, 0.0, 1.0);
  vec3 col = mix(u_c0, u_c1, smoothstep(0.0, 0.35, g));
  col = mix(col, u_c2, smoothstep(0.25, 0.6, g));
  col = mix(col, u_c3, smoothstep(0.5, 0.85, g));
  col = mix(col, u_c4, smoothstep(0.78, 1.0, g) * u_bright);

  vec3 matter = texture2D(u_tex, q + r * 0.25).rgb;
  col = mix(col, col * matter * 1.7, u_texAmt);

  float glint = step(0.995 - u_sparkle * 0.012, noise(uv * u_scale * 42.0 + u_t * 3.0));
  col += glint * u_c4 * u_sparkle * 0.5;

  float d = length(uv);
  float ring = (1.0 - u_pulse) * 1.15;
  col += u_c3 * u_pulse * 0.35 * smoothstep(0.12, 0.0, abs(d - ring));

  col *= 1.0 - 0.55 * d * d;   // vignette
  col *= u_open;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither against banding

  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULT_PARAMS = { scale: 1.5, speed: 0.3, warp: 1.1, sparkle: 0.5 };
const MORPH_SECONDS = 2.2;

const lerp = (a, b, k) => a + (b - a) * k;

function mixTheme(a, b, k) {
  const out = { paletteRGB: [], params: {}, mappings: {} };
  for (let i = 0; i < 5; i++) {
    out.paletteRGB[i] = [0, 1, 2].map((c) => lerp(a.paletteRGB[i][c], b.paletteRGB[i][c], k));
  }
  for (const key of Object.keys(b.params)) {
    out.params[key] = lerp(a.params[key] ?? b.params[key], b.params[key], k);
  }
  for (const key of Object.keys(b.mappings)) {
    out.mappings[key] = lerp(a.mappings[key] ?? b.mappings[key], b.mappings[key], k);
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
    textureImage: null,
  };
}

function createGL(canvas, reducedMotion) {
  const gl =
    canvas.getContext('webgl', { antialias: false, alpha: false }) ||
    canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
  if (!gl) throw new Error('no WebGL context');

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
    }
    return sh;
  }
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

  const U = {};
  for (const name of [
    'u_res', 'u_t', 'u_c0', 'u_c1', 'u_c2', 'u_c3', 'u_c4', 'u_scale', 'u_warp',
    'u_bright', 'u_sparkle', 'u_pulse', 'u_shift', 'u_open', 'u_tex', 'u_texAmt',
  ]) {
    U[name] = gl.getUniformLocation(prog, name);
  }

  // 1x1 white placeholder until a theme texture arrives.
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.uniform1i(U.u_tex, 0);
  let uploadedImage = null;
  let texAmt = 0;

  let cur = themeStub();
  let tgt = cur;
  let morph = 1;
  let tAcc = Math.random() * 100;
  let pulse = 0;

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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Cap the framebuffer so big phone screens keep a smooth framerate.
    const capScale = Math.min(1, 1600 / Math.max(canvas.clientWidth * dpr, canvas.clientHeight * dpr));
    canvas.width = Math.round(canvas.clientWidth * dpr * capScale);
    canvas.height = Math.round(canvas.clientHeight * dpr * capScale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function setTheme(theme) {
    cur = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    tgt = theme;
    morph = 0;
  }

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / MORPH_SECONDS);
    const th = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
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

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { resize, setTheme, frame, kind: 'webgl' };
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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }

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

  return { resize, setTheme, frame, kind: 'canvas2d' };
}
