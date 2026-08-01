// D10 — one visualization engine; themes are pure data.
//
// WebGL: a domain-warped noise field colored by the theme's 5-step palette.
// Audio features modulate it through the theme's mapping gains (computed on
// the CPU so the shader itself never changes per theme). Canvas2D fallback:
// drifting palette blobs for devices without WebGL.
//
// API: resize(), setTheme(theme), frame(t, dt, features, intensity)

import { MOTIFS, DEFAULT_PARAMS as THEME_DEFAULT_PARAMS } from './themes.js';

const MOTIF_NAMES = Object.keys(MOTIFS);
// Motif weights ride in a packed vec4 array rather than one uniform each.
// GLES2 only guarantees 16 fragment uniform vectors, and the library has
// outgrown one-scalar-per-motif; packing keeps the cost flat as it grows.
// The defines are generated from themes.js, so the names stay one source of
// truth: `W_rays` in the shader is `motifs.rays` in a theme.json, always.
const MOTIF_VEC4S = Math.ceil(MOTIF_NAMES.length / 4);
const MOTIF_DEFINES = MOTIF_NAMES
  .map((n, i) => `#define W_${n} u_mw[${i >> 2}].${'xyzw'[i & 3]}`)
  .join('\n');

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
uniform float u_sparkle; // treble drive for glint BRIGHTNESS
uniform float u_sparkleDensity; // how many glints exist at all — fixed per theme
uniform float u_pulse;   // decaying onset envelope -> expanding ripple
uniform float u_shift;   // centroid-driven gradient shift
uniform float u_open;    // overall intensity (drowse dims, commune blooms)
uniform sampler2D u_tex;
uniform float u_texAmt;
uniform float u_gloss;   // hardens the palette ramp and lets specular through
uniform float u_slant;   // how far falling things lean from vertical
uniform float u_base;    // how much the shared fog field contributes at all
uniform float u_drift;   // how fast that field evolves; 0 freezes it into rock
uniform float u_rms;     // smoothed loudness, for motifs that answer the room

// Motif weights (§5.4). Every theme sets all of them; most are 0. The branches
// below are uniform-coherent — every fragment takes the same path — so an
// unused motif costs nothing beyond the shader being longer.
uniform vec4 u_mw[${MOTIF_VEC4S}];
${MOTIF_DEFINES}

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
float mRays(vec2 uv, float t, float drive, float kick) {
  vec2 d = uv - vec2(-0.18, 0.95);
  float a = atan(d.x, d.y);
  // Sample the noise around a CIRCLE, not along the raw angle. atan wraps from
  // +pi to -pi directly below the source, and fbm of a wrapping coordinate
  // leaves a hard vertical seam there. Sunshine's own rays mostly disguised
  // it; forest's fainter ones did not, which is where it was spotted.
  vec2 ring = vec2(cos(a), sin(a)) * 2.6;
  // The fan dances: an onset kicks the sampling point sideways, so the beams
  // leap to a new arrangement and settle back as the kick decays. This is a
  // DISPLACEMENT by a decaying envelope, never a change of drift rate —
  // scaling time by a live feature lurches the whole pattern (§13).
  float s = fbm(ring + vec2(t * 0.09 + kick * 0.6, kick * 0.35));
  // Loudness sharpens the shafts rather than merely brightening them: quiet
  // is diffuse light, loud is defined beams — and a struck chord is a burst
  // of sun, not only a rearrangement.
  s = pow(clamp(s * 1.4, 0.0, 1.0), 3.4 - drive * 1.5);
  return s * smoothstep(2.1 + drive * 0.45, 0.1, length(d))
       * (0.66 + drive * 0.65 + kick * 0.55);
}

// Irregular vertical masses, leaning very slightly.
//
// The edges are hard on purpose. A soft ramp gives vertical striations in the
// fog — which is what forest's trunks looked like, and the owner's word for
// the whole theme was "green fog". A trunk is an object in front of the mist:
// it has a side, and the mist does not come through it.
float mColumns(vec2 uv, float t) {
  float n = fbm(vec2(uv.x * 2.4 + uv.y * 0.16 + t * 0.014, 4.7));
  return smoothstep(0.44, 0.57, n);
}

// Patches of light moving at their own rate, so they read as something passing
// in front of the field rather than as part of it.
float mDapple(vec2 uv, float t, float drive) {
  // Loudness shoulders the patches sideways and opens the threshold a hair —
  // a swell in the music reads as light shifting overhead. Displacement, not
  // speed: smoothed loudness cannot make a displaced pattern jump.
  return smoothstep(0.5 - drive * 0.08, 0.87,
                    fbm(uv * 3.4 + vec2(t * 0.11 + drive * 0.5, -t * 0.06)));
}

// Falling streaks. Weight sets how many lanes there are AND how often a lane
// actually drips — without that duty cycle every lane runs continuously, so a
// low weight gives thin rain rather than a slow seep.
//
// The streak lives inside one cycle of the phase, so the per-cycle coin flip
// can never chop a drip in half partway down.
float mDrips(vec2 uv, float t, float w, float slant, float drive, float kick, out float splash) {
  // Shear the lane coordinate rather than drifting the drops sideways: the
  // streaks themselves have to lean, or fast rain reads as vertical rain
  // sliding across the aperture.
  float lx = uv.x + uv.y * slant;

  // Sparse and dense are different weather, not the same weather in different
  // quantities. A cave's seep is a small droplet falling fast and alone; hard
  // rain is a long streak among many. Shape follows weight, or a low setting
  // is just thin rain — which is what it used to be, and read as slow constant
  // streams rather than as the occasional drip.
  // Both ends fall FAST. The first pass had dense drips slower than sparse
  // ones, on the theory that sheets drag — but rain does not drag, and at 0.4
  // the streaks crawled down the aperture and read as a meteor shower.
  float speed = mix(3.2, 2.9, w);
  float tail = mix(0.05, 0.34, w);   // and are short
  // Quadratic, so the sparse end is genuinely rare rather than merely thinner:
  // at w = 0.16 this is ~0.27 drips on screen at a time.
  // Loudness thickens it — the one thing the rain never did before was
  // answer the music at all.
  float duty = clamp((0.012 + 0.988 * w * w) * (0.75 + drive * 0.9), 0.0, 1.0);

  float lanes = 3.0 + 23.0 * w;
  float col = floor(lx * lanes);
  vec2 h = hash2(vec2(col, 1.7));
  float rate = (0.62 + h.x * 0.46) * speed;
  // +t, not -t: uv.y increases upward, so subtracting time makes drips rise.
  // Lane speeds vary, but not by much: a 4x spread had some drips crawling
  // while others raced, which reads as noise rather than weather.
  float phase = uv.y * 0.85 + t * rate + h.y;
  float falls = step(1.0 - duty, hash2(vec2(col, floor(phase))).x);
  float y = fract(phase);
  // Bright head low, tail trailing above it — a drop, not a bar.
  float streak = smoothstep(0.0, 0.02, y) * (1.0 - smoothstep(0.025, tail, y));
  // Narrow on its own terms rather than as a fraction of the lane, so a sparse
  // cave drip isn't a wide slab just because it has few lanes to sit in.
  float thin = smoothstep(mix(0.10, 0.16, w), 0.03, abs(fract(lx * lanes) - 0.5));

  // Where the drop arrives. Without this a drip falls out of the bottom of the
  // aperture and the rain has nowhere to land — the owner's note. Each lane
  // gets its own floor height so the landing line is a wet uneven surface
  // rather than a ruled edge; a straight one would be the banding problem
  // again (§5.4), and the ground of a cave is not level anyway.
  // Curved to follow the lens: the aperture is pointed at its ends, so a
  // flat floor low enough to feel like ground in the middle would sit below
  // the opening entirely at the edges. A floor that rises toward the tips
  // keeps every lane's splash visible AND reads as the bottom of the lens.
  float floorY = -0.25 + uv.x * uv.x * 0.22 - h.y * 0.05;
  // The phase AT the floor tells us which drop is landing and how long ago:
  // the streak's head is at fract(phase) == 0, so fract of the floor's phase
  // is the age of the last arrival, in the same units the fall is measured in.
  float fphase = floorY * 0.85 + t * rate + h.y;
  float age = fract(fphase);
  float landed = step(1.0 - duty, hash2(vec2(col, floor(fphase))).x);
  // Splashes are short: a drop's whole visit to the floor is a fraction of the
  // time it spent falling, or the aperture fills up with lingering rings.
  float life = 1.0 - smoothstep(0.0, 0.16, age);
  // A low wide crown rather than a circle — water goes sideways when it hits.
  vec2 rel = vec2((fract(lx * lanes) - 0.5) / lanes, (uv.y - floorY) * 2.6);
  float ring = age * (0.09 + kick * 0.05);
  float crown = smoothstep(0.028, 0.0, abs(length(rel) - ring));
  // The splash answers the room: loudness widens the crowns, and an onset
  // arrives as a burst of them — the rain playing along, not just falling.
  splash = landed * life * crown * step(floorY - 0.02, uv.y)
         * (0.5 + drive * 0.7 + kick * 0.9);

  // The streak itself stops at the floor instead of continuing through it.
  return falls * streak * thin * smoothstep(floorY - 0.03, floorY + 0.05, uv.y);
}

// Glints: scattered points of light that come and go with the music.
//
// One candidate per cell, sitting at a hashed position *inside* that cell, so
// they scatter. The first version thresholded value noise near its ceiling —
// and value noise peaks at its integer lattice, so every glint landed on a
// regular grid. It read as a rendering artifact because it was one.
//
// Each cell also twinkles on its own phase and period, so they do not all
// breathe together, which is the other half of looking natural.
float mGlint(vec2 p, float t, float density, float drive) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Each cell runs its own clock and re-rolls both its position and its
  // coin-flip on every tick. That is the difference between glinting and
  // snowing: density stays fixed, and what changes is WHERE the light is.
  // Driving density from the music instead just piled on more speckles.
  float tick = t * 0.85 + hash(i) * 10.0;
  float clk = floor(tick);
  vec2 o = hash2(i + clk * 1.37);
  float on = step(1.0 - density, hash(i * 1.31 + clk * 2.11));
  // A flash inside its slot, not a dot that sits there for the whole tick.
  float life = fract(tick);
  float env = smoothstep(0.0, 0.10, life) * (1.0 - smoothstep(0.18, 0.85, life));
  return on * env * smoothstep(0.10, 0.0, length(f - o)) * drive;
}

// Crystal shards: a flat value per cell, and a lit seam where cells meet. The
// seam comes from the gap between nearest and second-nearest, which is the
// cheap way to get voronoi edges in one pass.
float mFacets(vec2 p, float t, float strike, float drive, out float seam, out float flare) {
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
  // A strike lights whole shards. Each onset nominates a handful of cells —
  // which handful re-rolls on a slow clock, and treble widens it — and they
  // flare with the pulse and go dark again. The music illuminates the ice;
  // the ice never glitters on its own. This replaced ambient drift-and-
  // subtle-sparkle, which read as stagnant: quiet is now genuinely still,
  // and playing is lightning inside the shards.
  float pick = hash(cell * 4.7 + floor(t * 0.9) * 0.37);
  flare = step(1.0 - 0.09 - drive * 0.16, pick) * strike;
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

// A tunnel receding into the dark, with crystal faces on its walls.
//
// Voronoi read straight off the plane is what made cave read as stained glass,
// and that is not tunable — it is what the generator is (§5.4). The fix is not
// a different noise but a different SPACE: cells found in log-polar coordinates
// converge toward a vanishing point, so they read as depth rather than as
// tiling. Same lattice, one coordinate change.
//
// Angular wrap is handled by making the lattice periodic: there are exactly
// SIDES cells around, and cell indices are taken modulo that before hashing,
// so the cell at -pi and the cell at +pi are literally the same cell. This is
// the other way to solve what §14 calls the atan seam — rays sample around a
// circle because fbm has no cells to wrap; voronoi does, so it can wrap them.
//
// face: how much this fragment sits on a crystal plane facing the light —
// where cave's glints belong, instead of scattered anywhere (§14.2).
float mTunnel(vec2 uv, float t, out float face, out float joint) {
  const float SIDES = 11.0;
  // The vanishing point is off centre and low: a passage seen square-on is a
  // rosette, which is what the first pass looked like — the radial symmetry
  // was doing more work than the recession was.
  vec2 d = uv - vec2(-0.16, -0.07);
  float rad = max(length(d), 0.0025);
  float a = atan(d.y, d.x);
  // Around the tunnel, and into it. -log(rad) grows without bound toward the
  // centre, which is exactly the perspective compression we want: cells get
  // shorter and shorter as they recede.
  float dep = -log(rad) * 1.55 + t * 0.03;

  // Warp the lattice before cells are found, exactly as crags does — clean
  // cells are a mosaic whatever space they live in. The warp is sampled around
  // a circle so it stays continuous across the atan wrap, which is what lets
  // the periodic lattice below actually close up.
  vec2 ring = vec2(cos(a), sin(a)) * 1.7;
  float wa = fbm(ring + vec2(dep * 0.35, 0.0));
  float wd = fbm(ring + vec2(dep * 0.35, 11.0));
  vec2 p = vec2((a / 6.2831853 + 0.5) * SIDES + (wa - 0.5) * 2.4,
                dep + (wd - 0.5) * 1.7);

  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 cell = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 id = i + g;
      id.x = mod(id.x, SIDES);              // periodic around the tunnel
      vec2 r = g + hash2(id) - f;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; cell = id; }
      else if (dd < d2) { d2 = dd; }
    }
  }
  vec2 n = hash2(cell * 2.7) * 2.0 - 1.0;
  n /= max(length(n), 0.001);
  float lit = clamp(0.34 + 0.5 * dot(n, vec2(-0.45, 0.89)), 0.0, 1.0);
  joint = smoothstep(0.14, 0.0, d2 - d1);
  // The plane's own tilt decides whether it can catch a highlight, and the
  // cell centre is where the face is broadest — a crystal glints on its face,
  // not on the crack between two of them.
  face = smoothstep(0.55, 0.95, lit) * smoothstep(0.35, 0.02, d1);
  // Into the dark. Everything past the mouth of the tunnel falls away, which
  // is the depth cue doing the work a palette never could — and it is also
  // what stops the far end from aliasing, since the cells there are smaller
  // than a pixel.
  float depth = smoothstep(0.015, 0.5, rad);
  face *= depth;
  // A breath of light hanging in the passage, so the far end is depth rather
  // than a hole cut in the image.
  float haze = (1.0 - depth) * 0.12;
  return lit * depth + haze;
}

// A ridgeline: layered horizons, near ones darker than far ones.
//
// This is the shape mountain was missing. crags gives rock its surface but
// says nothing about the silhouette, and a mountain is mostly silhouette —
// "not shaped like mountains" was the note. Three layers, back to front, each
// a ridged 1D noise profile, painted over one another.
//
// crest: the band immediately below whichever line is frontmost here — where
// snow sits on a mountain, which is near the top and not on the valley floor.
float mRidge(vec2 uv, float t, float drive, out float crest, out float sky, out float plume) {
  float v = 0.0;
  float cover = 0.0;
  float hN = 0.0;
  crest = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Nearer ranges are wider (fewer, bigger peaks) and drift a hair faster,
    // which is parallax — the only reason to move a mountain at all.
    float x = uv.x * (1.5 - fi * 0.34) + fi * 9.7 + t * 0.006 * (1.0 + fi);
    // Two octaves, not fbm's five. A ridgeline profile made of fine noise is a
    // wavy line — which is the banding failure in a hat — and a mountain's
    // outline is a few big decisions with detail hung off them.
    float n = noise(vec2(x, fi * 11.0 + 3.3)) * 0.72
            + noise(vec2(x * 2.7 + 5.0, fi * 11.0)) * 0.28;
    float ridged = 1.0 - abs(2.0 * n - 1.0);            // peaks, not dunes
    ridged *= ridged;                                    // sharper summits
    // Heights live where the aperture actually is. The lens is wide and
    // short, so a range built for a square canvas puts its whole silhouette
    // off the top and leaves only the valley floor in shot.
    float h = 0.10 - fi * 0.13 + ridged * (0.26 + fi * 0.08);
    float below = smoothstep(h + 0.008, h - 0.008, uv.y);
    // Aerial perspective: distance washes a range out toward the sky, so the
    // far layer is the palest thing on screen and the near one is nearly black.
    float shade = 0.46 - fi * 0.17;
    v = mix(v, shade, below);
    crest = mix(crest, below * (1.0 - smoothstep(0.0, 0.07, h - uv.y)), below);
    cover = max(cover, below);
    if (i == 2) hN = h; // the near ridge, where spindrift is torn off
  }
  sky = 1.0 - cover;
  // Spindrift: snow blown off the near crest when the room is loud. Streaky,
  // wind-sheared, gated entirely by drive — silence leaves the summits
  // absolutely still. The landscape holding still is the point (owner's
  // note); it is the WEATHER that answers the music.
  float above = uv.y - hN;
  float band = smoothstep(0.0, 0.015, above) * (1.0 - smoothstep(0.03, 0.13, above));
  float gust = smoothstep(0.45, 0.8, noise(vec2(uv.x * 3.2 - t * 0.55, 7.7)))
             * smoothstep(0.4, 0.75, noise(vec2(uv.x * 11.0 - t * 1.1, 2.3)));
  plume = band * gust * drive;
  return v;
}

// Will-o-wisps: a few slow lights wandering between the trunks.
//
// Deliberately not glints. A glint is a surface catching light for an instant;
// a wisp is a small body that drifts, hangs, and fades, and it has to be rare
// enough to be an event. One candidate per cell, most of them switched off.
float mWisps(vec2 uv, float t, float w, float drive) {
  vec2 p = uv * 2.7;
  vec2 i = floor(p), f = fract(p);
  float v = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 id = i + g;
      vec2 h = hash2(id);
      // Most cells hold nothing. The first pass lit a third of them and they
      // ran together into exactly the green cloud this motif was added to fix.
      float on = step(1.0 - 0.2 * w, hash(id * 1.7));
      // Its own slow orbit, its own period. Wisps that breathe together read
      // as a light rig; the whole illusion is that each one is a separate body.
      vec2 c = g + 0.5 + 0.34 * vec2(sin(t * (0.21 + h.x * 0.19) + h.y * 6.28),
                                     cos(t * (0.17 + h.y * 0.21) + h.x * 6.28));
      // Each wisp breathes on its own period, and all of them swell with the
      // room — small lights leaning in when the music does.
      float breath = (0.3 + 0.7 * (0.5 + 0.5 * sin(t * (0.5 + h.x * 0.5) + h.y * 6.28)))
                   * (0.55 + drive * 0.9);
      // A soft body with a brighter core — a lantern, not a dot.
      float r = length(f - c);
      v += on * breath * (smoothstep(0.26, 0.0, r) * 0.3 + smoothstep(0.065, 0.0, r) * 1.2);
    }
  }
  return clamp(v, 0.0, 1.5);
}

// Surf. Caustics are what the water does to the light below it; this is the
// surface itself: crest lines that travel steadily in ONE direction — down
// the aperture, the way sets come on at a shore. uv.y increases upward, so
// +t in the phase approaches (the drips rule). The bend noise drifts far
// slower than the wave travels, so each swell passes THROUGH the shape
// rather than carrying it — which is the difference between a sea and the
// marbled fog this used to be.
float mFoam(vec2 uv, float t, float drive, out float crestLine) {
  float bend = fbm(vec2(uv.x * 1.7, uv.y * 0.8) + vec2(t * 0.03, 0.0)) * 1.5;
  float phase = uv.y * 8.0 + bend + t * 0.7;
  float swell = 0.5 + 0.5 * sin(phase);
  // Sharpened toward the crest, harder when the room is loud.
  swell = pow(swell, 1.7 + drive * 0.9);
  crestLine = smoothstep(0.62, 0.96, swell);
  // Foam is torn, never a painted line; loudness is the sea working harder,
  // so more of each crest carries white and the breaks reach further down.
  float tear = fbm(uv * vec2(6.5, 3.0) + vec2(t * 0.16, t * 0.45));
  return crestLine * smoothstep(0.62 - drive * 0.28, 0.88, tear)
       * (0.7 + drive * 0.65) + swell * 0.15;
}

// A night sky: fixed stars, a faint band of them, and the odd bright one.
//
// Stars do NOT move, which is what separates this from glints — a glint
// re-rolls its position on every tick and that is what makes it a glint. Here
// the position is hashed once per cell and stays put; only brightness moves,
// slowly, and the scintillation is small. A sky where the stars wander is a
// screensaver.
float mStars(vec2 uv, float t, float w, float strike) {
  vec2 p = uv * 26.0;
  vec2 i = floor(p), f = fract(p);
  vec2 o = hash2(i);
  float mag = hash(i * 1.93);
  // Most cells are empty; of the rest, most are faint. A uniform field of
  // equal dots is a texture, not a sky.
  float on = step(0.62, mag);
  float bright = pow(hash(i * 3.71), 3.0);
  float twinkle = 0.75 + 0.25 * sin(t * (1.1 + hash(i * 5.3) * 2.2) + mag * 24.0);
  float star = on * smoothstep(0.13, 0.0, length(f - o)) * (0.25 + bright * 1.5) * twinkle;
  // The band. Sampled off the same fbm the field uses so it drifts with
  // everything else, and kept faint — it is a suggestion of more stars, not
  // a cloud.
  float band = smoothstep(0.42, 0.72, fbm(uv * vec2(1.1, 3.4) + vec2(4.0, 0.0)));
  // A meteor on a strong onset. The streak TRAVELS as the pulse decays —
  // strike is 1 at the hit and eases to 0, so (1 - strike) is distance flown,
  // and the whole flight takes about a second for free. The path is hashed
  // from a slow clock, so no two fall from the same place. strike^2 keeps
  // soft onsets from spending meteors; they should be an event.
  vec2 sh = hash2(vec2(floor(t * 0.31), 9.1));
  vec2 head = vec2(sh.x * 1.4 - 0.7, 0.42 - sh.y * 0.2)
            + vec2(0.872, -0.49) * (1.0 - strike) * 0.9;
  vec2 rel = uv - head;
  float along = dot(rel, vec2(0.872, -0.49));
  float side = abs(dot(rel, vec2(0.49, 0.872)));
  float meteor = smoothstep(0.012, 0.0, side)
               * smoothstep(-0.24, -0.02, along) * smoothstep(0.02, 0.0, along)
               * strike * strike * 1.6;
  return (star + band * 0.42 + meteor) * w;
}

// Curtains of light in a night sky. The lower hem is a slow noise line and
// the folds are vertical striations; loudness lifts the whole veil and an
// onset ripples the hem. Deliberately made of the palette's MID steps when
// composited (see main), so the stars stay the brightest points — an aurora
// is a veil in front of the dark, not a light source outshining the sky.
float mAurora(vec2 uv, float t, float drive, float kick) {
  float x = uv.x * 1.3;
  float hem = 0.02 + fbm(vec2(x * 1.1 + t * 0.05, 3.7)) * 0.3 + kick * 0.05;
  float fold = fbm(vec2(x * 4.0 + t * 0.08, uv.y * 0.6));
  float body = smoothstep(hem - 0.02, hem + 0.16, uv.y)
             * (1.0 - smoothstep(0.3, 0.52, uv.y));
  return body * (0.25 + smoothstep(0.35, 0.75, fold) * 0.75) * (0.35 + drive * 1.1);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;

  // The shared field. Two knobs keep it from making every theme the same
  // weather: u_drift decides whether it flows or sits still, and u_base
  // decides whether it is the subject or merely a floor for the motifs.
  // Frozen and faint, the same fbm reads as rock rather than as fog.
  float bt = u_t * u_drift;
  vec2 q = vec2(fbm(p + vec2(0.0, bt * 0.35)),
                fbm(p + vec2(5.2, 1.3) - bt * 0.22));
  vec2 r = vec2(fbm(p + u_warp * q + vec2(1.7, 9.2) + bt * 0.15),
                fbm(p + u_warp * q + vec2(8.3, 2.8) - bt * 0.12));
  float f = fbm(p + u_warp * r);

  float g = clamp(f * 1.25 + u_shift - 0.1, 0.0, 1.0);
  // Toward a dark floor, not toward grey: a quiet base has to leave the
  // aperture dark so the motifs are the only things carrying light.
  g = mix(0.12, g, u_base);

  // Motifs add light, take away mass, or leave a hard highlight behind.
  float lift = 0.0;
  float mass = 0.0;
  float spec = 0.0;
  float snow = 0.0; // coverage, applied after the ramp rather than through it
  float rays = 0.0; // ditto: light has a colour of its own, not a value
  float foam = 0.0; // ditto again — foam is white, whatever the water is doing
  float wisp = 0.0;

  // Where this theme's glints are allowed to be (§14.2). A glint used to be a
  // global overlay multiplied by surface lightness, and the owner's three
  // separate notes about it were all one complaint: the sparkles are obviously
  // not related to the shapes. So a motif that has structure worth catching
  // light now nominates the places — seams for ice, crystal faces for cave,
  // skyward planes for snow — and 'own' says how much to trust it over the
  // old lightness approximation. A theme with no such motif is unchanged.
  float site = 0.0;
  float own = 0.0;

  if (W_rays > 0.0) {
    rays = mRays(uv, u_t, u_rms, u_pulse) * W_rays;
    // Less lift than before: the shafts no longer need to climb the ramp to
    // be visible, because they get their own colour below.
    lift += rays * 0.3;
    spec += rays * 0.25;
  }
  if (W_dapple > 0.0) lift += mDapple(uv, u_t, u_rms) * W_dapple * 0.55;
  if (W_caustics > 0.0) {
    float v = mCaustics(p, u_t);
    lift += v * W_caustics * 0.5;
    spec += v * W_caustics * 1.1;
  }
  if (W_foam > 0.0) {
    float crestLine;
    float v = mFoam(uv, u_t, u_rms, crestLine);
    foam = clamp(v * W_foam, 0.0, 1.0);
    lift += foam * 0.25;
    spec += foam * 0.8;
    // Foam is broken water catching the sky — the one place on a swell where
    // a highlight makes sense.
    site = max(site, crestLine);
    own = max(own, W_foam);
  }
  if (W_drips > 0.0) {
    // Weight controls density, not brightness: a cave's rare drip has to be
    // as bright as any of rain's, or the sparse case just disappears.
    float splash;
    float v = mDrips(uv, u_t, W_drips, u_slant, u_rms, u_pulse, splash);
    // Flat, not scaled by weight — the comment above always said the sparse
    // case has to be as bright as the dense one, but the gain said otherwise
    // and a lone droplet arrived dimmer than the rain it stood in for.
    lift += v * 0.5 + splash * 0.4;
    spec += v * 1.5 + splash * 1.8;
  }
  if (W_columns > 0.0) mass += mColumns(uv, u_t) * W_columns * 0.62;
  float skyward = 0.0; // where snow can lie, filled in by crags or ridge
  if (W_ridge > 0.0) {
    float crest, sky, plume;
    float v = mRidge(uv, u_t, clamp(u_rms * 1.7, 0.0, 1.0), crest, sky, plume);
    // The silhouette replaces the field rather than tinting it: past the
    // ridgeline you are looking at rock, and what is above it is sky.
    g = mix(g, v, W_ridge * 0.88);
    skyward = max(skyward, crest);
    // Spindrift is snow in the air, so it rides the same overlay snow does.
    snow = max(snow, plume * W_ridge * 0.85);
    spec += plume * W_ridge * 0.7;
  }
  if (W_crags > 0.0) {
    float upface, joint;
    // A hair of drift so the face isn't frozen; u_t is already speed-scaled.
    float lit = mCrags(p * 2.6 + vec2(u_t * 0.012, 0.0), upface, joint);
    // Textured by the base field, or every plane is a flat plate.
    lit = clamp(lit * (0.7 + 0.55 * f), 0.0, 1.0);
    // Under a ridgeline, crags are the rock's surface and must not repaint the
    // silhouette — a mountain that is pale where it should be black in front
    // has lost the only cue that says it is far away.
    float alone = mix(g, lit, W_crags * 0.55);              // crags as the subject
    float surface = mix(g, g * (0.5 + 0.85 * lit), W_crags); // crags as a texture on it
    g = mix(alone, surface, step(0.001, W_ridge));
    mass += joint * W_crags * 0.3;
    skyward = max(skyward, upface);
  }
  if (W_tunnel > 0.0) {
    float face, joint;
    float lit = mTunnel(uv, u_t, face, joint);
    lit = clamp(lit * (0.72 + 0.5 * f), 0.0, 1.0);
    g = mix(g, lit, W_tunnel * 0.8);
    mass += joint * W_tunnel * 0.22;
    site = max(site, face);
    own = max(own, W_tunnel);
  }
  if (W_snow > 0.0) {
    // Snow is the one motif that goes straight to the top of the ramp: it is
    // a different material lying on the rock, not the rock lit harder.
    //
    // Blended with noise rather than taken straight from the face, so the
    // snowline wanders across a crag instead of stopping dead at its edge —
    // per-cell coverage is what made this read as tiling.
    float base = (W_crags > 0.0 || W_ridge > 0.0) ? skyward : smoothstep(0.5, 0.82, f);
    // Drifting, not sitting still: the noise the coverage is blended with
    // creeps, so the snowline crawls across the rock over a long minute.
    // Gated by the face, then torn up by noise — NOT summed with it. Adding
    // the two let snow appear wherever the noise happened to be high, which
    // is how a snowline becomes an ice floe covering the whole aperture: the
    // shot showed white in the valleys and white in the sky. Multiplying says
    // snow can only lie where there is something for it to lie on.
    float s = smoothstep(0.3, 0.72, base)
            * smoothstep(0.40, 0.68, fbm(p * 4.6 + 5.0 + vec2(u_t * 0.02, -u_t * 0.013)));
    s *= smoothstep(-0.5, 0.32, uv.y); // a snowline
    snow = max(snow, s * W_snow);
    spec += s * W_snow * 0.4;
    site = max(site, s);
    own = max(own, W_snow * 0.8);
  }
  if (W_wisps > 0.0) wisp = mWisps(uv, u_t, W_wisps, u_rms) * W_wisps;
  if (W_stars > 0.0) {
    float s = mStars(uv, u_t, W_stars, u_pulse);
    lift += s * 0.42;
    spec += s * 1.2;
  }
  float aur = 0.0;
  if (W_aurora > 0.0) {
    aur = mAurora(uv, u_t, u_rms, u_pulse) * W_aurora;
    lift += aur * 0.3;
  }
  float iceFlash = 0.0;
  if (W_facets > 0.0) {
    float seam, flare;
    float shard = mFacets(p * 1.4, u_t, u_pulse, clamp(u_sparkle, 0.0, 1.0), seam, flare);
    g = mix(g, shard, W_facets * 0.4); // flatten the field into shards
    lift += seam * W_facets * 0.3;
    // The seams are where ice catches light, so that is where the music goes:
    // frozen geometry, moving highlights — and on an onset, whole shards.
    spec += seam * W_facets * (0.5 + u_rms * 1.8) + flare * W_facets * 1.6;
    iceFlash = flare * W_facets;
    site = max(site, max(seam, flare));
    own = max(own, W_facets);
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
  // Sunbeams carry their own colour instead of riding the value ramp. Routed
  // through g, a shaft's core climbed past the top step and came out white,
  // while the ramp's warm band stayed wherever the base fog happened to sit —
  // so the gold appeared as blotches BETWEEN the rays rather than in them.
  // Same reasoning as snow below: light of a particular colour is a material,
  // not a brightness.
  col = mix(col, mix(u_c3, u_c4, 0.3), clamp(rays * 1.15, 0.0, 1.0) * 0.9);

  // Snow lies over the palette, mixing the two brightest steps so it reads as
  // lit crust rather than blown-out highlight.
  col = mix(col, mix(u_c3, u_c4, 0.72), clamp(snow, 0.0, 1.0) * 0.88);
  // Foam is white water, not bright water — same rule as snow and rays.
  col = mix(col, mix(u_c3, u_c4, 0.8), clamp(foam, 0.0, 1.0) * 0.75);
  // A struck shard goes toward white in one step — lightning inside the ice,
  // not a warmer shade of the ramp.
  col = mix(col, mix(u_c3, u_c4, 0.85), clamp(iceFlash, 0.0, 1.0) * 0.85);
  // The aurora is a veil of the palette's mid colour hung in front of the
  // dark; taking c2/c3 rather than the white step keeps the stars on top.
  col = mix(col, mix(u_c2, u_c3, 0.65), clamp(aur, 0.0, 1.0) * 0.6);
  col += u_c4 * clamp(spec, 0.0, 1.0) * (0.16 + u_gloss * 0.5);
  // Wisps are their own small light sources, added rather than mixed: they sit
  // in front of the trunks and the mist, and nothing behind them dims them.
  col += mix(u_c3, u_c4, 0.5) * clamp(wisp, 0.0, 1.0) * 0.9;

  vec3 matter = texture2D(u_tex, q + r * 0.25).rgb;
  col = mix(col, col * matter * 1.7, u_texAmt);

  // Glints belong to the geometry (§14.2). Lightness-under-the-glint was only
  // ever an approximation of "is there something here to catch the light", and
  // it approximated badly: a lit patch of fog got sparkles, a crystal face got
  // them only by luck. Where a motif has nominated its own sites, those win —
  // and the density is raised there, because a site is a small part of the
  // aperture and the same count of glints spread over it is nothing. Themes
  // with no structural motif keep the old behaviour exactly.
  float lightness = smoothstep(0.12, 0.6, g);
  float where = mix(lightness, clamp(site, 0.0, 1.0) * smoothstep(0.06, 0.4, g), own);
  float density = u_sparkleDensity * (1.0 + own * 1.6);
  float glint = mGlint(uv * 30.0, u_t, density, 0.35 + u_sparkle * 1.4);
  col += glint * u_c4 * where * 0.9;

  float d = length(uv);
  float ring = (1.0 - u_pulse) * 1.15;
  col += u_c3 * u_pulse * 0.35 * smoothstep(0.12, 0.0, abs(d - ring));

  col *= 1.0 - 0.28 * d * d;   // slight vignette; the eye's socket supplies the rest
  col *= u_open;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither against banding

  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULT_PARAMS = { ...THEME_DEFAULT_PARAMS };
const MORPH_SECONDS = 2.2;
// Cap on the field's longest edge, so a large phone doesn't shade more pixels
// than the aperture can show.
const MAX_EDGE = 1024;

const lerp = (a, b, k) => a + (b - a) * k;

// --- feature smoothing for things that move -------------------------------
//
// Features that displace *geometry* need far heavier smoothing than features
// that change *light*. `bass` is extracted with a 40 ms attack (§5.5) so a hit
// lands crisply, which is right for a flash of brightness and wrong for the
// domain warp: with the default mapping the warp swings 0.77→1.76, and every
// one of those jumps moves the coordinate every sample is read from. The
// field stops flowing and starts twitching back and forth.
//
// So: smooth what moves, leave what glows alone. Brightness, sparkle and the
// onset pulse still react instantly — those are the audio being visible.
// Measured against a simulated piano bass (onsets every 200 ms, decaying, plus
// the per-frame noise the extractor actually produces), looking at the size of
// the frame-to-frame jump in u_warp — which is what the eye reads as a twitch:
//
//   tau     mean jump   max jump   resulting warp range
//   0       0.114       0.87       0.79–1.71     ← what shipped, visibly jerky
//   0.15    0.020       0.067      0.86–1.35
//   0.35    0.009       0.032      0.81–1.31     ← here
//   0.8     0.004       0.016      0.79–1.29
//
// The range barely moves past 0.15, so heavier filtering costs latency and
// nothing else — but the returns on smoothness flatten too. 0.35 puts the
// largest single-frame jump at ~2% of the warp's span, which is below noticing,
// and still settles in a third of a second. Turn it up if the field still
// twitches on your material; turn it down if it feels dead. Watch it move.
const GEOM_TAU = 0.35;  // domain warp, blob displacement
const SHIFT_TAU = 1.0;  // palette shift: a drift across a piece, not a twitch
const LIGHT_TAU = 0.18; // loudness reaching the motifs

// One per renderer instance; seeded to IDLE's values so the first frame after
// a theme load does not lurch in from zero.
function createMotionSmoother() {
  const v = { warp: 0, shift: 0.4, light: 0 };
  return (f, dt) => {
    v.warp += (f.bass - v.warp) * (1 - Math.exp(-dt / GEOM_TAU));
    v.shift += (f.centroid - v.shift) * (1 - Math.exp(-dt / SHIFT_TAU));
    // Faster than the geometry pair: this one shapes motifs that are allowed
    // to answer a phrase, just not a single frame's worth of extraction noise.
    v.light += (f.rms - v.light) * (1 - Math.exp(-dt / LIGHT_TAU));
    return v;
  };
}

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
  'u_gloss', 'u_slant', 'u_base', 'u_drift', 'u_rms', 'u_sparkleDensity',
  'u_mw[0]',
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
  // Padded to whole vec4s; the tail stays 0 and the shader never reads it.
  const motifBuf = new Float32Array(MOTIF_VEC4S * 4);
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

  const smoothMotion = createMotionSmoother();

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / MORPH_SECONDS);
    const th = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    if (lost) return; // morph still advances; drawing waits for the restore
    const m = th.mappings;
    const sm = smoothMotion(f, dt);

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
    gl.uniform1f(U.u_warp, th.params.warp * (0.7 + sm.warp * m.warpBass));
    gl.uniform1f(U.u_bright, 0.35 + f.rms * m.brightRms);
    gl.uniform1f(U.u_sparkle, th.params.sparkle * f.treble * m.sparkleTreble);
    gl.uniform1f(U.u_pulse, reducedMotion ? 0 : pulse);
    gl.uniform1f(U.u_shift, (sm.shift - 0.4) * m.shiftCentroid);
    gl.uniform1f(U.u_open, intensity);
    gl.uniform1f(U.u_texAmt, texAmt);
    gl.uniform1f(U.u_gloss, th.params.gloss || 0);
    gl.uniform1f(U.u_slant, th.params.slant || 0);
    gl.uniform1f(U.u_base, th.params.base);
    gl.uniform1f(U.u_drift, th.params.drift);
    // Loudness reaches the motifs smoothed, for the same reason the warp is:
    // these drive shapes, and a 40 ms attack on a shape is a flinch.
    gl.uniform1f(U.u_rms, sm.light);
    gl.uniform1f(U.u_sparkleDensity, th.params.sparkle * 0.22);
    for (let i = 0; i < MOTIF_NAMES.length; i++) {
      motifBuf[i] = th.motifs?.[MOTIF_NAMES[i]] || 0;
    }
    gl.uniform4fv(U['u_mw[0]'], motifBuf);

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

  const smoothMotion = createMotionSmoother();

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / MORPH_SECONDS);
    const th = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    const sm = smoothMotion(f, dt);
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
      const wob = 1 + 0.2 * Math.sin(t * 0.5 + b.phase) + sm.warp * 0.35;
      const x = W / 2 + Math.cos(b.angle) * b.dist * R * wob * 0.5;
      const y = H / 2 + Math.sin(b.angle) * b.dist * R * wob * 0.42;
      const rad = b.size * R * (0.8 + sm.warp * 0.5 + pulse * 0.3);
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
