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
uniform float u_sparkle; // treble drive for glint BRIGHTNESS
uniform float u_glint;   // ambient glint density. 0 on most themes: scattered
                         // white specks belong to ice and crystal, nowhere else
uniform float u_pulse;   // decaying onset envelope; each motif spends it its own way
uniform float u_shift;   // centroid-driven gradient shift
uniform float u_open;    // overall intensity (drowse dims, commune blooms)
uniform sampler2D u_tex;
uniform float u_texAmt;
uniform float u_gloss;   // hardens the palette ramp and lets specular through
uniform float u_slant;   // how far falling things lean from vertical
uniform float u_base;    // how much the shared fog field contributes at all
uniform float u_drift;   // how fast that field evolves; 0 freezes it into rock
uniform float u_rms;     // smoothed loudness, for motifs that answer the room
uniform float u_weather; // the SAME loudness on a tens-of-seconds follower,
                         // for motifs that answer a passage rather than a
                         // phrase: rainfall gathering, cloud closing over
uniform float u_flow;    // travel clock: CPU-integrated, ONLY ever advances,
                         // faster when loud. The lawful way to move with level.
uniform vec2 u_cur;      // direction the texture-space frame is carried by u_flow
uniform float u_centroid; // smoothed pitch/timbre brightness, 0..1
uniform float u_angular; // ridgeline sharpness: 1 = rock folded from linear
                         // noise, 0 = the same silhouette folded smooth, which
                         // is a dune. Sand and stone are one geometry.
uniform float u_canopy;  // how much foliage overhead breaks the shafts. 0 is
                         // open sky, and open sky is most themes' situation
uniform float u_leaf;    // what is falling: 0 blossom, 1 dead leaves. Shape,
                         // density and flight all key off it, so the passage
                         // from blooming to autumn morphs one into the other
uniform float u_bark;    // how far the trunks take a wood colour of their own
                         // instead of being silhouettes. Barren's alone

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
// The same job as hash/hash2 without the transcendental: bit-mixing done with
// fract and a dot product instead of sin. A sin-based hash2 costs two sines,
// and the crystal enumeration below wants a dozen of them per fragment, which
// is a measurable part of why cave cost 2.25x the cheapest mood.
//
// Deliberately NOT a drop-in replacement for hash2 everywhere: every voronoi
// lattice in the engine is seeded from it, so swapping it would re-roll the
// crag map, the ice shards, the wisps and the rain lanes at once — and two
// moods are finished. Used by mTunnel and mCrystals, which are cave's alone
// and are being reworked here anyway.
float ch1(vec2 p) {
  vec3 v = fract(vec3(p.xyx) * 0.1031);
  v += dot(v, v.yzx + 33.33);
  return fract((v.x + v.y) * v.z);
}
vec2 ch2(vec2 p) {
  vec3 v = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  v += dot(v, v.yzx + 33.33);
  return fract((v.xx + v.yz) * v.zy);
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
// The same lattice as noise() with LINEAR interpolation — no smoothstep on f.
// noise() rounds everything it touches: right for fog, water and cloud, and
// quietly wrong for every angular material in the set. Three separate owner
// complaints turned out to be this one primitive missing: curved lightning,
// lumpy ridgelines, warped-looking rock. lnoise is straight segments meeting
// at corners, so a profile folded from it is jagged by construction. Rock
// silhouettes and bolt paths sample this; weather keeps sampling noise().
float lnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
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
//
// MOTION AND THE MUSIC. Three lawful couplings, one forbidden:
//   1. An onset gesture displaces by the decaying pulse — a kick that lands
//      and settles. It returns to rest BY DESIGN, so it reads as a gesture.
//   2. Level-driven MOTION reads u_flow, the CPU-integrated travel clock: it
//      only ever advances, faster when the room is loud. Never offset a
//      position by a level directly — the offset retracts when the sound
//      dies, and the owner watched snow slide back and forth on exactly
//      that mistake. Motion earned by loudness must be kept.
//   3. Level-driven LIGHT (brightness, coverage, thresholds) may read u_rms
//      directly and freely.
//   Forbidden: multiplying t by a live feature inside the shader (§13) —
//   the phase already elapsed gets rescaled, and the pattern lurches.

// Shafts from a source above and to the left, drifting slowly.
// uv.y increases upward, so the source's y is positive. Getting this backwards
// lights the aperture from below and nothing about the still image says so.
float mRays(vec2 uv, float t, float flow, float drive, float kick, float pitch,
            float canopyAmt) {
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
  // Pitch leans the whole fan: the centroid arrives smoothed over ~a second,
  // so bright playing slowly slides the arrangement — a sway, not a jitter.
  float s = fbm(ring + vec2(t * 0.09 + kick * 0.6 + (pitch - 0.4) * 0.35, kick * 0.35));
  // Loudness sharpens the shafts rather than merely brightening them: quiet
  // is diffuse light, loud is defined beams — and a struck chord is a burst
  // of sun, not only a rearrangement.
  s = pow(clamp(s * 1.4, 0.0, 1.0), 3.4 - drive * 1.5);
  // Foliage overhead, where a theme has any. Beams under a canopy do not
  // arrive as a clean fan — leaves break them, and as you walk the gaps
  // slide, so the shafts open and close. Two scales sampled in the travel
  // frame, one lagging the other, so the pattern reorganizes rather than
  // sliding past as a rigid stencil.
  //
  // Gated by u_canopy, and OFF by default. Sunshine is open sky: breaking
  // its shafts this way put a forest above a theme that has no trees in it.
  // What occludes an open sky is its own weather, and that is applied to
  // the rays in main() from the clouds motif instead.
  if (canopyAmt > 0.0) {
    float canopy = smoothstep(0.28, 0.72, fbm(uv * 2.4 + vec2(flow * 0.8, 0.0)))
                 * (0.45 + 0.55 * smoothstep(0.3, 0.8, fbm(uv * 5.1 + vec2(flow * 0.5, 4.0))));
    s *= mix(1.0, 0.32 + 0.85 * canopy, canopyAmt);
  }
  return s * smoothstep(2.1 + drive * 0.45, 0.1, length(d))
       * (0.66 + drive * 0.65 + kick * 0.55);
}

// Irregular vertical masses, leaning very slightly — and travelling. Two
// stands at different distances pass at different rates as the flow clock
// advances; parallax is what makes it a walk among the trees rather than a
// texture scrolling by. The rays stay anchored to the sky, which is the
// other half of the depth cue. In a theme with travel 0 both stands hold
// still and this is simply columns, as before.
//
// The edges are hard on purpose. A soft ramp gives vertical striations in
// the fog — a trunk is an object in front of the mist: it has a side, and
// the mist does not come through it.
//
// A TRUNK IS A CYLINDER, and it took a monochrome mood to make that obvious.
// The mask alone is a flat cut-out, so a stand of them reads as a stencil laid
// over the mist; sampling the same field a little to one side and differencing
// says which way each edge faces — the sunward-rim trick the clouds already
// use — and one side of every trunk then takes the light while the other falls
// away. That is round, and round is what says wood.
//
// And each trunk gets its own colour, sampled at a much lower frequency than
// the mask so it is very nearly constant across any one trunk and different
// between neighbours. What the caller does with it is the caller's business;
// only a theme that sets params.bark spends it (see main), because a stand of
// individually coloured trunks is the whole ask for barren and would be noise
// in a wood that already has light in it.
float mColumns(vec2 uv, float t, float flow, out float tint, out float lit) {
  float xn = uv.x * 2.2 + uv.y * 0.14 + t * 0.014 + flow * 0.55;
  float vn = fbm(vec2(xn, 4.7));
  float near = smoothstep(0.47, 0.56, vn);
  float vl = fbm(vec2(xn - 0.16, 4.7));
  // Positive on the left flank (where the mass is still rising with x) and
  // negative on the right — the light in this engine comes from the upper left,
  // as mRays and mCrags both already assume.
  lit = clamp((vn - vl) * 5.5, -1.0, 1.0) * near;
  float far = smoothstep(0.44, 0.58,
      fbm(vec2(uv.x * 3.6 + uv.y * 0.1 + t * 0.01 + flow * 0.22, 9.3))) * 0.55;
  tint = fbm(vec2(xn * 0.40, 27.0));
  return max(near, far);
}

// Patches of light moving at their own rate, so they read as something passing
// in front of the field rather than as part of it.
float mDapple(vec2 uv, float t, float flow, float drive) {
  // The patches ride the travel clock, so loud playing drives them onward and
  // they NEVER slide back — the old level-displacement did, and the owner saw
  // the light rocking back and forth over the snowfield. Loudness still opens
  // the threshold: more light gets through when the room is working.
  return smoothstep(0.5 - drive * 0.08, 0.87,
                    fbm(uv * 3.4 + vec2(t * 0.11 + flow * 0.5, -t * 0.06)));
}

// Falling streaks. Weight sets how many lanes there are AND how often a lane
// actually drips — without that duty cycle every lane runs continuously, so a
// low weight gives thin rain rather than a slow seep.
//
// The streak lives inside one cycle of the phase, so the per-cycle coin flip
// can never chop a drip in half partway down.
float mDrips(vec2 uv, float t, float w, float slant, float drive, float weather, float kick, out float splash) {
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
  // Wider audio swing than the first pass: quiet rain thins right out and a
  // working room drives it toward sheets — the rainFALL is the response, not
  // merely the lighting on it.
  // HOW MUCH rain there is rides the weather clock, not the phrase clock. The
  // brightness of what falls still answers the room immediately (below), but
  // the rainfall itself gathers and clears over tens of seconds — drizzle to
  // storm and back, without changing its mind twice a bar.
  float duty = clamp((0.012 + 0.988 * w * w) * (0.35 + weather * 2.1), 0.0, 1.0);

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
  float floorY = -0.235 - uv.x * uv.x * 0.18 - h.y * 0.02;
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
float mFacets(vec2 p, float t, float strike, float drive, float pitch, out float seam, out float flare) {
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
  // Pitch chooses the family: the register being played picks WHICH shards
  // are eligible to flare, so runs high on the keyboard light a different
  // part of the ice than the left hand does.
  float pick = hash(cell * 4.7 + floor(t * 0.9) * 0.37 + floor(pitch * 2.999) * 2.13);
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
//
// SIDES is file-scope because the crystals are grown in this motif's frame and
// have to wrap the same way it does: a cluster sitting on the seam at angle 0
// must still reach the fragments just the other side of it.
// 11 -> 9: fewer, chunkier lobes around the ring. The reference bore is a
// handful of big rock shoulders, not a fine polygon.
const float TUNNEL_SIDES = 9.0;

float mTunnel(vec2 uv, float t, float strike, float drive, vec2 lightDir,
              out float face, out float joint, out float flare,
              out vec2 rockP, out float depthOut) {
  const float SIDES = TUNNEL_SIDES;
  // The vanishing point is off centre and low: a passage seen square-on is a
  // rosette, which is what the first pass looked like — the radial symmetry
  // was doing more work than the recession was.
  vec2 d = uv - vec2(-0.16, -0.07);
  float rad = max(length(d), 0.0025);
  float a = atan(d.y, d.x);
  // Around the tunnel, and into it. -log(rad) grows without bound toward the
  // centre, which is exactly the perspective compression we want: cells get
  // shorter and shorter as they recede.
  // 1.55 -> 1.15: less depth travelled per unit of radius, so fewer, larger
  // cells stand between the mouth and the dark — a wider, shorter bore with
  // room for bigger crystal structures (the owner's ask), instead of a long
  // thin throat.
  float dep = -log(rad) * 1.15 + t * 0.03;

  // Warp the lattice before cells are found, exactly as crags does — clean
  // cells are a mosaic whatever space they live in. The warp is sampled around
  // a circle so it stays continuous across the atan wrap, which is what lets
  // the periodic lattice below actually close up.
  vec2 ring = vec2(cos(a), sin(a)) * 1.7;
  float wa = fbm(ring + vec2(dep * 0.35, 0.0));
  float wd = fbm(ring + vec2(dep * 0.35, 11.0));
  // Amplitudes roughly halved (2.4/1.7 -> 1.3/0.95): at the old sizes a cell
  // could smear a third of the way around the passage, and the whole bore
  // read as melting. Irregular is the point; molten is not.
  vec2 p = vec2((a / 6.2831853 + 0.5) * SIDES + (wa - 0.5) * 1.3,
                dep + (wd - 0.5) * 0.95);
  // Handed out so the crystals can be grown in the ROCK's frame rather than
  // in a lattice of their own — carried by the passage, scaled by its
  // perspective. But the UNWARPED frame, deliberately. Quartz is the one
  // material in this cave that is straight, and drawing straight spears in
  // the warped lattice bent every one of them along the rock's own smear —
  // "warped or bent... not straight" was exactly this. The rock keeps its
  // warp (stone is allowed to slump); the crystals get the same angles and
  // depths without it, so they stand straight in a crooked passage. The
  // correlation that mattered — carried by the travel clock, small in the
  // deep, large at the mouth — lives in (angle, dep), not in the warp.
  rockP = vec2((a / 6.2831853 + 0.5) * SIDES, dep);

  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 cell = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 id = i + g;
      id.x = mod(id.x, SIDES);              // periodic around the tunnel
      vec2 r = g + ch2(id) - f;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; cell = id; }
      else if (dd < d2) { d2 = dd; }
    }
  }
  vec2 n = ch2(cell * 2.7) * 2.0 - 1.0;
  n /= max(length(n), 0.001);
  // THE SAME LIGHT THE CRYSTALS ANSWER TO. This was a fixed vector, so the
  // rock was lit from one direction while the quartz standing on it was lit
  // from another that swung with the playing — two lights in one cave, and
  // the eye reads that instantly as two images composited rather than one
  // place. It is most of why the cave looked "pasted together". One lamp.
  float lit = clamp(0.34 + 0.5 * dot(n, lightDir), 0.0, 1.0);
  // ROUNDED, not flat. A constant value per cell is a pane of glass; wet
  // rock has a shoulder that falls away toward every crack. Shading each
  // cell by its own distance field turns the panes into lumps of stone,
  // which is most of what separated this from a window.
  float bulge = 1.0 - smoothstep(0.0, 0.42, d1);
  lit *= 0.62 + 0.7 * bulge;
  joint = smoothstep(0.14, 0.0, d2 - d1);
  // The plane's own tilt decides whether it can catch a highlight, and the
  // cell centre is where the face is broadest — a crystal glints on its face,
  // not on the crack between two of them. The mask is generous on purpose:
  // the first cut passed so few faces that the cave lost its glitter
  // entirely, which the owner noticed at once.
  face = smoothstep(0.42, 0.8, lit) * smoothstep(0.4, 0.03, d1);
  // Crystal strikes: an onset lights a scatter of the broadest faces, the
  // way a lamp sweep catches clusters — and treble widens the scatter. This
  // is where the cave answers the music now: the ROCK no longer glows with
  // loudness (brightRms cut in the theme), because a cavern that brightens
  // when you play reads as a light bulb, and crystals that do read as magic.
  flare = step(0.86 - drive * 0.12, hash(cell * 3.9 + floor(t * 0.7) * 0.41))
        * strike * smoothstep(0.12, 0.4, face);
  // Into the dark. Everything past the mouth of the tunnel falls away, which
  // is the depth cue doing the work a palette never could — and it is also
  // what stops the far end from aliasing, since the cells there are smaller
  // than a pixel.
  float depth = smoothstep(0.015, 0.5, rad);
  depthOut = depth;
  // Faces dim into the passage but never to nothing — a cave that only
  // glitters at its mouth reads as a lit doorway, not a crystal cave.
  face *= mix(0.35, 1.0, depth);
  // A breath of light hanging in the passage, so the far end is depth rather
  // than a hole cut in the image.
  float haze = (1.0 - depth) * 0.12;
  return lit * depth + haze;
}

// Frost. Ice does not crystallize as a smooth advancing tide — it grows in
// needles along its lattice axes, and it goes off in patches: one region
// crazes over while another clears. The first version was a soft front
// sliding back and forth, which is why the owner said it looked like sea
// foam.
//
// Six-fold-ish anisotropy without any trig: sample noise stretched hard
// along three fixed axes 60 degrees apart and take the strongest. Stretched
// noise gives needles pointing along its long axis, and three needle
// directions read as the hexagonal habit of ice.
// One frond: a spine running along a, with barbs growing out across it.
//
// The barbs are MULTIPLIED into the spine, not maxed with it, and that is the
// whole difference between a fern and a crosshatch — a barb may only exist
// where a spine already does. Maxing three stretched ridges (what this was)
// gives streaks that cross each other, which is why the owner read the old
// frost as "water moving beneath the ice": long soft flowing filaments with
// no structure hanging off them.
//
// lnoise, not noise. Smooth interpolation rounds every filament into a blur;
// frost is sharp, and a dendrite is a series of straight runs meeting at
// angles. Same primitive the ridgelines and the lightning use.
// THE BARBS LEAVE THE SPINE. That is the whole change, and it is what the
// motif has been missing since it was written.
//
// The old frond multiplied a barb field INTO a spine field. A multiply can
// only ever modulate the value along the spine's OWN level set, so whatever
// came out was a line of varying brightness — never a shoot standing off it.
// Rendered, that is angular splinters, cracks in glass, and the owner has read
// it as exactly that twice. A barb has to have its own geometry, in its own
// coordinates, MAXED with the spine rather than multiplied into it.
//
// The value returned is a HEIGHT, not a mask, and the way that height is
// arranged is what makes the growth in mFrost read as growth rather than as a
// fade-in:
//
//   the spine is highest at its nucleation points and falls off along its
//   length; a barb is lower than the spine it leaves and falls off along ITS
//   length; a sub-serration is lower still.
//
// So a threshold descending across this field lights nuclei first, then runs
// ALONG the spines from them, then sprouts barbs, then extends those barbs out
// to their feathery ends. Every stage of that is a dendrite growing, and none
// of it is anything getting brighter. "It seems pre-drawn rather than growing
// and expanding and tracing paths and forking into feathery terminations" was
// a description of a field with no such arrangement in it.
//
// lnoise throughout, not noise: smooth interpolation rounds every filament
// into a blur, and frost is a series of straight runs meeting at angles. Same
// primitive the ridgelines and the lightning use.
float frond(vec2 q, vec2 a, vec2 b, float ph) {
  float u = dot(q, a);
  float v = dot(q, b);
  // Spines run along a, stacked across b. Which one are we near, and how far
  // off its centre — and the spine WANDERS, because a lattice of straight
  // parallel lines is a comb rather than frost.
  const float ROWS = 5.0;
  // The spacing is warped before the lattice is taken, so spines crowd in one
  // place and open out in another. An exactly even pitch is a comb however far
  // each line is made to wander, because the wander cannot change how many
  // there are.
  float vv = (v + (lnoise(vec2(u * 0.5 + ph, 41.0)) - 0.5) * 0.30) * ROWS + ph;
  float row = floor(vv);
  float wob = (lnoise(vec2(u * 2.3 + ph, row * 3.7)) - 0.5) * 0.85
            + (lnoise(vec2(u * 6.1 + ph, row * 9.3)) - 0.5) * 0.22;
  float w = (fract(vv) - 0.5) - wob;     // signed offset from the spine, in rows
  float aw = abs(w);

  // NUCLEATION, and it has to BITE. Slow along the spine, so a stretch of it
  // stands high and the next stretch does not: the highs are where the growth
  // front finds this spine first, the lows are where one fern ends and the next
  // begins. Its share of the spine's value is most of what decides whether this
  // reads as ferns or as a comb — weight it lightly and every spine is above
  // any useful threshold along its whole length, which is a continuous line
  // from one edge of the frame to the other. Two generations of it, so a spine
  // is broken at two scales rather than fading in and out at one.
  float nuc = lnoise(vec2(u * 0.62 + ph * 0.7, row * 11.3)) * 0.68
            + lnoise(vec2(u * 1.9 + ph, row * 5.1)) * 0.32;

  // The spine: a narrow ridge, highest at its centre, tallest where it nucleated.
  float spine = (1.0 - smoothstep(0.0, 0.085, aw)) * (0.55 + 0.45 * nuc);

  // The barbs. Regularly pitched along the spine and LEANING toward its tip
  // (the shear on the pitch coordinate, by how far out we are), tapering to a
  // point, and reaching most of the way to the neighbouring spine without ever
  // touching it — frost is mostly the dark between the filaments, and a barb
  // that bridges two spines makes a net instead of a fern.
  const float PITCH = 7.0;
  float bp = (u + aw / ROWS * 1.65) * PITCH + row * 1.7;
  float db = abs(fract(bp) - 0.5) / PITCH;   // along-spine distance to a barb
  // Each barb its own length. At one length for all of them the fern is a
  // comb turned sideways — evenly pitched ticks of equal size — and it is the
  // RAGGEDNESS of the outline a fern makes that the eye reads as growth.
  const float REACH = 0.34;                  // in rows
  float reachB = REACH * (0.50 + 0.95 * lnoise(vec2(floor(bp) * 0.37, row * 2.9)));
  float taper = max(0.0, 1.0 - aw / max(reachB, 0.02));
  // Serrated: a fine ridge running down each barb's length narrows and widens
  // it. Dendrites have dendrites, and at this size a serration is how one
  // reads — it is the third generation without a third generation's cost.
  float sub = 1.0 - abs(2.0 * lnoise(vec2(aw * 34.0, bp * 2.3)) - 1.0);
  float bw = (0.010 + 0.020 * taper) * (0.55 + 0.45 * sub);
  // taper raised to a power under 1 so a barb holds most of its value over most
  // of its length and then falls away quickly at the tip — a shoot with a
  // feathery end, rather than a wedge that is only ever half there.
  // The barb's value has to sit JUST under the spine's, not well under it.
  // Ranged too low, the growth front reaches the floor of its ramp while the
  // barbs are still only a sixth of the way out, and what draws is bare
  // spines — straight scratches on the glass, with the ferns never arriving.
  // Just under, and the front walks out along them as it falls.
  float barb = (1.0 - smoothstep(bw * 0.35, bw, db))
             * pow(taper, 0.55) * (0.50 + 0.40 * nuc);

  return max(spine, barb);
}

float mFrost(vec2 q, float grow) {
  // Six-fold habit: three spine directions 60 degrees apart, each with its own
  // perpendicular for its barbs. Ice grows on its lattice, and three axes is
  // what makes a hexagonal one.
  const vec2 a0 = vec2(1.0, 0.0);
  const vec2 b0 = vec2(0.0, 1.0);
  const vec2 a1 = vec2(0.5, 0.866);
  const vec2 b1 = vec2(-0.866, 0.5);
  const vec2 a2 = vec2(-0.5, 0.866);
  const vec2 b2 = vec2(-0.866, -0.5);

  // ONE HABIT AT A TIME, and this is the difference between frost and a
  // trellis. Maxing all three axes everywhere draws all three lattices over
  // each other, and three sets of parallel lines at sixty degrees is a
  // TRIANGULAR NET — which is exactly what it rendered as, an even mesh across
  // the whole pane with no ferns in it anywhere.
  //
  // Real frost nucleates: a crystal starts somewhere, picks an orientation, and
  // grows out in that habit until it runs into the next one, which started
  // somewhere else and chose differently. So a slow field decides which axis
  // owns each region, and the borders between regions are where one fern's
  // barbs run into another's — which is the most characteristic thing in the
  // references and cannot happen while every axis is everywhere.
  float sel = clamp((fbm(q * 0.30 + 3.0) - 0.28) * 2.3, 0.0, 1.0) * 3.0;
  float k0 = smoothstep(1.05, 0.35, abs(sel - 0.5));
  float k1 = smoothstep(1.05, 0.35, abs(sel - 1.5));
  float k2 = smoothstep(1.05, 0.35, abs(sel - 2.5));

  float v = 0.0;
  v = max(v, frond(q, a0, b0, 0.0) * k0);
  v = max(v, frond(q, a1, b1, 4.0) * k1);
  v = max(v, frond(q, a2, b2, 9.0) * k2);

  // GROWTH, and it has to be growth rather than a cycle.
  //
  // This was reach = 0.5 + 0.5 * sin(grow * 0.55 + patch * 7.0). A sine: the
  // coverage rose and fell forever, so the pane crazed over and then UNcrazed,
  // which is "it's just blotchy, and the blotches sort of thicken and shrink"
  // described precisely. The thaw was deliberate once — the theme note called
  // it "playing frosts the glass; silence lets it clear" — and it is the thing
  // the owner has now ruled out. A crystal that ungrows is not a crystal, and
  // no amount of tuning the amplitude of a sine makes one.
  //
  // It also meant the mood never began plain: at grow = 0 the sine sits at
  // whatever phase the patch hash hands it, so the eye opened onto frost that
  // was already half grown and, half the time, receding.
  //
  // Ice accretes. The front only ever advances, and it advances on u_flow,
  // which is monotonic by construction and already restarts on each visit to a
  // mood (setTheme). "Start plain every time" therefore costs nothing once the
  // sine is gone, and "spread very slowly" is one rate.
  //
  // Saturating rather than linear, so a long session settles into a fully
  // crazed pane instead of running past it into flat white.
  //
  // AND FAST ENOUGH TO SEE. At 0.08 this was a time constant of roughly a
  // hundred seconds of loud playing, against a threshold that starts ABOVE the
  // field's ceiling — so for the first minute the mood was a bare pane, and the
  // owner's "I barely see the frost at any volume or register" is the arithmetic
  // rather than an impression. It also meant no screenshot ever showed the
  // motif: the render harness runs a mood for six seconds. Frost is still the
  // slowest thing in the set; it now arrives inside a piece rather than inside
  // a session.
  float reach = 1.0 - exp(-grow * 0.5);
  float patch = fbm(q * 0.9 + 5.0);
  float along = fbm(q * 0.5 + 17.0);
  // The threshold falls from ABOVE the frond field's ceiling — so at reach 0
  // there is genuinely nothing, not a faint everywhere — down toward its
  // floor. Falling across a static frond field, the level set expands out of
  // the spines and runs ALONG them as it goes, which is a dendrite extending.
  // A front that is one number applied everywhere can only fade in.
  //
  // The ends of the ramp are set by what the frond field now CONTAINS: spines
  // top out around 1.06 and barbs around 0.70 falling to nothing at their tips,
  // so a front descending from just above the spines' ceiling to well under the
  // barbs' floor walks the whole growth story and stops short of flooding. Taken
  // further down the level set stops being filaments and merges into solid white
  // areas with frost-shaped edges, which against the references — dense with
  // fine, fully separate ferns — reads as spilt paint.
  float front = mix(1.05, 0.44, reach * (0.55 + 0.45 * patch));
  // Tips reach ahead of the bulk. The references are a dense granular rime
  // with individual ferns standing out into clear glass in front of it, and
  // that is a looser threshold where the spine field leads the patch field.
  front -= 0.10 * (patch - along);
  // NO STRIKE TERM HERE, and its absence is the second half of the growth fix.
  // It used to be front -= strike * 0.07: the front lurched outward on an onset
  // and then CAME BACK as the envelope decayed, so the pane crazed a little and
  // uncrazed a little, over and over. "It just sort of swells a little and
  // thins" is that line, described exactly — and it is the same class of fault
  // as an ember sliding back down, one level below.
  //
  // An onset still advances the frost; it does it by advancing the growth CLOCK
  // instead (see viz.js's flowAcc, which now takes a pulse term). A clock cannot
  // run backwards, so the crackle is kept.
  // A tight threshold, deliberately: frost has hard edges, and a soft one
  // is what made this read as foam.
  return smoothstep(front, front + 0.045, v);
}

// Quartz. Big thick spears in a few clusters, and — the point of the whole
// motif — nearly invisible until something lights them.
//
// The model is not "draw crystals, modulate their brightness". It is a dark
// cave containing a lot of quartz, plus a light that moves: each face carries
// a normal, the light direction swings with pitch and travels while you play,
// and a face shows when it is turned toward the light. A selection clock
// nominates the clusters, one at a time, so the cave keeps revealing different
// seams as the playing goes on.
//
// ENUMERATED, NOT A LATTICE — and that is the whole performance story of this
// mood. This was a 3x3 neighbourhood search with up to four spears per cell:
// 36 spear evaluations per fragment, and 81 sin-based hashes between them, to
// draw at most three lit clusters. A lattice is the wrong structure for "a few
// big objects" — it makes every fragment pay for every cluster that COULD be
// near it, and cave paid nine cells' worth to show one. Now there are exactly
// CRYSTAL_CLUSTERS clusters, at hashed positions, with a bounding test that
// rejects the whole cluster BEFORE its spears. Twelve evaluations at the
// absolute worst, none at all for most fragments, and no sin anywhere.
//
// They are still grown in the ROCK's frame (rockP, handed out by mTunnel), so
// they are carried by the passage exactly as the stone is and inherit its
// perspective for free: a cluster deep in the tunnel comes out small, one at
// the mouth comes out large. Placing them in a frame of their own was the
// mistake that made them read as shapes stuck on the wall.
//
// Structure is quartz, not a spike: parallel sides down the body, a blunt
// pyramidal termination at the tip, and facet bands running the length, each
// catching the light at its own angle.
// 4 -> 5 with the wider bore: more wall in shot wants more structures. Worst
// case is CLUSTERS x SPEARS = 15 spear evaluations against 36 before the
// enumeration rewrite — still well inside the budget that rewrite bought.
//
// SELECTED BY DEPTH, NOT BY BRIGHTNESS. This accumulated with if (v > best) —
// a per-fragment max on the lit VALUE, with nothing anywhere that knew which
// spear was in front. Where two spears crossed, the boundary between them
// therefore followed the lighting: whichever happened to be catching the lamp
// won those pixels, and the join wandered as the lamp swung. There is no
// silhouette edge of a near spear against a far one in that, so the eye reads
// flat decals stacked in a plane — "the overlap of the crystals sometimes
// causes them to look detached from the wall and from each other", precisely.
//
// The seat already knows its depth into the passage, so the fix is to keep it:
// each spear carries its cluster's depth plus its own small offset, the nearest
// covering spear wins the fragment outright, and a near spear now CUTS the one
// behind it. That cut is the silhouette, and a silhouette is the only thing
// that makes two overlapping objects read as two objects at two distances.
//
// The druzy bed sits at the rock, so it is deliberately given a depth behind
// every spear — the crust is what the crystals stand on, not something that can
// occlude them.
#define CRYSTAL_CLUSTERS 5
#define CRYSTAL_SPEARS 3
float mCrystals(vec2 uv, vec2 vp, float t, float selClock, vec2 lightDir,
                float strike, float drive, float pitch,
                out float tint, out float faceGlow, out float pool) {
  tint = 0.5;
  faceGlow = 0.0;
  pool = 0.0;
  float best = 0.0;
  float bestZ = 1e6;   // depth of the nearest spear covering this fragment
  float bedBest = 0.0; // the druzy crust, which lives ON the rock behind them

  // SCREEN SPACE, seated by the rock frame. The spears used to be drawn in
  // the tunnel's own (angle, depth) coordinates, which is a polar mapping —
  // and a straight line in polar coordinates is a SPIRAL once it comes back
  // to the screen. That is the whole of "warped or bent... not straight",
  // and no amount of unwarping the lattice could fix it, because the bend was
  // the coordinate system rather than the noise in it.
  //
  // So each cluster hashes a seat — an angle around the passage and a depth
  // into it — that seat is converted to a screen position ONCE, and every
  // spear is then drawn straight in uv. The correlation with the architecture
  // survives, because the seat still comes from the passage and its size
  // still comes from the passage's perspective: deep clusters are small and
  // near the vanishing point, mouth clusters are large and out at the rim.
  for (int j = 0; j < CRYSTAL_CLUSTERS; j++) {
    float fj = float(j);
    // Each slot holds one cluster for a turn of the selection clock and then
    // hands over: arrive, hold, fade. The slots are staggered evenly, and the
    // hold is wider than the gap between them, so SOME cluster is always at
    // full nomination.
    //
    // That guarantee is the fix for "I can't see any crystals". The reveal
    // used to need two independent things to happen at once — a cluster
    // nominated by a hash AND a face falling inside a pow(lam, 9.0) lobe —
    // and when neither is certain, neither happens. What the playing changes
    // now is WHICH seam is lit, never whether one is.
    float ph = selClock + fj * (1.0 / float(CRYSTAL_CLUSTERS));
    float e = floor(ph);
    float u = fract(ph);
    float env = smoothstep(0.0, 0.16, u) * (1.0 - smoothstep(0.58, 1.0, u));
    if (env < 0.004) continue;

    vec2 hc = ch2(vec2(fj * 17.3, e));
    // A seat on the wall: all the way around the passage, and a depth into it
    // biased toward the mouth (hc.y squared) because a cluster forty feet down
    // is a few pixels of nothing.
    float ang = hc.x * 6.2831853;
    // Biased hard toward the mouth. At 0.5 + hc.y^2 * 2.4 most seats landed
    // deep enough that perspective shrank them to slivers, and a cave whose
    // crystals are all far away has nothing to show.
    float dep = 0.32 + hc.y * hc.y * 1.45;
    // The passage's own perspective, matching mTunnel's -log(rad) * 1.15.
    // This is both where the cluster sits and how big it is: one number, so
    // the two can never disagree and leave a crystal floating.
    float rad = exp(-dep / 1.15);
    vec2 seat = vp + vec2(cos(ang), sin(ang)) * rad;
    float persp = clamp(rad, 0.06, 1.0);

    vec2 d0 = uv - seat;
    // A pool of light AROUND the cluster, not only on it. The owner's note:
    // the crystals read as "appearing and disappearing" rather than being
    // illuminated, because nothing else in the frame acknowledged the light
    // that was supposedly revealing them. A lamp lights the wall it is
    // pointed at. Computed BEFORE the bounding test, or the halo would be
    // clipped to the crystal's own extent and defeat the point.
    // Tight enough to be a lamp. At 2.2 the falloff was wider than the whole
    // aperture, so instead of a pool of light on a wall it was a milky wash
    // over everything — which loses the darkness the pool is supposed to be
    // carved out of.
    float pr = dot(d0, d0) / (persp * persp * 0.85);
    pool = max(pool, exp(-pr) * env);
    // The early-out that pays for the enumeration. Reject the cluster here,
    // not inside the spear loop: a cluster covers a contiguous patch of
    // screen, so neighbouring fragments agree about this test and the whole
    // warp skips it together.
    if (dot(d0, d0) > persp * persp * 0.9) continue;

    float qtint = ch1(vec2(e, fj * 3.7));   // one mineral per cluster, not per spear

    // A BED at the contact: fine crusty growth where the cluster meets the
    // rock. Real quartz nucleates out of a druzy mat, and the spears rise from
    // that; without it each spear simply stops at a point on bare stone, which
    // is the other half of "pasted together". Broken by the stone's own noise
    // so it is a crust following the surface, not a disc under the crystals.
    // fbm at a lower frequency, softly thresholded. A single octave of value
    // noise at 44 units aliased into visible squares — the lattice was coarser
    // than the feature it was meant to make, so the crust read as compression
    // blocks sitting on the rock.
    float bedR = dot(d0, d0) / (persp * persp * 0.14);
    float bed = exp(-bedR) * smoothstep(0.34, 0.86, fbm(uv * 16.0 + fj * 7.0));
    // Kept OUT of the depth test entirely, rather than given a depth behind the
    // spears. The bed is a soft exponential halo, so it is faintly non-zero
    // across the whole cluster — put it in the test and a near cluster's
    // invisible crust would claim fragments and black out a bright spear
    // standing behind it. It is a texture on the wall: it shows wherever no
    // spear covers, and nothing more.
    bedBest = max(bedBest, bed * env * (0.20 + drive * 0.4));

    for (int k = 0; k < CRYSTAL_SPEARS; k++) {
      float fk = float(k);
      // Three independent draws. Sharing one hash between the direction and
      // the dimensions correlates them — every spear pointing one way is long,
      // which the eye reads as one shape repeated (§14.7).
      vec2 ha = ch2(vec2(fj * 5.1 + fk, e * 2.3 + 7.0));
      vec2 hb = ch2(vec2(fj * 9.7 + fk * 3.3, e * 1.7 + 19.0));
      vec2 hf = ch2(vec2(fj * 3.1 + fk * 7.7, e + 41.0));
      float hj = ch1(vec2(fj * 11.0 + fk * 2.9, e));

      // The cluster has ONE orientation and its spears fan about it. Drawing
      // each direction independently scattered them like jackstraws, which is
      // most of "poorly attached" — a cluster of quartz grows out of one place
      // on the rock in roughly one direction, splaying as it goes.
      //
      // And that orientation LEANS OUT OF THE WALL. Crystals grow normal to
      // the surface they nucleate on; in a passage that means inward, toward
      // the axis. A purely hashed direction is what made the clusters read as
      // laid on top of the stone rather than grown out of it, because nothing
      // about them referred to the geometry they were standing on. Only a
      // lean, not a rule — pinning them exactly to the normal turns the wall
      // into a pincushion, which an earlier pass did — and since every seat is
      // at a different angle, leaning each one out of its OWN wall reads as a
      // passage rather than as a starburst.
      vec2 inward = -vec2(cos(ang), sin(ang));
      float ra = ch1(vec2(fj * 2.7, e + 3.0)) * 6.2831853;
      vec2 baseDir = normalize(mix(vec2(cos(ra), sin(ra)), inward, 0.5)
                               + vec2(0.0007, 0.0));
      float sa = atan(baseDir.y, baseDir.x) + (ha.x - 0.5) * 1.45; // fan ~+/-40 deg
      vec2 dir = vec2(cos(sa), sin(sa));
      vec2 side = vec2(-dir.y, dir.x);

      // Roots sit close together and always ON the seat, so the spears meet
      // at the rock instead of hovering near it. The old offset was six times
      // this and unscaled by depth, so a distant cluster's spears drifted
      // apart by more than their own length.
      vec2 d = d0 - (hf - 0.5) * 0.07 * persp;
      float along = dot(d, dir);
      float across = dot(d, side);

      // Sized by the passage. Everything here is multiplied by persp, so one
      // cluster deep in the tunnel is a small cluster and one at the mouth is
      // a large one — the perspective the seat already carries, applied to the
      // shape as well as the position.
      // Stouter. Long and narrow reads as a splinter; quartz is a chunky
      // prism, and at this scale thin spears also disappear against the rock.
      float len = (0.26 + hb.y * 0.34) * persp;
      float wid = (0.075 + hb.x * 0.075) * persp;

      float uu = along / len;
      // Parallel sides, then a pyramidal cap over the last fifth — that
      // termination is what makes quartz read as quartz.
      float capAt = 0.7 + hj * 0.18;
      float w = wid * (uu < capAt ? 1.0 : max(0.0, (1.0 - uu) / (1.0 - capAt)));
      if (uu < 0.0 || uu > 1.0 || abs(across) > w) continue;

      // Facet bands down the length: the prism has several faces, and each
      // one turns a slightly different way. Three bands is enough to read.
      // Four bands, leaning harder. Three faces at +/-0.55 all caught the
      // light within a hair of each other, so a prism shaded almost flat and
      // read as a pale plank rather than a solid — the facets have to
      // DISAGREE about the light or there is no volume in them.
      float band = floor((across / max(w, 0.001)) * 2.0 + 2.0);
      float lean = (band - 1.5) * 0.62;
      // The face normal: mostly the prism's side, tilted by which band.
      vec2 n = normalize(side * sign(across + 0.0001) + dir * lean);

      // Lambert against the moving light, sharpened so a face is either
      // catching it or dark — quartz glints, it does not shade. Softened from
      // pow(lam, 9.0) to a fifth power: nine was a lobe so tight that the
      // light had to be aimed almost exactly at a face, and it usually was
      // not. Written out rather than pow() — three multiplies against a
      // transcendental, in the motif that made this mood unusable.
      float lam = max(dot(n, lightDir), 0.0);
      float l2 = lam * lam;
      float glint = l2 * l2 * lam;
      // The prism's edges catch a line of light whatever way they face, and
      // that rim is both how the eye reads a crystal as faceted and the floor
      // that keeps a nominated cluster visible while the sweep is behind it.
      float edge = smoothstep(0.76, 1.0, abs(across) / max(w, 0.001));
      glint = clamp(glint + edge * (0.22 + 0.5 * lam), 0.0, 1.5);
      // The mass itself: dim, but enough to feel quartz standing in the dark
      // before anything lights it. Ambient was 0.035 and gated on nothing,
      // which is a mass you cannot see; this is gated on the nomination, so
      // it is one visible cluster rather than a haze over all of them.
      // Quartz in an unlit cave is nearly as dark as the rock; what you see of
      // it is the faces that happen to be turned toward the lamp. A flat
      // ambient made every spear a bright slab pasted over the stone, which
      // is the opposite of being revealed by a light.
      float body = 0.02 + 0.15 * lam * lam;

      // FULLER ILLUMINATION IN THE HIGH REGISTER. drive is the treble already,
      // but only as a widening term on a floor that gave the same reveal to the
      // bottom of the keyboard; pitch says which end is being played outright,
      // so a run up the top lights the seam it has found much harder than a
      // left-hand chord does. What the register changes is HOW MUCH of a
      // crystal you see, not whether the cave has one.
      float lampGain = 0.18 + drive * 0.5 + pitch * pitch * 0.75;
      float v = env * (body + glint * lampGain + glint * strike * 0.85);
      // Nearest wins, and it wins whether or not it is the brightest. That is
      // what puts a hard edge where one spear crosses another.
      float z = dep + (hb.x - 0.5) * 0.16 + fk * 0.035;
      if (z < bestZ) {
        bestZ = z;
        best = v;
        faceGlow = env * glint;
        tint = qtint;
      }
    }
  }
  // A spear, wherever one covers this fragment; otherwise the crust it grew
  // out of. That is the occlusion, and the hard boundary it draws where one
  // spear crosses another is the silhouette edge the motif was missing.
  return bestZ < 1e5 ? best : bedBest;
}

// The bolt's descent, shared by the channel and its fork so the fork can
// leave from exactly where the channel is at the branch height. Two scales
// of LINEAR noise: the walk and the stutter. No fbm anywhere in it — smooth
// noise cannot make a corner, and a bolt is nothing but corners.
float boltPath(float y, float seed) {
  return (lnoise(vec2(y * 5.0 + seed * 11.0, 1.7)) - 0.5) * 0.5
       + (lnoise(vec2(y * 16.0 + seed * 5.0, 6.3)) - 0.5) * 0.14;
}

// Lightning. A bolt is a path down the frame, jittered by noise, with a fork
// off it — plus the flash, which is most of what a storm actually looks like
// from inside one. Everything is gated on the onset envelope squared, so
// only real attacks throw one and it is gone almost at once.
float mStorm(vec2 uv, float t, float strike, out float flash) {
  float seed = floor(t * 0.37);
  vec2 h = hash2(vec2(seed, 5.5));
  float hit = strike * strike;              // sharpens: soft playing throws none
  flash = hit * hit * (0.55 + h.y * 0.45);

  // The channel is PIECEWISE LINEAR: lnoise of uv.y is the path, so the bolt
  // is straight runs meeting at corners, at two scales — the big zigzag and
  // the small kinks along each run. It was fbm of uv.y, and fbm is smooth by
  // construction: the bolt came out as a drifting S-curve however hard it
  // flashed — "bent/curved instead of purely jagged". A curved bolt reads as
  // a crack in glass, not electricity. Same fix as the ridgeline, same
  // primitive.
  float x0 = h.x * 1.3 - 0.65;
  float px = x0 + boltPath(uv.y, seed);
  float top = 0.5;
  float core = smoothstep(0.014, 0.0, abs(uv.x - px)) * step(uv.y, top);
  // Bolts fade toward the ground rather than ending on a line.
  core *= smoothstep(-0.35, 0.1, uv.y);

  // One fork, present about half the time — and ATTACHED. It leaves the main
  // channel AT a hashed branch height, from the channel's own x there, and
  // exists only below that point: zero offset at the branch, leaning away as
  // it falls, growing its own kinks only once it is clear. The old fork
  // carried an independent base offset and its own noise, so it hung beside
  // the bolt as a second unrelated scribble — "branches not attached to each
  // other" was literally true of it.
  float fseed = hash(vec2(seed, 21.0));
  float yb = 0.30 - fseed * 0.32;              // the branch height
  float below = yb - uv.y;                     // how far under the branch we are
  float fdir = sign(hash(vec2(seed, 27.0)) - 0.5);
  float fx = x0 + boltPath(yb, seed)           // = the main channel at yb
           + fdir * below * (0.5 + fseed * 0.5)
           + (lnoise(vec2(uv.y * 13.0 + seed * 7.0, 9.0)) - 0.5)
             * 0.3 * clamp(below * 5.0, 0.0, 1.0);
  float fork = smoothstep(0.008, 0.0, abs(uv.x - fx))
             * step(0.0, below) * smoothstep(-0.3, -0.02, uv.y) * step(0.45, fseed);

  return (core + fork * 0.75) * hit;
}

// Molten rock finding its way downhill. Channels rather than a pool: a ridged
// field stretched vertically and scrolled downward gives long streams, and a
// finer generation of the same splits them into rivulets. The crust between
// them is dark, so what you see is the glow coming UP through the cracks.
// Drawn in the CONE's frame — down, the depth below the skyline — and that
// is the whole difference between this and what it was.
//
// Two faults lived in the old screen-space version. It sampled
// uv.y * 1.05 - flow * 0.55 - t * 0.1, and a feature sitting at a fixed
// sample coordinate has uv.y = (const + flow*0.55 + t*0.1)/1.05, which grows
// with the clock: every stream crawled UP the frame. And being in screen space
// at all, the flows were horizontal bands lying across the bottom of the
// picture with no relationship to the mountain above them.
//
// In the cone's frame down increases downhill by construction, so adding the
// clock to it can only send the streams down the mountain — the direction is
// not a sign to get right any more, it is a property of the coordinate. And
// since down is measured from the roughened profile, the channels bend
// around the same crags the silhouette has.
float mLava(vec2 uv, float t, float flow, float drive, float kick,
            float descent, float crag, out float hot, out float skin) {
  float run = max(descent, 0.0);
  // Flows FAN as they descend: they leave one vent and spread over the cone,
  // so the across-slope coordinate is divided by how far they have run. At a
  // constant scale the streams are parallel stripes, which reads as a curtain
  // hung on the mountain rather than as something poured from a point.
  float across = uv.x / (0.22 + run * 0.9);
  // The profile's ROUGHNESS alone, folded into the flow coordinate: that is
  // what bends the channels over the crags without the crags being drawn.
  //
  // It has to be the roughness and nothing else. Derived instead as
  // depth-below-local-skyline minus descent, it carried the cone's whole gross
  // shape — nearly a full unit of offset on the lower flanks — and along the
  // silhouette it cancelled the descent term almost exactly, leaving the flow
  // coordinate barely varying down the edge. A ridged field that varies slowly
  // holds near its peak for a long stretch, which drew a continuous bright
  // line around the mountain: the outline lit up instead of the face.
  // ANISOTROPY, and it decides whether these are streams at all. A ridged
  // field's crests run in the direction it varies LEAST — the rule frond()
  // already works by — so a channel that runs downhill needs a high frequency
  // ACROSS the slope and a low one along it. This was the other way round
  // (1.5 across, 2.6 down), which elongated every crest horizontally and, at a
  // threshold high enough to narrow them, closed them into rings: a glowing
  // loop lying on the mountain instead of lava running off it.
  // SLOW, AND STEADY. Two separate faults lived in the old pair of rates.
  //
  // Slow: at flow*0.5 the whole pattern crossed the cone in about two and a
  // half seconds, which is a grass fire, not molten rock. Lava is the slowest
  // thing this engine draws.
  //
  // Steady: fixing that left the motion almost entirely on u_flow (0.12
  // against t's 0.03), and u_flow's RATE swings by fourteen times between a
  // silent room and a loud one. So the flows crawled, surged, and crawled
  // again with every phrase — "some jumping/stuttering with the lava flow",
  // exactly. u_flow is the right clock for direction (it cannot retreat) and
  // the wrong one to hang all the speed on. The steady clock carries most of
  // it now and the room adds about half again at the top, which reads as the
  // eruption working harder rather than as the picture skipping.
  //
  // A CRAGGY SURFACE, and it is what makes a flow branch. The cone's own crag
  // is a PROFILE roughness: one number per column, identical all the way down
  // it, so every channel bent the same way at every depth and the streams came
  // out as thick sticks laid on a smooth cone. What a stream actually does is
  // find the low ground, split around a shoulder, and rejoin below it — and
  // that needs relief that varies with depth as well as across the slope.
  //
  // Deliberately never drawn ("invisible cragginess is fine"): it exists only
  // to deflect the flow coordinate, which is how the rock makes itself felt.
  // Low frequency DOWN the slope on purpose — a deflection that persists for a
  // long stretch is a meander, where a high frequency would be a wobble.
  float bend = (lnoise(vec2(run * 1.5 + 4.0, across * 0.85)) - 0.5) * 1.05
             + (lnoise(vec2(run * 4.1 + 9.0, across * 2.1)) - 0.5) * 0.42;
  // The channels SPREAD without fattening. Dividing across by the run alone
  // fans the streams apart and stretches each one with them, so by the foot of
  // the cone a handful of very wide bands is all there is. Multiplying the
  // frequency back up by the same run keeps a stream the width it was and lets
  // new ones appear in the space that opened between them — distributaries,
  // which is what a spreading flow field actually does.
  vec2 q = vec2(across * (2.6 + run * 5.0) + bend * 1.4,
                (run + crag * 1.6) * 0.95 - t * 0.055 - flow * 0.03);
  float chan = 1.0 - abs(2.0 * fbm(q) - 1.0);
  chan *= chan;                                   // narrow the channels
  // The finer generation SPLITS the channel instead of shading it. Multiplied
  // into the value (0.55 + 0.45 * fine, as it was) it can only make a stream
  // brighter and dimmer along its length; used to pinch the channel shut where
  // it runs low, the stream divides around the gap and rejoins below. Forking
  // is a geometric event, not a change of brightness.
  float fine = 1.0 - abs(2.0 * fbm(q * 3.1 + 11.0) - 1.0);
  float v = chan * mix(0.34, 1.0, smoothstep(0.16, 0.52, fine));
  // THE SOURCE. A vent that is erupting is always spilling something, but the
  // channel field scrolls past the rim, so without a bias at the top the crater
  // periodically had no flow leaving it at all and the mountain went dark from
  // the summit down. Lifting the field near the rim keeps the flows anchored to
  // the place they come from; they still thin and wander below it.
  v += smoothstep(0.13, 0.0, run) * 0.22;
  // It cools as it runs — and cooling NARROWS a flow, it does not dim one.
  // Crust closes in from both banks until the stream is a thread and then
  // pinches out; what is still molten in the middle stays just as bright.
  // Multiplying the field down by descent (what this was) fades the whole
  // channel evenly instead, so the flows dimmed uniformly and then stopped
  // dead partway down the cone, with a hard line across the mountain where
  // they crossed the threshold together.
  //
  // Raising the THRESHOLD with descent is the same cooling expressed as
  // geometry: the level set shrinks toward the channel's spine, the peaks keep
  // their value, and the streams taper away to threads at their own rates
  // instead of all ending at one altitude.
  // A GUSH on an onset: the threshold drops, so more of the field is molten
  // at once and a struck chord opens the ground. Gentler than it was (0.13 and
  // 0.20): a threshold is the level set's POSITION, so a large swing on it
  // re-cuts every channel in the frame at once and the flows appear to jump
  // between arrangements. The gush shows in the crust and the heat now, where
  // it costs no geometry.
  float thr = 0.72 + run * 0.55 - drive * 0.08 - kick * 0.09;
  hot = smoothstep(thr + 0.10, thr + 0.28 - kick * 0.10, v); // incandescent core
  // CHARRED SKIN. Lava is not a bright liquid — it is a black crust with light
  // in the cracks, and plates of it ride the stream, tearing open and closing
  // over. Advected in the SAME frame as the channels, so the crust travels
  // with the flow rather than sitting on it as a stencil, and thickening with
  // descent because that is what cooling does: molten at the vent, mostly
  // black by the foot of the cone.
  // Two scales of it: broad plates, torn up by a finer crazing, so the crust
  // has edges at more than one size the way a real one does. Suppressed only
  // partly inside the incandescent core — even a fresh channel carries scraps
  // of skin riding on it, and it is those dark scraps crossing a bright stream
  // that read as gooey.
  skin = smoothstep(0.40, 0.60, fbm(q * 4.4 + 27.0) * 0.68
                              + fbm(q * 11.0 + 5.0) * 0.32)
       * smoothstep(0.02, 0.24, run)
       * (1.0 - hot * 0.45);
  return smoothstep(thr, thr + 0.09, v);
}

// Wind-combed sand. Long parallel ridges bent by the ground they lie on, and
// travelling slowly across it — the bend is what stops this reading as printed
// stripes, because real ripples follow the dune rather than the frame.
// PER DUNE, not per screen. This was a pure function of uv, so one comb
// pattern at one pitch and one phase was painted across all three parallax
// layers at once — "the ripples are the same across all dune layers. One big
// overlay across all layers makes it look distractingly fake".
//
// It is the identical fault the crag map had on the mountain, and it has the
// identical cure: each layer gets its own patch of the field, at its own pitch,
// travelling at its own rate. Get any one of the three wrong and the layers
// read as a backdrop seen through a fixed ribbed window. Ripples belong to the
// sand they lie on, and which sand that is is what layer says.
float mRipples(vec2 uv, float t, float flow, float drive, float layer) {
  vec2 o = vec2(layer * 37.0, layer * 13.0);
  // Nearer sand is combed COARSER on screen and travels faster. That
  // difference between the layers is the whole of what makes them read as
  // three dunes at three distances rather than as one sheet of corduroy.
  float pitch = 30.0 - layer * 7.0;
  float rate = 0.35 + layer * 0.45;
  float bend = fbm(uv * (1.5 + layer * 0.7) + o + vec2(flow * 0.09 * rate, 0.0)) * 1.5;
  float a = uv.x * 0.55 + uv.y * 2.5 + bend;
  float r = 0.5 + 0.5 * sin(a * pitch + flow * rate + o.x);
  // Sharpened: a ripple has a crest and a trough. Left as a sine it is a
  // corduroy wash with no light in it.
  r *= r;
  r *= r;
  // Combing smooths out with distance — on the far LAYERS as well as up the
  // frame. Distance takes the ribbing out before it takes the dune out.
  return r * smoothstep(0.36, -0.24, uv.y)
           * mix(0.45, 1.0, clamp(layer * 0.5, 0.0, 1.0))
           * (0.55 + drive * 0.5);
}

// Blossom and leaf-fall. The tumble is the entire difference between a petal
// and a raindrop: each one swings edge-on and back as it goes, so its width
// pulses, and it drifts sideways rather than falling plumb. Three layers at
// different rates for depth.
//
// The tint output hands out a per-petal hash so the compositor can give each
// one its own colour from the theme's palette — which is what lets one motif be
// blossom in one mood and dead leaves in another.
// Three separate faults lived here, and they are worth keeping written down
// because each one is a class of mistake this engine has made before.
//
// 1. THEY COULD FALL UPWARDS. The fall was t * (0.13 + fi*0.06) * (0.7 +
//    drive*0.7) — a clock MULTIPLIED by loudness. The offset therefore shrinks
//    when the room quietens, and every mote on screen slides back up. This is
//    the identical fault the snow had, and the engine already carries its cure:
//    u_flow, integrated CPU-side and monotonic by construction. Loudness buys
//    fall RATE now; what has fallen stays fallen.
//
// 2. THEY WERE CUT OFF AT THE CELL EDGES. Each mote was drawn from fract() of
//    its own cell, so whatever reached past a boundary was drawn from the
//    NEIGHBOURING cell's hash instead — a different mote, or none at all.
//    Edge-on, the blob was about two thirds of a cell wide, so this happened
//    constantly: "a lot of seams visible here, like the elements are escaping
//    their boxes and getting cut off". The columns either side are checked now,
//    so a mote near a boundary is drawn whole by whichever cell owns it, and
//    its seat is held clear of the row edges so it is never cut across the fall.
//
// 3. THEY DID NOT FLUTTER. There WAS a sway — sin(y * 1.5 + fi * 2.2) — but it
//    is a function of height and layer alone, so every mote at a given height
//    swung the same way at the same instant. A layer moving in unison is a
//    curtain sliding sideways, not blossom in the air. Each one now carries its
//    own phase and its own rate, and the width of the swing answers the room:
//    petals flutter lightly, leaves toss about and swirl when the music does.
//
// The tint output hands out a per-mote hash so the compositor can give each one
// its own colour from the theme's palette — which is what lets one motif be
// blossom in one mood and dead leaves in another.
// ONE MOTE'S OUTLINE, in its own turned frame. q.y runs -1 at the stem end to
// +1 at the tip; q.x is across. Returns coverage, and reports where the midrib
// is so a leaf can carry one.
//
// A round blob was doing for both, and at this size roundness is the single
// most legible thing about a shape — so blossom and dead leaves came out
// interchangeable however differently they were coloured. Neither of these is
// a disc:
//
//   petal — an ellipse leaning broad toward its outer end and drawn to a point
//           where it left the flower, which is a cherry petal's outline.
//   leaf  — longer, narrower, and pointed at BOTH ends, with a rib down it.
//
// The half-width must stay strictly positive: smoothstep with equal edges is a
// divide by zero that returns coverage rather than nothing, and this engine has
// already drawn a frame full of garbage from exactly that (see mFlame).
float moteShape(vec2 q, float leaf, out float rib) {
  float s = q.y * 0.5 + 0.5;                       // 0 at the stem, 1 at the tip
  float band = max(0.0, 4.0 * s * (1.0 - s));      // a lens, closed at both ends
  // sqrt of the lens is exactly an ellipse — full-bodied — biased outward.
  float petalW = 0.72 * sqrt(band) * (0.52 + 0.48 * s);
  // The lens taken to a higher power narrows the waist and sharpens both tips.
  float leafW = 0.50 * band * (0.55 + 0.45 * band);
  float halfW = max(mix(petalW, leafW, leaf), 1e-4);
  float cover = smoothstep(halfW, halfW * 0.52, abs(q.x))
              * smoothstep(1.04, 0.96, abs(q.y));
  // The rib, and only on leaves. Read as a THINNING of coverage rather than as
  // a drawn line: less mote here means more of what is behind it shows through,
  // which is what a vein looks like against the light.
  rib = leaf * smoothstep(0.09, 0.0, abs(q.x)) * cover;
  return cover;
}

// Blossom and leaf-fall — and they are not one thing in two palettes.
//
// The engine used to claim they were: one motif, one round blob, and a
// per-mote hash spent on the theme's upper steps, so "which it is depends only
// on what colours the theme puts up there". That was true of the COLOUR and
// false about everything the eye actually uses to tell a petal from a leaf.
// Watched in motion the two moods were interchangeable, and both read as a
// curtain — one sheet of identical blurry dots, drifting at one pace that had
// nothing to do with the landscape behind it.
//
// Three things separate them now, and leaf (a theme param, 0 blossom, 1
// leaves) morphs continuously between the two — which matters, because
// blooming and autumn are kin and the passage between them is a season
// turning, not a cut.
//
//   SHAPE      see moteShape. Petals are broad and blunt; leaves are long,
//              pointed at both ends, and carry a rib.
//   DENSITY    blossom is sparse (the owner: "petals be more sparse"); leaves
//              come thicker.
//   MOTION     and this is the one that reads from across a room. A petal is
//              light, so what moves it is its OWN flutter: a fast, small,
//              private oscillation on its own phase and its own rate, so no two
//              are ever doing the same thing. Incoherent motion is what
//              "tossed and fluttering" is.
//
//              A leaf is heavier and is moved by the AIR, so leaves share a
//              GUST — one slow current running through the whole frame, three
//              periods beating against each other so it never repeats — and
//              each leaf answers it at its own lag and its own amplitude.
//              Coherent motion, incoherently answered. That is the difference
//              between a curtain (everything in lockstep, which is what this
//              was) and a wind.
//
// The gust's PHASE comes from the clock and only its amplitude from the room,
// so it can never be a level-driven displacement that retracts (§13): the wind
// blows harder when the music does, and keeps blowing either way.
//
// Faults fixed here previously and still fixed: the fall rides u_flow so it is
// monotonic; the neighbouring columns are checked so a mote near a cell
// boundary is drawn whole; each mote carries its own phase.
float mPetals(vec2 uv, float t, float w, float leaf, float drive, float kick,
              float fall, out float tint) {
  tint = 0.5;
  float v = 0.0;
  // The current, shared by everything in the air. Three incommensurate rates,
  // so it swells and drops and reverses without ever repeating.
  float gust = sin(t * 0.29) * 0.60 + sin(t * 0.17 + 1.9) * 0.34
             + sin(t * 0.71 + 4.1) * 0.16;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float rows = 2.0 + fi * 0.7;
    float cols = 5.0 + fi * 2.4;
    // Monotonic. Nearer layers fall faster, which is the parallax.
    float y = uv.y * rows + fall * (0.75 + fi * 0.42);
    float lane = uv.x * cols;
    float row = floor(y);
    for (int k = -1; k <= 1; k++) {
      vec2 c = vec2(floor(lane) + float(k), row);
      // Sparse for blossom, thicker for leaves. The onset no longer buys
      // population: lowering a spawn threshold with an envelope pops motes into
      // existence in mid-air and pops them out again, and the fall clock
      // already delivers more of them per second when the room works.
      float on = step(mix(0.90, 0.79, leaf) - w * 0.26, hash(c + fi * 17.0));
      vec2 seed = hash2(c + fi * 3.0);
      float ph = seed.x * 6.2831853;
      // Its own rate as well as its own phase: a shared rate with staggered
      // phases still reads as one mechanism driving all of them.
      float rate = 1.0 + hash(c + 9.0) * 2.0;
      float flutter = sin(t * rate * 1.9 + ph) * (0.55 + seed.y * 0.75);
      float lag = 0.45 + seed.y * 1.15;      // how hard this one takes the wind
      float sway = mix(flutter * (0.13 + drive * 0.20 + kick * 0.16),
                       gust * lag * (0.15 + drive * 0.24 + kick * 0.20)
                         + flutter * 0.05,
                       leaf);
      // Held under half a cell whatever the room is doing, so a mote stays
      // inside the three columns the loop above actually checks.
      sway = clamp(sway, -0.44, 0.44);
      // Seated clear of the row boundaries — the fall direction is the one the
      // neighbour loop does not cover.
      vec2 centre = c + vec2(0.5 + sway, mix(0.22, 0.78, seed.y));
      vec2 delta = vec2(lane, y) - centre;
      // Screen units, so a mote keeps its proportions whatever the cell's
      // aspect is.
      vec2 ds = vec2(delta.x / cols, delta.y / rows);
      // Its own size, and the near layers carry bigger ones — the other half
      // of the parallax, and what stops three identical layers reading as one.
      float sz = (0.013 + fi * 0.008) * (0.72 + hash(c * 2.3 + fi) * 0.62);
      // ATTITUDE. It turns in the picture plane (spin) and rolls about its own
      // long axis (tumble, which pulses its width). A petal does both and a
      // falling disc does neither, which is most of why this read as rain.
      float spin = t * (0.45 + hash(c + 5.0) * 1.25) * mix(1.35, 0.75, leaf) + ph;
      float tumble = sin(t * (1.3 + hash(c) * 2.2) + ph);
      float cs = cos(spin), sn = sin(spin);
      vec2 q = vec2(ds.x * cs - ds.y * sn, ds.x * sn + ds.y * cs) / sz;
      // Long axis, then the roll narrowing it.
      q.x *= mix(2.0, 2.9, leaf);
      q.x /= 0.30 + abs(tumble) * 0.70;
      float rib;
      float hit = on * moteShape(q, leaf, rib) * (1.0 - rib * 0.5)
                * (0.62 + fi * 0.19);
      if (hit > v) { v = hit; tint = hash(c * 1.7 + fi); }
    }
  }
  return clamp(v, 0.0, 1.0) * w;
}

// A small fire. Not a wildfire — a seated flame in the dark, sacred and close,
// which means it is defined as much by how little of the frame it occupies as
// by its shape.
//
// Built by advecting noise DOWNWARD through a tapering lobe: sampling a field
// that moves down makes the flame appear to climb, and eroding the lobe's edge
// with that same field is what turns a smooth tongue into fire. Two scales —
// the slow one bends the whole flame, the fast one tears its tip into tongues.
float mFlame(vec2 uv, float t, float flow, float drive, float kick, out float core) {
  // SEATED BELOW THE FRAME — but only just, and that "only just" is the whole
  // of the second correction.
  //
  // The seat was at -0.34, inside the aperture, so the fire's base — the
  // brightest, most solid part of it — sat in plain view as a lit wedge
  // standing on nothing. Dropping it to -0.78 fixed that and overshot: the
  // aperture's floor is uv.y = -0.5 whatever its aspect, so a seat that low
  // hid the entire lower third of the flame, which is where its BELLY is. What
  // showed was the straight-sided run up to the tip, and the owner's note is
  // exactly that — "I do want to see the majority of it and its shape".
  //
  // At -0.62 the base and the fade under it are still off frame (the fade
  // finishes by uv.y = -0.58) and roughly seven eighths of the flame is in
  // shot, belly included. You cannot find where it begins; you can see what
  // shape it is.
  vec2 p = uv - vec2(0.0, -0.62);
  // The climb: a MONOTONIC pair of clocks, not one clock scaled by loudness.
  // This was t * (1.15 + drive * 0.55), which is §13's forbidden coupling —
  // the phase already elapsed gets rescaled every time the room changes, so
  // the whole advected field lurches backwards and forwards through itself
  // instead of rising. The same fault, and the same cure, as the embers below.
  float rise = t * 1.15 + flow * 1.7;
  float slow = fbm(vec2(p.x * 3.2, p.y * 1.9 - rise));
  float fast = fbm(vec2(p.x * 7.5 + 3.0, p.y * 3.6 - rise * 1.55));

  // Height, normalised to the flame's reach. Loudness feeds it and an onset
  // makes it leap — a struck chord should make the fire jump, which is most of
  // what makes a fire feel like it is listening.
  float reach = 0.92 + drive * 0.28 + kick * 0.20;
  float h = clamp(p.y / reach, 0.0, 1.0);

  // A lobe: broad at the seat, drawn to a point. Squaring the taper keeps the
  // base wide instead of making a cone, which is the difference between a fire
  // and a party hat.
  // A DROP, not a triangle. (1-h)(1-0.55h) falls away from the seat from the
  // very first step, so the widest part of the flame is the part you cannot
  // see — everything in frame is the straight-sided run up to the tip, which
  // is a cone. Blending a full profile against a pointed one, weighted by
  // height, keeps the lower body bulbous and still draws the tip to a point:
  // low down the shallow exponent wins and the flame swells, high up the steep
  // one does and it closes.
  // The exponents are a pair and they trade off. At 0.70/2.20 the belly
  // arrived but the tip pinched out around four fifths of the way up, so the
  // fire came out stubby — a drop is FULL at the bottom and still reaches, and
  // the second number is what governs the reaching. 0.65/1.35 is fuller than
  // the old profile everywhere below the last tenth and matches it at the tip.
  float taper = mix(pow(1.0 - h, 0.65), pow(1.0 - h, 1.35), h);
  // Narrower at the seat than the first cut. A wide base that the erosion
  // could not reach came out as a solid bright rectangle sitting on the
  // bottom of the aperture — a box, not a fire.
  // The epsilon is not cosmetic. Above the flame's reach h clamps to 1, so
  // taper is exactly 0 and wid with it — and smoothstep(0.0, 0.0, x) has equal
  // edges, which is a divide by zero. The result came back as coverage rather
  // than nothing, got textured by the erosion below, and drew torn
  // flame-coloured tongues along the top edge of the frame in a mood whose
  // whole point is one small fire in the dark. Keeping wid strictly positive
  // makes the same expression evaluate to zero everywhere instead.
  // Fuller as well as lower. With the belly back in shot the flame is being
  // judged on its width for the first time, and at 0.14 it was a taper rather
  // than a body.
  float wid = (0.17 + drive * 0.06) * taper + 1e-4;
  // THE DANCE.
  //
  // This was lean = (slow - 0.5) * 0.20 * h: one displacement scaled by height,
  // so the flame pivoted about its seat as a rigid body — it swayed, but every
  // part of it swayed the same way at the same instant, and the amplitude was a
  // constant the music never touched. A thing that leans is not a thing that
  // dances.
  //
  // What moves it now is a WAVE traveling up its length. Because the phase
  // depends on p.y, a bend enters at the bottom and climbs, so the flame
  // undulates through an S and back rather than tipping — and the two
  // wavelengths beating against each other keep it from ever repeating. The
  // amplitude and the climb rate both answer the room, so quiet playing leaves
  // a slow serpentine and a struck chord throws a whip up the whole length.
  // The wave's phase is two monotonic clocks summed, for the same reason the
  // climb is. Scaling t by drive rescales the phase already elapsed, and a
  // travelling wave whose accumulated phase jumps is a whip-crack backwards —
  // which is the one direction a flame does not move.
  float amp = 0.055 + drive * 0.13 + kick * 0.10;
  float wave = sin(p.y * 5.2 - (t * 1.5 + flow * 2.4))
             + 0.55 * sin(p.y * 9.7 - (t * 2.3 + flow * 3.2) + 1.7);
  // The slow field still wanders the whole flame, so the dance has somewhere
  // to happen rather than oscillating about a fixed axis.
  float lean = (slow - 0.5) * 0.22 * h + wave * amp * h * h;
  float body = smoothstep(wid, wid * 0.15, abs(p.x - lean));
  // Softened at the bottom, and only just below the seat: a hard step there
  // draws a straight edge across the base of the flame.
  body *= smoothstep(-0.05, 0.02, p.y);
  // Torn everywhere, more so with height, so tongues separate as they climb —
  // but the seat gets some of it too, or the base is a slab.
  body *= smoothstep(0.30 + h * 0.34, 0.62 + h * 0.2, fast + (1.0 - h) * 0.34);
  // The white heart, low and small, and no longer the whole base.
  //
  // It has to move down with the seat. At smoothstep(0.34, 0.10, h) the heart
  // was reached over the bottom quarter of the flame's height, which was
  // entirely off frame while the seat sat at -0.78 and became the bottom fifth
  // of the PICTURE once the seat came up — so the belly the move was made to
  // reveal arrived as a blown-out white lump with no shape in it. What shows is
  // the hot lower body; the incandescent seat stays where the seat is.
  core = body * smoothstep(0.20, 0.02, h);
  return body;
}

// Sparks on the draught. Three sparse layers at different speeds, so they do
// not rise as a sheet — and each lane wanders as it climbs, because an ember
// is carried by moving air rather than falling upward in a straight line.
//
// Deliberately not a 3x3 neighbourhood search: at this density most cells hold
// nothing, and paying nine lookups per fragment to draw a handful of dots is
// the mistake the crystals already made once.
//
// AN EMBER ONLY EVER RISES, and this is the third motif in the engine to have
// got that wrong in the same way — the snow slid back, the falling motes slid
// back up, and the sparks slid back down. The fault is always the same line:
// a clock MULTIPLIED by a live feature (here t * sp * (1.0 + drive * 0.9)).
// The product shrinks the moment the room quietens, so every spark on screen
// retreats along the path it came up. It keeps coming back because multiplying
// the clock is the obvious way to make a mote answer the music, and it looks
// right in a still.
//
// The lawful form is a SUM of two monotonic clocks: u_t, which always
// advances, plus u_flow, which advances faster when the room is loud and never
// retreats (§13). Loudness buys rise RATE; what has risen stays risen.
//
// The population is left alone by the music for the same reason. Lowering the
// spawn threshold with an envelope pops extra sparks into being in mid-air and
// pops them out again as it decays. It does not need to: sparks are born at a
// fixed spacing in the CLIMB, so when the climb speeds up they are born more
// often per second all by themselves. A strike flares what is already burning.
float mEmbers(vec2 uv, float t, float flow, float w, float drive, float kick) {
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sp = 0.30 + fi * 0.20;
    float rise = t * sp + flow * sp * 1.7;
    float y = uv.y * (2.4 + fi * 0.9) - rise;
    // The wander: lanes bend as they rise, on each layer's own phase.
    float lane = uv.x * (6.5 + fi * 3.2) + sin(y * 0.7 + fi * 2.1) * 0.7;
    vec2 c = vec2(floor(lane), floor(y));
    float on = step(0.93 - w * 0.22, hash(c + fi * 31.0));
    vec2 fp = vec2(fract(lane), fract(y)) - hash2(c + fi * 7.0);
    // Corrected for the cell's aspect. A lane cell is several times taller on
    // screen than it is wide, so measuring distance in cell space drew embers
    // as vertical streaks — sparks stretched into rain going the wrong way.
    float d = length(fp * vec2(1.0, (6.5 + fi * 3.2) / (2.4 + fi * 0.9)));
    // They die as they climb. Without this they stream off the top of the
    // frame and read as rain going the wrong way.
    float life = smoothstep(0.62, -0.26, uv.y);
    v += on * smoothstep(0.17, 0.0, d) * life;
  }
  // The music spends itself on brightness here, where it cannot move anything.
  return clamp(v, 0.0, 1.0) * w * (0.5 + drive * 0.55 + kick * 0.95);
}

// The plume. Widens and thins as it climbs, and drifts on its own slow sway,
// so the smoke is never directly above the fire for long.
float mSmoke(vec2 uv, float t, float flow, float w, float drive, float srcY, out float lit) {
  // THE SOURCE IS THE CALLER'S. It cannot be a constant here: two moods use
  // this motif and their fires are in completely different places — a seated
  // flame whose body fills the lower frame, and a vent at the top of a
  // mountain. Anchored at one height to suit fire, volcano's plume was drawn
  // down the cone's FACE, where it read as a dark rectangular block sitting on
  // the rock. Smoke starts where the thing burning it is.
  vec2 p = uv - vec2(0.0, srcY);
  // Same trick the flame uses: the phase depends on height, so a bend climbs
  // the plume instead of the whole column swinging as one. And the same clock
  // discipline — summed monotonic clocks, never t scaled by a live feature.
  float sway = sin(p.y * 2.4 + t * 0.34 + flow * 0.35) * 0.15
             + sin(p.y * 4.6 - t * 0.21 - flow * 0.22) * 0.06;
  float wid = 0.13 + max(p.y, 0.0) * 0.75;
  float column = smoothstep(wid, wid * 0.1, abs(p.x + sway));
  float n = fbm(vec2(p.x * 2.0, p.y * 1.5 - t * 0.42));
  // Starts above the flame and fades out well before the top of the aperture:
  // smoke that reaches the frame edge reads as fog, not as a plume.
  // Gone before the frame edge, so it reads as a plume dispersing rather than
  // as fog filling the top of the aperture.
  float span = smoothstep(0.0, 0.16, p.y) * (1.0 - smoothstep(0.22, 0.52, p.y));
  float v = column * span * smoothstep(0.34, 0.74, n) * (0.55 + drive * 0.5) * w;
  // LIT FROM BELOW. Smoke composited only as a darkening is invisible over a
  // night sky — it is already darker than what it covers, so the mood had a
  // plume in it that could not be seen and read as having none at all. What
  // makes smoke visible above a fire is the fire: the first part of the plume
  // catches the light and glows, and it is only higher up, once it has spread
  // and cooled out of the light, that it goes to a darkening.
  lit = v * exp(-max(p.y, 0.0) * 5.0);
  return v;
}

// A rainbow.
//
// Its colour is its OWN — the same licence the aurora, the snow and the quartz
// minerals take, and here it is not a licence but a necessity: a rainbow is
// the entire spectrum by definition, and no five-step palette can hold one.
//
// The spectrum itself, used by the refracted patches below.
vec3 bowSpectrum(float x) {
  vec3 c = mix(vec3(0.95, 0.28, 0.22), vec3(0.98, 0.70, 0.20), smoothstep(0.00, 0.26, x));
  c = mix(c, vec3(0.93, 0.94, 0.34), smoothstep(0.20, 0.44, x));
  c = mix(c, vec3(0.32, 0.86, 0.44), smoothstep(0.40, 0.62, x));
  c = mix(c, vec3(0.26, 0.56, 0.96), smoothstep(0.56, 0.82, x));
  c = mix(c, vec3(0.58, 0.32, 0.88), smoothstep(0.76, 1.00, x));
  return c;
}

// Refracted light in a sunshower. NOT an arc, and the arc is gone on purpose.
//
// A bow is one large piece of fixed geometry: a circle at a fixed centre with
// a fixed radius. However much its segments are faded in and out along their
// length, it is the same shape in the same place every time you look at it, so
// the only thing it can actually do is get brighter and dimmer. That is what
// "the rainbow is pretty much always visible and there's no dancing" is
// describing — the complaint is about the geometry, not the opacity, and no
// amount of gating an arc will make an arc playful. It also had a second bow
// outside the first, which is twice as much of the same fixed thing.
//
// So: "just refracted rainbowy reflections and shapes... its own logic and
// physics to it... light and playful and shimmery."
//
// The physics this invents is the light's, not the atmosphere's. Sun coming
// through moving rain is thrown around as PATCHES of separated spectrum. Each
// patch here is a small sheared lens with its colours running across it, on its
// own drift, its own tumble, its own break-up and its own life — they swim,
// cross, flare and go out independently. Nothing is anchored, nothing is
// symmetrical, and the mood never shows the same arrangement twice.
//
// The one thing kept from the bow is dispersion: the spectrum runs ACROSS each
// patch rather than tinting it. That separation is the whole of why this reads
// as refracted light and not as coloured fog.
// Second attempt at this, and the first one failed the same way the arc before
// it did: it was made of the wrong PRIMITIVE.
//
// The arc was one large piece of fixed geometry, so the only thing it could do
// was get brighter and dimmer. Replacing it with drifting patches fixed the
// fixedness and kept the primitive a blob: three soft ellipses and a lattice of
// round dots, which is "iridescent hail" and "rainbow confetti curtain",
// exactly as reported. A circle has no direction, no length and no edge, so
// however it moves it cannot read as light — light arrives in FILAMENTS.
//
// What light through moving water actually does: the wavefront folds, and where
// it folds it piles up, so what lands is a web of thin bright curves that
// wander, pinch, cross and reconnect. That web is a ridged noise field's crests
// — precisely, not by analogy — and warping its domain with a second slow field
// is what makes the web writhe rather than slide past as a printed pattern.
// This is the same construction as ocean's caustics, given a spectrum.
//
// The dispersion is the one thing kept from the bow, and it is now doing real
// work: the spectrum runs ACROSS each filament, sampled by the signed distance
// from the fold, so a filament carries red on one flank and violet on the other
// the way a prism's fringe does. That separation is the whole of why this reads
// as refracted light and not as coloured fog.
//
// And on the drops themselves: each drop is a lens, so the light it throws is a
// short STREAK leaning the way the rain leans, with the spectrum drawn out along
// its length. Sharing the rain's slant is what puts the sparkle among the water
// instead of on top of it.
vec3 mRainbow(vec2 uv, float t, float drive, float kick, float pitch,
              float slant, out float amt) {
  // The web. Two slow warp fields on their own rates, so the folds are carried
  // AND reformed — a rigid translation of a fixed web is a moving stencil.
  vec2 w = uv * 2.4;
  w += vec2(fbm(w * 0.9 + vec2(t * 0.11, 0.0)),
            fbm(w * 0.9 + vec2(4.0, -t * 0.085))) * 0.85;
  float s = fbm(w * 1.6 + vec2(0.0, t * 0.06));
  // Signed distance from the fold, and the fold itself: the ridge of the field.
  float acrossFold = 2.0 * s - 1.0;
  float ridge = 1.0 - abs(acrossFold);
  float r2 = ridge * ridge;
  float fil = r2 * r2 * ridge;                 // thin — pow(ridge, 5)
  // It happens in patches. Sunlight through rain is not evenly bright across a
  // sky, and a thing that is always on everywhere is not playing.
  fil *= smoothstep(0.34, 0.70,
           fbm(uv * 1.1 + vec2(-t * 0.07, t * 0.05) + 31.0));
  // Dispersion across the filament. The visible width of a fifth-power ridge is
  // about |acrossFold| < 0.37, so 1.35 spreads the full spectrum over exactly
  // the part that is lit; bright playing walks the colours along it.
  float k = clamp(acrossFold * 1.35 + 0.5 + (pitch - 0.45) * 0.4, 0.0, 1.0);
  vec3 col = bowSpectrum(k) * fil;
  float total = fil;

  // The drops. Sheared by the rain's own slant so a flash lies along the fall,
  // elongated, and carrying the spectrum down its length — a lens, not a bead.
  vec2 gp = vec2(uv.x + uv.y * slant, uv.y) * vec2(27.0, 15.0)
          + vec2(t * 0.35, -t * 2.6);
  vec2 gi = floor(gp);
  vec2 gf = fract(gp) - hash2(gi);
  float gl = step(0.90, hash(gi * 1.37))
           * smoothstep(0.62, 0.0, length(gf * vec2(3.2, 0.85)))
           * (0.45 + 0.55 * sin(t * 4.0 + hash(gi) * 24.0));
  col += bowSpectrum(clamp(gf.y * 0.85 + 0.5 + hash(gi) * 0.3, 0.0, 1.0)) * gl * 0.9;
  total += gl * 0.6;

  // A low floor rather than 0.5: it should be a thing that happens, not a
  // thing that is there.
  amt = total * (0.20 + drive * 1.10 + kick * 0.70);
  return col;
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
float mRidge(vec2 uv, float t, float flow, float drive,
             out float crest, out float sky, out float plume, out float layer) {
  float v = 0.0;
  float cover = 0.0;
  float hN = 0.0;
  crest = 0.0;
  layer = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Nearer ranges are wider (fewer, bigger peaks) and drift a hair faster,
    // which is parallax — the only reason to move a mountain at all.
    // The journey: each range passes at its own rate as the flow clock
    // advances — near ones fastest — so the traveller moves along the chain,
    // quicker when the music is working. Nothing ever backs up.
    float x = uv.x * (1.5 - fi * 0.34) + fi * 9.7 + t * 0.006 * (1.0 + fi)
            + flow * (0.05 + fi * 0.11);
    // Two octaves, not fbm's five. A ridgeline profile made of fine noise is a
    // wavy line — which is the banding failure in a hat — and a mountain's
    // outline is a few big decisions with detail hung off them.
    //
    // LINEAR noise, blended in by nearness. Smooth noise interpolates through
    // a smoothstep, so a profile folded from it is built of rounded lumps
    // whatever the weights say — "lumpy and pokey" was the report, and lumps
    // are the only shape smooth noise can make. lnoise is straight segments
    // meeting at corners, and folding it gives the straight-flanked,
    // sharp-summited triangles a crag line actually has. The far range keeps
    // most of the old softness on purpose: distance rounds a ridgeline off,
    // and that difference in edge is depth doing to shape what aerial
    // perspective already does to contrast.
    vec2 s1 = vec2(x, fi * 11.0 + 3.3);
    vec2 s2 = vec2(x * 2.7 + 5.0, fi * 11.0);
    float ang = (0.45 + fi * 0.275) * u_angular; // fi 0 far/soft, fi 2 near/angular
    float n = mix(noise(s1), lnoise(s1), ang) * 0.72
            + mix(noise(s2), lnoise(s2), ang) * 0.28;
    // THE FOLD, and it is the fold that decides peak or dune — not the noise
    // going into it. An abs() fold has a CREASE at its apex however smooth
    // its input is: softening the noise alone gave curved
    // flanks meeting at a sharp point, which is a spike with rounded sides and
    // was the owner's "too peaky rather than the dunes I was imagining".
    //
    // Squaring instead of taking the modulus turns the same fold into a
    // parabola — a crest with a continuous tangent through the top, which is
    // what a wind-built pile of sand has and what rock does not. u_angular
    // chooses between them, so one silhouette is a range or a dune field.
    float fold = 2.0 * n - 1.0;
    float ridged = mix(1.0 - fold * fold, 1.0 - abs(fold), u_angular);
    // Sand is also LOWER and smoother than stone: a dune field has less relief
    // than a range, and no subsidiary spurs to speak of.
    ridged *= mix(0.74, 1.0, u_angular);
    // Tried and rejected: falling at different rates either side of the crease,
    // to get the long-slope-and-steep-face asymmetry a real ridgeline has. The
    // gentle side has to be clamped where it would go negative, and that clamp
    // is a FLAT VALLEY FLOOR — the ranges came out as mesas with spikes on
    // them, which is further from a mountain than the scallops it was meant to
    // fix. Asymmetry is still the right idea; it has to come from somewhere
    // that cannot flatten, so warp the profile's x before the fold rather than
    // reshaping the fold's output.
    // The quadratic sharpen that lived here (a pow-1.3 stand-in, stronger
    // toward the front) is gone. Its job — angular near, soft far — moved
    // into the lnoise blend above, and applied on top of a piecewise-linear
    // fold it could only bend the straight flanks back into parabolas,
    // undoing the very corners the linear noise was brought in for. A
    // linear fold is already pointed at the summit; it does not need help.
    // A third, finer ridged octave breaks the smooth shoulders into
    // subsidiary spurs. Without it the profile is two big humps per screen —
    // rolling hills, which is what the owner saw. Mountains have detail all
    // the way down their sides, and that detail is what says "rock" rather
    // than "landscape wallpaper".
    float fine = 1.0 - abs(2.0 * lnoise(vec2(x * 5.3 + 17.0, fi * 7.0)) - 1.0);
    // Spurs, not needles. The additive half of this was 0.16, and since a
    // ridged noise folds to a sharp point wherever it crosses its midline, an
    // added octave of it puts a thin spike at every one of those crossings —
    // which is most of what "squished and cartoonish" was describing. The
    // multiplicative half does the work of breaking the shoulders; the
    // additive half only needs to keep the small ones from disappearing.
    //
    // The multiplicative half was fine*fine, and squaring was the rest of
    // that same fault rather than a cure for it. A ridged fold is roughly
    // uniform over 0..1, so squaring it piles the distribution up near zero:
    // the multiplier then sat below 0.8 across FOUR TENTHS of the ridgeline
    // and only reached its top in the last decile. That is not a shoulder
    // being broken, it is a profile held down to a floor with occasional
    // spikes let through — the owner's drawing of the wrong answer, exactly:
    // a flat baseline with needles standing on it, where a range wants a
    // continuous rise and fall of broad peaks and deep valleys.
    //
    // Unsquared, the same octave varies the shoulders instead of flattening
    // them, and the big triangular fold underneath survives to be the shape.
    // The constants are rebalanced (0.7/0.52 -> 0.64/0.48) to hold the mean
    // multiplier where it was, because the complaint here has never been
    // height: "adjust the lower end, don't exaggerate the upper".
    //
    // Scaled by u_angular as well: the spurs are what say "rock has detail all
    // the way down its sides", and sand has the opposite property — a dune is
    // smooth between its crests, and any texture on it belongs to the ripples
    // motif rather than the silhouette.
    ridged = clamp(ridged * mix(1.0, 0.64 + 0.48 * fine, u_angular)
                 + fine * fine * 0.07 * u_angular, 0.0, 1.5);
    // Heights live where the aperture actually is. The lens is wide and
    // short, so a range built for a square canvas puts its whole silhouette
    // off the top and leaves only the valley floor in shot.
    // "Adjust the lower end, don't exaggerate the upper" turns out to be about
    // RELIEF, not height, and the difference is the whole of why two passes at
    // this read as squished. A range whose valley floor sits high is a solid
    // wide mass with a wiggle along its top — which is a wave, not a mountain,
    // and lowering the peaks to un-exaggerate them makes it more of a wave.
    // Dropping the floor instead opens the gaps between summits, lets the
    // range behind show through them, and buys the height back from below
    // where it costs nothing in summit shape.
    float h = -0.02 - fi * 0.18 + ridged * (0.42 + fi * 0.12);
    float below = smoothstep(h + 0.008, h - 0.008, uv.y);
    // Aerial perspective: distance washes a range out toward the sky, so the
    // far layer is the palest thing on screen and the near one is nearly black.
    float shade = 0.46 - fi * 0.17;
    v = mix(v, shade, below);
    crest = mix(crest, below * (1.0 - smoothstep(0.0, 0.07, h - uv.y)), below);
    // Which range is frontmost HERE. The rock texture needs it: one shared
    // crag map slid across near and far ranges alike, so the near peak's
    // surface and the far peak's surface were visibly the same rock moving
    // at the same rate — the whole parallax illusion collapsed.
    layer = mix(layer, fi, step(0.5, below));
    cover = max(cover, below);
    if (i == 2) hN = h; // the near ridge, where spindrift is torn off
  }
  sky = 1.0 - cover;
  // Spindrift: snow blown off the near crest when the room is loud. Streaky,
  // wind-sheared, gated entirely by drive — silence leaves the summits
  // absolutely still. The landscape holding still is the point (owner's
  // note); it is the WEATHER that answers the music.
  float above = uv.y - hN;
  float band = smoothstep(0.0, 0.03, above) * (1.0 - smoothstep(0.03, 0.15, above));
  // Both gusts must vary in Y as well as X. Sampled along a fixed row they are
  // vertical stripes, and a horizontal band times a vertical stripe is a
  // RECTANGLE — which is what appeared, in hard-edged blocks, wherever the
  // near crest happened to run flat for a while. Snow torn off a summit is the
  // last thing that should have corners on it. (It was there all along and the
  // crag texture was hiding it; deleting crags is what exposed it.)
  float gust = smoothstep(0.45, 0.8,
                 noise(vec2(uv.x * 3.2 - t * 0.3 - flow * 0.9, uv.y * 7.0 + 7.7)))
             * smoothstep(0.4, 0.75,
                 noise(vec2(uv.x * 11.0 - t * 0.5 - flow * 1.6, uv.y * 15.0 + 2.3)));
  plume = band * gust * drive;
  return v;
}

// ONE volcano, at night.
//
// Deliberately NOT the ridge motif with different numbers, which is what
// volcano was. Every property that makes a ridgeline good is wrong here: a
// chain of summits, parallax between the layers, aerial perspective washing
// the back of the range out. This mood is a single object, and a second cone
// behind the first destroys it. Built from ridge, volcano read as precisely
// what it was — a mountain range with fire along the bottom.
//
// The profile is a truncated cone: two straight flanks rising to a flat summit
// that dips into a crater. Straight because a volcano is a pile of its own
// spoil standing at the angle of repose, which is a LINE — folding noise for
// this silhouette is how you get a mountain instead. Truncated because a
// crater is where the lava comes from, and a pointed peak has no vent.
//
// The output that matters is down: how far below the skyline this pixel sits
// in its own column. That is the frame the flows are drawn in, and because it
// is measured from the ROUGHENED profile, whatever is drawn in it is attached
// to the mountain — a channel bends around exactly the crags the silhouette
// has, so lava and rock agree about where the surface is even though the crags
// are never drawn as such. That is "crags don't have to be visible, but they
// need to behave consistently as far as lava's interaction with them".
#define CONE_RIM 0.30
float mCone(vec2 uv, out float sky, out float down, out float descent,
            out float vent, out float crater, out float onCone, out float crag) {
  float ax = abs(uv.x);
  float flank = clamp((ax - 0.28) / (1.02 - 0.28), 0.0, 1.0);
  float coneH = mix(CONE_RIM, -0.62, flank);
  // Craggy, not drafted — lnoise for the reason every angular material in this
  // engine uses it: straight runs meeting at corners, where smooth noise can
  // only make lumps. Scaled by flank so the crater rim stays clean and the
  // roughness grows down the sides, and STATIC in t, because the landscape
  // holding still is the point and it is the eruption that answers the music.
  // Not scaled by flank alone: at a pure multiple the upper flanks came out
  // as two perfectly drafted straight lines, because that is where flank is
  // near zero. A floor lets the roughness start at the rim and grow downward.
  float rough = 0.3 + 0.7 * flank;
  crag = (lnoise(vec2(ax * 7.0, 3.1)) - 0.5) * 0.11 * rough
       + (lnoise(vec2(ax * 19.0, 8.4)) - 0.5) * 0.045 * rough
       + (lnoise(vec2(ax * 43.0, 2.2)) - 0.5) * 0.016 * rough;
  coneH += crag;
  // The summit is a crater, not a plateau: it dips between two rim shoulders.
  // Without the dip a flat top reads as a mesa, and lava sitting on it looks
  // painted onto a table rather than welling out of a hole.
  crater = 1.0 - smoothstep(0.15, 0.29, ax);
  // BARELY A DIP, and this is the correction that matters. Lowering the
  // profile across the crater does not carve a basin — the silhouette is
  // filled below its own line, so everything the dip removes becomes SKY. The
  // deeper it went the bigger the bite out of the summit, which is exactly the
  // "big scoop out of it" the owner saw, and no amount of lava painted below
  // the dip fills it, because the dip is above that lava, not around it.
  //
  // A crater full to the brim has almost no notch in its skyline. What says
  // crater here is that the summit is MOLTEN, not that it is scooped: the
  // profile stays nearly flat and the surface across it is the pool. This much
  // dip is a lip of stone for the light to catch, and nothing more.
  coneH -= crater * 0.018;
  // The cone stands on a plain. Without one its flanks run off the bottom
  // corners of the frame, and at any aperture wider than the one this was
  // tuned at you see SKY underneath the mountain — the aperture's aspect
  // varies, so the silhouette needs a horizon to be a silhouette against.
  float ground = -0.26 + (lnoise(vec2(uv.x * 2.4, 21.0)) - 0.5) * 0.03;
  float h = max(coneH, ground);
  // Where the cone rises clear of that plain, so the flows can be kept on the
  // mountain instead of running out across the flat.
  onCone = smoothstep(-0.01, 0.05, coneH - ground);
  down = h - uv.y;
  // How far the lava has RUN, measured from the crater rim down the picture.
  // Distinct from down on purpose, and the distinction is the whole of why
  // the first attempt drew the flows as a bright outline around the mountain:
  // keyed on depth-below-the-local-skyline, the hottest lava is wherever the
  // surface is nearest the sky, and on a steep flank that is the silhouette
  // EDGE. Descent from the vent is the same everywhere on the visible face, so
  // cooling with it puts the glow where the flow actually is.
  descent = CONE_RIM - uv.y;
  sky = smoothstep(-0.004, 0.004, -down);
  // THE POOL, and it FILLS the crater rather than skimming it. This was a
  // narrow band just under the surface, so the basin was dark below its own
  // rim — the owner's "big scoop out of it", correctly: a hollow with a bright
  // edge is a hole, and what makes a hollow read as full is seeing molten rock
  // all the way down to where the rock closes over it.
  //
  // Held clear of the rim by a hair so there is a lip of stone around it, and
  // brought up close under the lip so it looks brim-full and about to go over.
  // The pool's visible SURFACE, seen at a shallow angle from outside: a
  // shallow molten cap lying across the flat summit. Deep is wrong — at 0.34
  // it drew a slab a third of the frame tall down the middle of the mountain,
  // because depth below the local skyline is not depth into a bowl.
  vent = crater * smoothstep(-0.004, 0.014, down)
       * (1.0 - smoothstep(0.05, 0.115, down));
  return 1.0 - sky;
}



// A moon, and the light it puts on everything under it.
//
// Deliberately not a disc pasted on the sky. What a moon is FOR here is the
// light: it decides where the sky is brightest, it silhouettes whatever passes
// in front of it, and it gives a dusk that would otherwise be a flat gradient
// a place to have come from. The disc is the smallest part of that.
//
// It does not move with the music and it does not brighten with it. A moon
// that answers the playing is a lamp, and the whole point of this mood is that
// the sky is indifferent and the flock is not.
float mMoon(vec2 uv, out float glow) {
  // Off to one side, but inside the lens. The flock's centre wanders about the
  // origin, so a moon sitting on top of it is permanently behind birds — but
  // pushed out to the corner it fell where the aperture is at its narrowest and
  // was barely in shot. Down and left of that: still clear of the body's usual
  // seat, still crossed now and then, and actually visible through the eye.
  vec2 c = vec2(0.44, 0.15);
  float r = length(uv - c);
  // A soft limb rather than a hard circle: at this size a crisp edge reads as
  // a sticker, and the aperture is small enough that one pixel of falloff is
  // most of the disc's character.
  float disc = smoothstep(0.082, 0.070, r);
  // The maria, faint. A perfectly even disc is a hole punched in the sky.
  disc *= 0.86 + 0.14 * fbm((uv - c) * 22.0);
  // The halo — moonlight scattered in the air around it, which is what carries
  // the light into the rest of the frame.
  glow = exp(-r * r * 26.0) * 0.55 + exp(-r * r * 3.2) * 0.22;
  return disc;
}

// --- the flock ------------------------------------------------------------
//
// Ported from tools/prototypes/murmuration.html after ten rounds of the owner
// watching it. Its OWN MOOD (the theme is called flock), not a motif riding
// over the others: the trace is far too expensive to make every mood pay for
// it, and as a mood only this one does. That was the open question in
// HANDOFF.md and the owner has answered it.
//
// How it works, in one paragraph: the flock is a level set of a noise field.
// Each pixel is traced BACKWARDS THROUGH TIME along a flow of vortices and
// crossed shear waves, and the noise is read at the material coordinate that
// comes back — so deformation compounds, which is what folds a body over
// itself rather than wobbling it. Compounding strain shreds any texture
// eventually, so material has a lifetime and staggered generations hand over.
// The boundary comes off the same traced coordinate as the interior, so the
// outline folds with it instead of being a stencil the folding happens inside.
//
// IT KEEPS ITS OWN NOISE PRIMITIVES, and that is deliberate. The prototype's
// fourth fault — "blunt and squared-off" — was a hash ending in
// fract(p.x * p.y), which correlates along both axes and draws a grid into
// everything built on it. viz.js's shared hash() ends in exactly that. Rather
// than change a primitive every other mood is tuned against, the flock carries
// the fixed one under its own names. (Worth knowing that the shared hash has
// the fault: it may be quietly banding other motifs too.)
//
// The five knobs the prototype exposed as sliders are file-scope globals set
// once at the top of mFlock, because bodyFrame and flow read them several
// calls deep and threading them through every signature buys nothing.
// (The prototype's fifth slider, "agile", never entered the shader — it
// scaled the JS clock, which is the theme's speed here. See the theme.)
float fkChurn, fkGrain, fkClench, fkWave;

const float FK_PER = 2.6;

// The old fkHash ended in fract(p.x * p.y), which correlates along both
// axes — small x gives a small product gives a low value, in bands. That
// is a grid drawn into the fkNoise, and everything built on it inherited
// the grid's corners.
float fkHash(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float fkNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
// Quintic, not cubic. Smoothstep leaves a discontinuity in the SECOND
// derivative at every cell boundary, and this shader divides by the
// gradient — so those creases were being amplified into visible seams
// running along the lattice.
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(fkHash(i), fkHash(i + vec2(1.0,0.0)), f.x),
             mix(fkHash(i + vec2(0.0,1.0)), fkHash(i + vec2(1.0,1.0)), f.x), f.y);
}
float fkFbm(vec2 p){
  float v = 0.0, a = 0.5;
// Rotate between octaves. Stacking octaves on the same axes lines every
// scale's corners up with every other scale's, which is most of why the
// mass came out blocky rather than billowing.
  mat2 r = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++){ v += a * fkNoise(p); p = r * p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v;
}

// Round fkSpecks on a jittered lattice. Value fkNoise thresholded low leaves
// RECTANGLES — its cells are axis-aligned boxes — and at the thinned edge
// those rectangles are literally the stragglers, which is what read as
// squared-off. A point per cell measured by distance gives round ones.
float fkSpecks(vec2 q){
  vec2 i = floor(q), f = fract(q);
  float d = 8.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 o = vec2(float(x), float(y));
      vec2 h = vec2(fkHash(i + o), fkHash(i + o + 41.7));
      d = min(d, length(f - o - h));
    }
  }
  return d;
}
mat2 fkRot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

// Where the fkField IS. A finite body, not a medium — it travels on a
// curving heading and its outline deforms as it goes. Without this the
// field fills the frame and reads as fluid in a container.
// It travels less far than it used to, because it also got smaller: the
// body used to be wider than the frame, and a body you never see the ends
// of cannot be seen to TURN. Every narrowing then reads as shrinking,
// because nothing on screen tells you which it was.
vec2 fkCentre(float t){
  return vec2(sin(t * 0.21) * 0.28 + sin(t * 0.13 + 1.7) * 0.09,
              sin(t * 0.17 + 0.6) * 0.13);
}

// The heading it is banked onto.
float fkBank(float t){ return sin(t * 0.19) * 1.1; }

// How edge-on the sheet is: 0 broadside, 1 seen along its own plane.
// A murmuration turning edge-on is its most recognisable move — it goes
// narrow and DARK at once, because the same birds now stack behind one
// another. Narrow WITHOUT dark is just a thing getting smaller.
// sin-SQUARED, not the absolute value. abs() has a corner at every zero
// crossing, which is exactly the moment the body is fully edge-on: it
// stopped narrowing and started widening with a kink in the rate. Squaring
// gives the same range and period with no corner anywhere.
float fkTurn(float t){ float s = sin(t * 0.117 + 0.4); return 1.0 - s * s; }
float fkFore(float t){ return mix(1.0, 0.46, fkTurn(t)); }

// THE BODY FRAME. Everything the fkField is made of is read here — field,
// outline and grain alike — so the interior travels, banks and compresses
// WITH the body. Previously only the outline lived in this frame and the
// field was world-locked, which made the body an aperture sliding over
// fixed wallpaper: the hole changed size while the pattern behind it held
// still, and that is exactly "growing and shrinking rather than morphing".
// Rigid apart from the two things that genuinely change the body's shape:
// the foreshortening as it turns, and the squeeze when it startles. The
// outline's own long-and-thin proportion is NOT in here — that shapes the
// boundary, not the texture, and folding it in made the structure coarse.
vec2 fkBodyFrame(vec2 p, float t){
  vec2 b = fkRot(-fkBank(t)) * (p - fkCentre(t));
  float ball = 1.0 + fkClench * 0.34;
  return b * vec2(1.0, 1.0 / fkFore(t)) * ball;
}

// THE FLOW. Vortices that drift and reverse, plus a shear along the
// heading. Deliberately fkField-RELATIVE: the old fkFlow carried a uniform
// 0.55/s stream along the heading, which over a long trace turns the body
// into a conveyor belt, material pouring in one end and out the other of a
// body that itself only moves at a tenth of that speed. Travelling is
// fkCentre's job. What happens in here is circulation and shear, which
// is the only thing that actually deforms anything.
vec2 fkFlow(vec2 p, float t){
  vec2 ctr = fkCentre(t);
  vec2 rel = p - ctr;
  float bk = fkBank(t);
  vec2 al = vec2(cos(bk), sin(bk));
  vec2 ac = vec2(-al.y, al.x);
// Two shear WAVES: speed along the heading varying sinusoidally across it,
// and the same the other way round. Both are divergence-free — velocity
// perpendicular to the direction it varies in — so they stretch and fold
// without bunching material up or thinning it out.
//
// The point of the waves is that they are non-linear. A uniform shear is a
// linear map, and a linear map can only ever turn an oval into a LONGER
// oval, which is why the body kept resolving into a smooth sliver with
// straight flanks however hard it was stretched. Crossed waves like these
// are the standard recipe for chaotic mixing: they fold.
// Amplitudes well down from where they were, and now under Churn like the
// vortices are. These waves are what stretches the body, and their strain
// compounds over a whole lifetime — so the modest-looking number here was
// drawing a circle out to something like six times its length before the
// material was replaced. Churn is the stretchiness control now, not just
// the vortex control.
  vec2 v = al * (0.24 * fkChurn * sin(t * 0.37 + 1.2)) * cos(dot(rel, ac) * 12.0 + t * 0.55);
  v += ac * (0.16 * fkChurn * sin(t * 0.29 + 3.1)) * cos(dot(rel, al) * 6.0 - t * 0.41);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
// Orbiting INSIDE the body, and on a several-second clock rather than a
// twenty-second one. Everything in here used to turn over so slowly that
// the interior had no time to rearrange between one look and the next.
    vec2 c = ctr + vec2(sin(t * (0.68 + fi * 0.24) + fi * 2.3),
                        cos(t * (0.57 + fi * 0.28) + fi * 1.1)) * (0.14 + fi * 0.09);
    vec2 d = p - c;
    float r2 = dot(d, d) + 0.09;
// Alternating spin, and the strength itself reverses on its own clock — a
// vortex that only ever turns one way reads as a whirlpool.
    float s = sin(t * (0.52 + fi * 0.20) + fi * 2.0) * (0.055 + fi * 0.010);
    v += vec2(-d.y, d.x) * s * fkChurn / r2;
  }
// No agility factor here any more. It scaled the fkFlow AND the rate of the
// clock the fkFlow is measured against, so the slider was changing speed
// quadratically. Tempo is one thing, set in one place.
  return v;
}

// ONE GENERATION OF MATERIAL. Seeded undeformed, then carrying everything
// the fkFlow has done to it since — the trace runs backwards through TIME,
// so deformation accumulates along it.
//
// This is the whole difference between folding and warping, and it is what
// was missing. The old trace stepped five times through the fkFlow at a
// SINGLE INSTANT, which is a fixed distortion of a fixed texture: the
// distortion changed slowly, so the picture wobbled, but the pattern never
// went anywhere. A flag with a design printed on it.
// Where the fkField was WHEN THE GENERATION WAS BORN. Just an oval — it does
// not need to be ragged, and it used to be, pointlessly. What you see is
// this oval after the fkFlow has had its way with it, and a compounding
// strain will draw arms off it, fold notches into it and tear pieces away
// far better than any amount of wobble on a rigid outline could.
float fkBodySeed(vec2 b){
  return smoothstep(0.40, 0.30, length(b * vec2(0.72, 1.75)));
}

vec2 fkLayer(vec2 p, float t, float age){
// A FIXED step, and as many of them as this generation's age needs. Eight
// steps regardless meant a newborn generation paid full price to travel
// almost no distance; since the two ages always sum to one period, the two
// together now cost what a single one used to. Same accuracy, half the
// work — and the young fkLayer is integrated more finely than before.
  float h = 0.33;
  vec2 q = p;
  for (int i = 0; i < 8; i++){
    float done = float(i) * h;
    if (done >= age) break;
    float dt = min(h, age - done);
    q -= fkFlow(q, t - done - dt * 0.5) * dt;
  }
// Read in the body frame AT THE TIME THE MATERIAL WAS THERE, so the
// structure stays attached to the fkField across the whole trace.
//
// Both come off the SAME traced coordinate: what the material looks like,
// and whether it is part of the fkField at all. That is the point — the
// boundary is now made of the same stuff as the interior and folds with
// it, instead of being a fixed shape the folding happens inside.
  vec2 b = fkBodyFrame(q, t - age);
  return vec2(fkFbm(b * 4.0 + 3.0), fkBodySeed(b));
}

// THE FIELD, with no envelope in it. This used to be multiplied by the
// body's falloff, which squashed the signed field toward zero near the
// rim — and since the sheet is a LEVEL SET of this field, squashing it
// dissolved the sheet instead of ending it.
//
// Two generations of material, half a period apart. Each is born
// undeformed at zero weight and dies fully drawn out at zero weight, so
// what is on screen is always the middle of a fold and the regeneration
// never shows. Something has to do this: accumulated strain tears any
// texture to threads eventually, and a real fkField keeps making new
// structure rather than stretching one arrangement forever.
vec2 fkField(vec2 p, float t){
// The phase is offset smoothly across the body, so generations do not all
// turn over at the same instant everywhere. With one global phase the
// ENTIRE fkField crossfades at once, which is precisely what a crossfade
// between two configurations looks like. Staggered, a changeover is local
// churn while its neighbours hold — which is what a fkField does anyway.
// One octave, not four — this only has to be smooth and large-scale. And
// measured on the RIGID coordinate: read in the full body frame, the
// foreshortening and the startle squeeze were stretching the phase field
// itself, so a strike shifted which regions were due to hand over.
  vec2 rp = fkRot(-fkBank(t)) * (p - fkCentre(t));
  float ph = fkNoise(rp * 1.3 + vec2(t * 0.07, 4.0));
  float base = fract(t / FK_PER + 0.35 * ph);

// FIVE generations, not two, weighted by sin^8 rather than a raised
// cosine. Two generations spaced half a period apart means the crossover
// is always between a nearly-fresh arrangement and a nearly-shredded one —
// disparate by construction, and the gentle cosine gave a barely-deformed
// newcomer half the weight. Now one generation holds most of the weight
// most of the time, and the two that ever share it are a fifth of a
// lifetime apart rather than half of one.
  float raw = 0.0;
  for (int k = 0; k < 5; k++){
    float s = sin(3.14159265 * fract(base + float(k) * 0.2));
    s *= s; s *= s; s *= s; s *= s;
    raw += s;
  }
// A floor SUBTRACTED rather than a cutoff tested. A generation whose
// weight falls below it is not dropped at five per cent of the picture —
// its weight reaches zero smoothly and it stops being traced with nothing
// to see. That is what makes skipping safe, and skipping is what keeps
// five generations cheaper than the two they replace.
  float wsum = 0.0;
  for (int k = 0; k < 5; k++){
    float s = sin(3.14159265 * fract(base + float(k) * 0.2));
    s *= s; s *= s; s *= s; s *= s;
    wsum += max(s / raw - 0.05, 0.0);
  }
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 5; k++){
    float u = fract(base + float(k) * 0.2);
    float s = sin(3.14159265 * u);
    s *= s; s *= s; s *= s; s *= s;
    float w = max(s / raw - 0.05, 0.0) / wsum;
    if (w > 0.0) acc += fkLayer(p, t, u * FK_PER) * w;
  }
  return vec2(acc.x - 0.5, acc.y);
}

// A conservative bound on where the deformed body can possibly have got
// to, used only to skip the trace entirely out in the empty sky. It has to
// be generous — the fkFlow carries material well outside the seed oval, and
// clipping an arm would put a straight cut across it.
// Measured on the RIGID coordinate — no foreshortening, no startle
// squeeze. Using the full body frame made the bound tightest exactly when
// the body was thinnest, which is when the fkFlow has flung material
// furthest across the heading; an arm crossing it would be cut off with a
// straight edge.
bool fkNear(vec2 p, float t){
  vec2 r = fkRot(-fkBank(t)) * (p - fkCentre(t));
  return length(r * vec2(0.72, 2.0)) < 0.94;
}


// The mood's one motif. Returns how much of this pixel is birds.
//
// The knob mapping is where the music gets in:
//   churn  — how hard the flow circulates. A busier room folds the body more.
//   agile  — how quickly it answers, the same signal on the trace's own scale.
//   clench — the flock balls up when struck, which is what a real one does
//            when something frightens it.
//   wave   — the agitation ripple: a band of darkening racing through the body
//            far faster than any bird flies. The single most recognisable
//            thing a murmuration does, and it only happens on an onset.
float mFlock(vec2 uv, float t, float drive, float kick) {
  fkChurn = 0.55 + drive * 0.75;
  fkGrain = 34.0;
  fkClench = kick * 0.85;
  fkWave = kick;

  // Written so that every value a DERIVATIVE reads exists in all four lanes of
  // the quad, including the ones out in the open sky that do no work. A
  // hardware derivative differences neighbouring fragments, and a fragment that
  // returned early never wrote the register it would be read from — undefined,
  // and undefined here means a bright seam along the early-out's own boundary.
  // Initialised then gated, it is a difference against a known zero instead,
  // and the expensive branch is still skipped exactly as before.
  bool near = fkNear(uv, t);
  float s = 0.0;
  float env = 0.0;
  if (near) {
    vec2 f0 = fkField(uv, t);
    s = f0.x;
    env = f0.y;
  }

#ifdef HAS_DERIV
  // THE GRADIENT FOR FREE, and it is the whole performance story of this mood.
  //
  // This was two extra evaluations of fkField — two more backwards traces
  // through time, each with its own generations, its own flow integration and
  // its own fbm — for no other purpose than a forward difference. Three traces
  // per fragment to draw one. That is why the murmuration measured half again
  // the cost of the next dearest mood in the set, on a mood that is small on
  // screen even at broadcast size.
  //
  // The neighbouring fragments have already computed the exact value the
  // difference wants. dFdx/dFdy read it out of the quad rather than
  // recomputing it, so the gradient costs nothing and the tracing per fragment
  // falls by two thirds. A 2x2 quad's difference is half a pixel coarser than
  // the two-pixel forward difference it replaces, which is well under the width
  // of the thinnest thing the gradient is ever used to size.
  //
  // Behind a define because it needs OES_standard_derivatives — near-universal,
  // not guaranteed. The three-tap path below is what runs without it and draws
  // the same picture at the old price.
  vec2 gv = vec2(dFdx(s), dFdy(s)) * min(u_res.x, u_res.y);
#else
  // TWO PIXELS, measured. The prototype used 2.0 / u_res.y and that is not
  // incidental: a forward difference taken at a fixed uv step becomes
  // sub-pixel wherever the aperture is small, and a gradient differenced below
  // the sample rate is noise. g then goes unstable, and since the band's width
  // and the sheet's thickness are both derived from g, the whole flock washes
  // out to a smudge. Porting it as a constant made the mood look one way at
  // 900px and another in the portal's lens.
  float e = 2.0 / u_res.y;
  vec2 gv = vec2(0.0);
  if (near) {
    gv = vec2(fkField(uv + vec2(e, 0.0), t).x - s,
              fkField(uv + vec2(0.0, e), t).x - s) / e;
  }
#endif
  if (!near) return 0.0;
  float g = max(length(gv), 1e-4);

  // Distance to the surface, so the band keeps a constant screen width, and
  // NARROWS toward the rim as well as thinning out — at a constant width every
  // ribbon ended in a flat stub. Width is not opacity.
  float d = abs(s) / g;
  float band = smoothstep(0.075 * (0.42 + 0.58 * env), 0.0, d);
  // Thickness is the INVERSE gradient: a shallow gradient means we are looking
  // along the sheet, through a lot of it. That is the dark band.
  float thick = band / (g * 0.34 + 0.30);
  // Turning edge-on stacks the birds behind one another, and balling up packs
  // them together. Both make the mass DARKER as it narrows; without this the
  // narrowing is just a shrink, however honest the geometry is.
  thick *= 1.0 + fkTurn(t) * 0.35 + fkClench * 0.3;

  vec2 ctr = fkCentre(t);
  float bank = fkBank(t);
  float along = dot(uv - ctr, vec2(cos(bank), sin(bank)));
  float wf = fkWave * 3.2 - 1.6;
  float ripple = exp(-pow((along - wf) * 4.5, 2.0)) * step(0.001, fkWave);
  thick *= 1.0 + ripple * 2.6;

  // Grain stretched ALONG the sheet, because birds align with neighbours, and
  // measured in the body's frame so an individual bird travels with the flock.
  vec2 bp = fkRot(-bank) * (uv - ctr);
  vec2 dir = fkRot(-bank) * (gv / g);
  vec2 alo = vec2(dot(bp, vec2(-dir.y, dir.x)), dot(bp, dir));
  float sp = fkSpecks(vec2(alo.x * fkGrain, alo.y * fkGrain * 2.6));
  float grain = 0.30 + 0.70 * (1.0 - smoothstep(0.12, 0.66, sp));

  // THINNING, not fading. Multiplying opacity by the envelope makes every bird
  // at the rim half-there, which is what read as a blurry lens. Raising a
  // threshold against the grain instead REMOVES birds while leaving the ones
  // that remain fully solid — so the edge is stragglers, which is what the
  // edge of a flock actually is.
  float thr = mix(1.12, 0.42, env);
  float keep = smoothstep(thr, thr + 0.10, grain);
  return clamp(thick, 0.0, 1.0) * keep;
}

// Will-o-wisps: a few slow lights wandering between the trunks.
//
// Deliberately not glints. A glint is a surface catching light for an instant;
// a wisp is a small body that drifts, hangs, and fades, and it has to be rare
// enough to be an event. One candidate per cell, most of them switched off.
vec3 mWisps(vec2 uv, float t, float w, float flow, float drive) {
  // Mid-distance bodies: slower than the near trunks, quicker than the far
  // stand, which seats them IN the forest rather than on the glass — and
  // deliberately off the trunks' pace, so they read as creatures drifting
  // among the trees rather than furniture bolted to them.
  vec2 p = uv * 2.7 + vec2(flow * 0.32, 0.0);
  vec2 i = floor(p), f = fract(p);
  vec3 v = vec3(0.0);
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
      // And a zigzag riding the wander. Sine against cosine is an ellipse —
      // a closed path with no corners — and the owner asked for corners:
      // "zigzagging orbs". Triangle waves are nothing but corners, so a
      // smaller, quicker triangular jitter sits on top of the orbit, each
      // wisp on its own two hashed rates. The orbit stays: it is what seats
      // the wisp among the trunks. The triangles are the dart.
      c += (vec2(abs(fract(t * (0.11 + h.x * 0.09) + h.y * 3.1) - 0.5),
                 abs(fract(t * (0.09 + h.y * 0.08) + h.x * 5.7) - 0.5)) * 2.0 - 0.5) * 0.22;
      // Each wisp breathes on its own period, and all of them flare with
      // TREBLE — high sparkling playing excites the little lights, where the
      // bass end belongs to the mist and the warp. Different registers now
      // own different inhabitants of the forest.
      float breath = (0.3 + 0.7 * (0.5 + 0.5 * sin(t * (0.5 + h.x * 0.5) + h.y * 6.28)))
                   * (0.5 + drive * 1.0);
      // A soft body with a brighter core — a lantern, not a dot.
      float r = length(f - c);
      // Phosphorescent, not sparkly: a wide soft body and only the faintest
      // suggestion of a core. The hard bright centre read as a lens flare,
      // and this is an earthy mood — foxfire on wet wood, not glitter.
      float body = on * breath
                 * (smoothstep(0.34, 0.0, r) * 0.5 + smoothstep(0.1, 0.0, r) * 0.35);
      // Each wisp keeps its own colour, and they are living colours rather
      // than palette whites: cold green through to a rarer blue-cyan.
      vec3 tint = mix(vec3(0.35, 0.95, 0.5), vec3(0.3, 0.7, 1.0), h.x);
      tint = mix(tint, vec3(0.95, 0.85, 0.45), step(0.86, hash(id * 7.3)) * 0.7);
      v += tint * body;
    }
  }
  return clamp(v, vec3(0.0), vec3(1.5));
}

// Billowing cumulus, lit by the same sun the rays fall from. The body is a
// noise field pushed toward its peaks, and the rim is the classic cheat:
// sample the same field one step TOWARD the light — where the cloud thins in
// that direction its edge faces the sun, and that edge takes the gold.
// Coverage swells with loudness (a working room builds weather), and the
// drift rides the travel clock, one way, at the music's pace.
float mClouds(vec2 uv, float t, float flow, float drive, out float rim) {
  vec2 q = vec2(uv.x * 1.5 + flow * 0.35 + t * 0.01, uv.y * 2.6);
  float cl = fbm(q);
  // COVERAGE, on the weather clock and with a range worth having. This
  // threshold used to move by 0.1 against a smoothstep 0.26 wide, driven by
  // the phrase-level loudness — which is to say the deck was a fixed amount of
  // cloud that drifted and never gathered. Sunshine's whole drama is
  // occlusion, and every mechanism for it was already wired (rays are cut
  // where cloud stands in front of them and blaze where they slip past an
  // edge); the only thing missing was a gap that ever opened or closed.
  float body = smoothstep(0.74 - drive * 0.44, 0.92 - drive * 0.30, cl);
  float toSun = fbm(q + vec2(-0.055, 0.075)); // toward mRays' source
  rim = clamp((cl - toSun) * 9.0, 0.0, 1.0) * body;
  return body;
}

// Surf in a single moving frame. The first travelling version anchored the
// bend and tear noises to the aperture while the crest phase slid through
// them, so each crest wriggled in place as it crossed the static shape — the
// owner's "going in the wrong direction and getting cut off". Now the crest
// phase, the bend that shapes it, and the tear that breaks it all live in
// the SAME frame, advected together by the flow clock: the sea translates
// as one body, rolling in one direction, and the music sets the pace. Two
// slow t-terms let the shapes evolve a little while they travel, which is
// the fluidity — rigid translation reads as a printed texture sliding by.
float mFoam(vec2 uv, vec2 cur, float t, float flow, float drive, out float crestLine) {
  // The SAME displacement the base field gets, so water and surf are one
  // moving body rather than two effects that happen to share a direction.
  vec2 w = uv + cur * flow;
  // Crests are the PEAKS of a travelling swell field, not stripes of a sine.
  // A sine reads as horizontal bars however much it is bent — the owner's
  // exact word — while noise peaks arrive shaped like weather: irregular,
  // unrepeating, cresting and subsiding. Where a peak rises past the
  // breaking line, surf tears open on it; loudness LOWERS the line, so the
  // music decides how much of the sea is white and quiet water carries
  // almost none. The field churns slowly (the t term) while the whole frame
  // travels one way on the clock.
  float swell = fbm(vec2(w.x * 2.1, w.y * 3.2) + vec2(0.0, t * 0.045));
  float breakAt = 0.62 - drive * 0.13;
  float crest = smoothstep(breakAt, breakAt + 0.17, swell);
  crestLine = crest;
  float tear = fbm(w * vec2(6.8, 4.2) + vec2(t * 0.06, 2.0));
  return crest * smoothstep(0.44, 0.74, tear) * (0.55 + drive * 0.7)
       + smoothstep(0.34, 0.72, swell) * 0.14;
}

// A night sky: fixed stars, a faint band of them, and the odd bright one.
//
// Stars do NOT move, which is what separates this from glints — a glint
// re-rolls its position on every tick and that is what makes it a glint. Here
// the position is hashed once per cell and stays put; only brightness moves,
// slowly, and the scintillation is small. A sky where the stars wander is a
// screensaver.
// tint: the sky's own colour at this point, so a star can be a temperature
// rather than a step on whatever palette the mood happens to carry. Stars are
// not all white and the ones that are not are the ones the eye finds.
float mStars(vec2 uv, float t, float w, float strike, out vec3 tint) {
  tint = vec3(1.0);
  vec2 p = uv * 26.0;
  vec2 i = floor(p), f = fract(p);
  vec2 o = hash2(i);
  float mag = hash(i * 1.93);
  // Most cells are empty; of the rest, most are faint. A uniform field of
  // equal dots is a texture, not a sky.
  float on = step(0.62, mag);
  float bright = pow(hash(i * 3.71), 3.0);
  // SCINTILLATION, not a slow breath. A star twinkles because the air in front
  // of it is moving, so it is quick, irregular, and different for every star.
  // The old 0.75 + 0.25 * sin() was one rate and one shallow depth applied to
  // the whole sky — a field of dots politely breathing in near-unison, which is
  // most of why night read as still. Two incommensurate rates beat against each
  // other here, and each star carries its own DEPTH of modulation, so some burn
  // steadily and others flicker hard. The depth of the flicker is what the eye
  // reads as the air being alive.
  float rate = 1.4 + hash(i * 5.3) * 4.6;
  float tw = (0.5 + 0.5 * sin(t * rate + mag * 24.0))
           * (0.6 + 0.4 * sin(t * rate * 0.61 + mag * 11.0));
  float depth = 0.12 + 0.66 * hash(i * 7.7);
  float twinkle = (1.0 - depth) + depth * tw * 1.9;
  vec2 off = f - o;
  float star = on * smoothstep(0.13, 0.0, length(off)) * (0.25 + bright * 1.5) * twinkle;
  // The brightest few carry a small cross. Diffraction spikes are how a picture
  // says brilliant rather than large — without them the only way to make a star
  // stand out is to make it fat, and a fat star is a planet.
  star += on * step(0.55, bright)
        * (smoothstep(0.30, 0.0, abs(off.x) * 6.0 + abs(off.y))
         + smoothstep(0.30, 0.0, abs(off.y) * 6.0 + abs(off.x)))
        * 0.30 * twinkle;
  // A SECOND, FINER FIELD behind the first. One lattice can only hold one
  // density, and a real sky is a handful of bright stars standing in front of a
  // great many faint ones — that depth is what stops a starfield reading as a
  // pattern. Faint enough to be a suggestion, and it does not twinkle much,
  // because dimmer stars scintillate less visibly.
  vec2 p2 = uv * 61.0 + 13.0;
  vec2 i2 = floor(p2);
  float on2 = step(0.80, hash(i2 * 2.17));
  star += on2 * smoothstep(0.20, 0.0, length(fract(p2) - hash2(i2 + 5.0)))
        * (0.10 + 0.16 * hash(i2 * 4.4))
        * (0.80 + 0.20 * sin(t * (0.9 + hash(i2) * 2.0) + hash(i2) * 30.0));
  // Colour by temperature: cold blue-white through white to an amber giant,
  // most of them near white. Weighted toward the star that is actually here, so
  // the brightest object in a cell decides the colour rather than the lattice.
  float temp = hash(i * 9.13);
  tint = mix(vec3(0.74, 0.83, 1.0), vec3(1.0, 0.99, 0.96),
             smoothstep(0.0, 0.55, temp));
  tint = mix(tint, vec3(1.0, 0.80, 0.58), smoothstep(0.72, 0.95, temp));
  // The band. Sampled off the same fbm the field uses so it drifts with
  // everything else, and kept faint — it is a suggestion of more stars, not
  // a cloud.
  float band = smoothstep(0.42, 0.72, fbm(uv * vec2(1.1, 3.4) + vec2(4.0, 0.0)));
  // A meteor on a strong onset. No two alike: position, steepness and which
  // way it crosses are all hashed from a slow clock, so successive onsets
  // rake the sky from different quarters instead of restriking one diagonal.
  //
  // Distance flown is the WINDOW'S OWN CLOCK, not the onset envelope. It used
  // to be (1 - strike): elegant while a hit decayed undisturbed, and wrong the
  // moment the envelope rose again, because a rising strike shortens (1 -
  // strike) and drags the head back up its own path. The owner watched one
  // "begin to fall, then backpedal a bit, then fall again" — that is a second
  // onset landing mid-flight, and under real playing, where onsets overlap
  // constantly, it would be a permanent jitter rather than an occasional one.
  // fract() only ever rises, so the streak can only ever go forward.
  float seed = floor(t * 0.31);
  float age = fract(t * 0.31);          // 0..1 across this meteor's window
  vec2 sh = hash2(vec2(seed, 9.1));
  vec2 sh2 = hash2(vec2(seed, 27.3));
  float steep = -0.3 - sh2.x * 1.1;
  vec2 dir = normalize(vec2(cos(steep) * (sh2.y < 0.5 ? -1.0 : 1.0), sin(steep)));
  // ~1s of travel inside a ~3.2s window, then it holds at the far end where
  // nothing can see it, because the gate below has long since shut.
  float flight = clamp(age / 0.32, 0.0, 1.0);
  vec2 head = vec2(sh.x * 1.5 - 0.75, 0.06 + sh.y * 0.36)
            + dir * flight * 0.85;
  vec2 rel = uv - head;
  float along = dot(rel, dir);
  float side = abs(dot(rel, vec2(-dir.y, dir.x)));
  // The envelope now decides only WHETHER a meteor is lit, never where it is,
  // and it can only light one while the window is young — an onset arriving
  // late finds the meteor already spent and throws none. strike^2 still keeps
  // soft onsets from spending them: they should be an event.
  float meteor = smoothstep(0.012, 0.0, side)
               * smoothstep(-0.24, -0.02, along) * smoothstep(0.02, 0.0, along)
               * strike * strike * 1.6 * smoothstep(0.34, 0.04, age);
  // A HANDFUL OF STARS IS NOT A GALAXY. The band used to scale linearly with
  // the star weight, so a mood that wanted a couple of points of light
  // overhead got a Milky Way as well — and in fire's palette, where the
  // specular channel runs to warm gold, that came out as glowing orange cloud
  // banks over a campfire. Gated on the weight instead: only a mood committed
  // to a night sky (night, desert-night) gets the band, and fire's 0.18 and
  // volcano's 0.35 get stars alone.
  float galaxy = band * 0.42 * smoothstep(0.35, 0.80, w);
  // The colour belongs to the STARS, not to the band or the meteor — both of
  // those are white light. Weighting the tint by the star's share of what is
  // here keeps a per-cell temperature from blotching the smooth galactic band
  // at the lattice's own frequency.
  float total = star + galaxy + meteor;
  tint = mix(vec3(1.0), tint, clamp(star / max(total, 1e-4), 0.0, 1.0));
  return total * w;
}

// Curtains of light in a night sky. The lower hem is a slow noise line and
// the folds are vertical striations; loudness lifts the whole veil and an
// onset ripples the hem. Deliberately made of the palette's MID steps when
// composited (see main), so the stars stay the brightest points — an aurora
// is a veil in front of the dark, not a light source outshining the sky.
float mAurora(vec2 uv, float t, float drive, float kick, float pitch, out float high) {
  float x = uv.x * 1.3;
  // The hem sits LOW. It used to run 0.02..0.32, and since the aperture only
  // reaches about 0.35, the whole curtain was crushed into the top sliver of
  // the sky with nowhere to climb — a large part of why there was so little
  // of it to see. A curtain hangs from high and its hem falls near the
  // horizon; that is the shape that fills a sky.
  // MOTION. "The aurora should move more", and the reason it did not was not
  // that the rates were low — it is that all three of its parts moved the same
  // way. The hem, the folds and the rays all scrolled along x at 0.05, 0.08 and
  // 0.07, and the hem and the rays sampled fbm with a CONSTANT second argument,
  // which makes each of them a fixed one-dimensional shape sliding past. A
  // curtain whose every feature translates together at one speed is a painted
  // backdrop on rails; nothing in it evolves, so there is nothing to watch.
  //
  // Two changes, and the second matters more than the first. The rates now
  // differ and the folds run AGAINST the hem, so the curtain shears along its
  // own length instead of sliding rigidly. And every field gains a slow drift
  // in its second axis, so the structure is continuously reformed rather than
  // merely carried: folds deepen and let go, rays kindle and die where they
  // stand. That is the difference between a curtain moving and a curtain
  // being moved.
  float hem = -0.22 + fbm(vec2(x * 1.1 + t * 0.075, 3.7 + t * 0.045)) * 0.26
            + kick * 0.05;
  float fold = fbm(vec2(x * 4.0 - t * 0.06, uv.y * 0.6 + t * 0.11));
  // RAYS. A curtain is not a wash — it is a palisade of near-parallel shafts
  // standing along the field lines, and that structure is most of why the eye
  // reads "aurora" instead of "green fog". Their absence is the largest part
  // of why this motif was too subtle to notice. They drift sideways on their
  // own slow clock, so the curtain shimmers along its length rather than
  // pulsing as one block.
  float rays = smoothstep(0.30, 0.80, fbm(vec2(x * 9.5 + t * 0.15, 11.0 + t * 0.085)));
  // Taller. It used to fade out by uv.y 0.52, which left it hugging the
  // horizon in the bottom third of the sky; a curtain that does not climb
  // has nowhere to put the red-violet crown.
  float body = smoothstep(hem - 0.02, hem + 0.12, uv.y)
             * (1.0 - smoothstep(0.24, 0.52, uv.y));
  // How far up the curtain this fragment sits, for the colour gradient in
  // main: real aurora runs green at the bottom and red-violet at the top,
  // because different altitudes are different excited gases.
  high = clamp((uv.y - hem) / 0.52, 0.0, 1.0);
  // The hem BURNS. The lower edge of a curtain is where the excited band is
  // densest and it is far brighter than the body above it — a uniform veil
  // throws away the one feature everybody recognises.
  float edge = smoothstep(0.13, 0.0, abs(uv.y - hem - 0.045));
  // The aurora answers PITCH: bright, high playing wakes it, low dark
  // playing leaves only a whisper on the horizon — and loudness then sets
  // how hard the woken curtain burns. Two different questions asked of the
  // same music, which is what makes the sky feel attentive.
  //
  // CONFINED TO THE HIGH REGISTER, which is what it was always meant to be —
  // and this is a correction of an overcorrection rather than a new idea.
  //
  // The aurora was once nearly impossible to find, so the gate was opened: a
  // floor of 0.3 under a 0.32-0.58 ramp. But 0.3 is not a whisper, it is the
  // curtain simply being ON, and the synthetic stand-in's centroid never
  // leaves 0.24-0.60, so under mock:auto the ramp is mostly cleared too. The
  // mood became an aurora with a sky behind it, where it is meant to be a night
  // sky with an aurora as a bonus.
  //
  // What had actually been hiding it back then was its COLOUR — it drew from
  // the palette, so a green veil over a blue sky was a slightly bluer blue.
  // That was fixed separately (the tints in main are the motif's own now), and
  // fixing it is what made the widened gate an overcorrection: two cures were
  // applied to one fault and only one of them was needed. So the gate goes back
  // to meaning what it says, with no floor at all — below the register there is
  // no curtain, and the sky is the mood.
  //
  // The owner's measurement puts the top of a piano at roughly 0.76 on this
  // scale, so 0.54-0.76 is genuinely the top of the instrument: it takes bright,
  // high playing to raise one. (The scale itself still wants rebasing once the
  // bass and mid readings exist — see MOODS.md.)
  float wake = smoothstep(0.54, 0.76, pitch);
  float v = body * (0.3 + smoothstep(0.35, 0.75, fold) * 0.7)
          * (0.32 + rays * 0.9);
  v += edge * body * 0.85;
  // An onset ripples the hem AND flares the whole curtain briefly: a
  // substorm brightening, which is the moment worth waiting for.
  return v * (0.5 + drive * 0.9 + kick * 0.5) * wake;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  // A theme with a current travels: the whole texture-space frame — fog,
  // caustics, grain — is carried along u_cur by the flow clock.
  //
  // The current is applied in APERTURE space and scaled afterwards, so a
  // theme's scale cannot change how fast the current appears to run. Added
  // after the scaling (as it was), ocean's water drifted at 1/scale of the
  // speed its own surf travelled — same direction, different pace, which is
  // exactly the "not part of the same physics" the owner saw. Now the fog,
  // the caustics and the crests translate as one body.
  vec2 p = (uv + u_cur * u_flow) * u_scale;

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
  float frostCover = 0.0; // ice's frost: its own channel now, not snow's
  float rays = 0.0; // ditto: light has a colour of its own, not a value
  float foam = 0.0; // ditto again — foam is white, whatever the water is doing
  vec3 wisp = vec3(0.0);
  float iceFlash = 0.0; // struck shards and struck crystals, whitened after the ramp
  float cloud = 0.0;
  float cloudRim = 0.0;
  float bolt = 0.0;
  float boltFlash = 0.0;
  float crystal = 0.0;
  float crystalTint = 0.5;
  vec2 rockP = uv * 3.4;   // the rock's frame, if a theme has rock
  float rockDepth = 1.0;
  float haveRock = 0.0;
  float skyMask = 0.0;  // where ridge says sky is; motifs must not paint weather there
  float ridgeLayer = 0.0; // which range is frontmost here, so its rock rides IT
  float coneDown = 0.0;   // depth below the volcano's skyline
  float coneCrag = 0.0;   // the profile's roughness alone — bends the flows over it
  float coneDescent = 0.0; // how far below the crater rim — how far the lava has run
  float coneOn = 0.0;     // on the cone proper, as opposed to the plain it stands on
  float coneVent = 0.0;   // the crater pool
  float ccrater = 0.0;    // how far inside the crater's mouth this pixel is
  float flockDens = 0.0;  // the flock's coverage
  float moonDisc = 0.0;
  float moonGlow = 0.0;
  float trunks = 0.0;     // the columns' mask, kept for the bark colour below
  float trunkTint = 0.5;  // this trunk's own place on the bark ramp
  float trunkLit = 0.0;   // which way its surface turns, for the cylinder
  vec3 starTint = vec3(1.0);
  float starAmt = 0.0;

  // Where this theme's glints are allowed to be (§14.2). A glint used to be a
  // global overlay multiplied by surface lightness, and the owner's three
  // separate notes about it were all one complaint: the sparkles are obviously
  // not related to the shapes. So a motif that has structure worth catching
  // light now nominates the places — seams for ice, crystal faces for cave,
  // skyward planes for snow — and 'own' says how much to trust it over the
  // old lightness approximation. A theme with no such motif is unchanged.
  float site = 0.0;
  float own = 0.0;

  if (W_clouds > 0.0) {
    float rimv;
    cloud = mClouds(uv, u_t, u_flow, u_weather, rimv) * W_clouds;
    cloudRim = rimv * W_clouds;
  }
  if (W_rays > 0.0) {
    rays = mRays(uv, u_t, u_flow, u_rms, u_pulse, u_centroid, u_canopy) * W_rays;
    // Crepuscular rays: an open sky's shafts are cut by its own cloud, and
    // they blaze where they slip past an edge. This is the real reason
    // sunbeams look like sunbeams — the beam is only visible because
    // something is in the way of the rest of the light.
    rays *= 1.0 - clamp(cloud, 0.0, 1.0) * 0.8;
    rays += cloudRim * 0.35;
    // Less lift than before: the shafts no longer need to climb the ramp to
    // be visible, because they get their own colour below.
    lift += rays * 0.3;
    spec += rays * 0.25;
    // The beam nominates itself as a glint site: MOTES. Dust hanging in the
    // shaft is most of what makes one read as a volume of air rather than a
    // bright stripe, and it is what the forest references show. Only themes
    // that opt in via params.glint get any — sunshine keeps glint 0, so its
    // open sky stays clean — and the site's authority rides the canopy,
    // because dust needs something overhead to fall from.
    site = max(site, clamp(rays, 0.0, 1.0));
    own = max(own, u_canopy * 0.7);
  }
  if (W_dapple > 0.0) lift += mDapple(uv, u_t, u_flow, u_rms) * W_dapple * 0.55;
  if (W_caustics > 0.0) {
    float v = mCaustics(p, u_t);
    lift += v * W_caustics * 0.5;
    spec += v * W_caustics * 1.1;
  }
  if (W_foam > 0.0) {
    float crestLine;
    float v = mFoam(uv, u_cur, u_t, u_flow, u_rms, crestLine);
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
    float v = mDrips(uv, u_t, W_drips, u_slant, u_rms, u_weather, u_pulse, splash);
    // In a cave the passage recedes but the drips fall HERE, at the mouth.
    // Where a tunnel is running they fade toward its far end, instead of
    // crossing full-size in front of geometry that is supposed to be forty
    // feet away — the physics mismatch the owner called out. The centre
    // must match mTunnel's vanishing point.
    if (W_tunnel > 0.0) {
      float nearM = smoothstep(0.1, 0.32, length(uv - vec2(-0.16, -0.07)));
      v *= nearM;
      splash *= nearM;
    }
    // Flat, not scaled by weight — the comment above always said the sparse
    // case has to be as bright as the dense one, but the gain said otherwise
    // and a lone droplet arrived dimmer than the rain it stood in for.
    lift += v * 0.5 + splash * 0.4;
    spec += v * 1.5 + splash * 1.8;
  }
  // The ground. Any theme with something falling in it needs a surface for
  // that thing to arrive on — the rain reads because the water lands.
  // A gentle hill cresting at centre; below it, everything is cut hard
  // toward dark so it is a floor rather than more weather, with a wet sheen
  // at the line where the eye looks to see if water is standing.
  //
  // A TUNNEL DOES NOT GET ONE. The passage already has a floor — its own lower
  // wall, drawn in the passage's own perspective — and a second silhouette laid
  // over that at a fixed height is a different space claiming the same pixels.
  // What the owner saw was "a horizon type arc that weirdly bisects some jagged
  // shapes": the arc is this line, and the jagged shapes it cut in half are the
  // crystals, which are drawn over and through it. Crystals never wanted a
  // floor anyway — they grow out of a wall, they do not fall onto one — so the
  // drips are what asks for it, and only where there is no passage to land in.
  float floorAmt = W_drips * (1.0 - step(0.001, W_tunnel));
  if (floorAmt > 0.0) {
    float groundY = -0.24 - uv.x * uv.x * 0.18;
    mass += smoothstep(groundY + 0.01, groundY - 0.04, uv.y) * floorAmt * 0.55;
    spec += smoothstep(0.02, 0.0, abs(uv.y - groundY)) * floorAmt * 0.3;
  }
  if (W_storm > 0.0) {
    float fl;
    bolt = mStorm(uv, u_t, u_pulse, fl) * W_storm;
    boltFlash = fl * W_storm;
    // The flash lights the whole sky, not just the channel — and the bruise
    // it leaves is in the colour section below.
    lift += boltFlash * 0.5 + bolt * 0.7;
  }
  if (W_columns > 0.0) {
    float ctint, clit;
    trunks = mColumns(uv, u_t, u_flow, ctint, clit) * W_columns;
    trunkTint = ctint;
    trunkLit = clit;
    mass += trunks * 0.78;
    // Round, not flat: the lit flank climbs the ramp and the shadowed one adds
    // to the mass. Small on purpose — a trunk is a dark shape in a mist, and
    // this is the difference between a cut-out and a cylinder, not a spotlight.
    lift += max(clit, 0.0) * W_columns * 0.17;
    mass += max(-clit, 0.0) * W_columns * 0.13;
  }
  float skyward = 0.0; // where snow can lie, filled in by crags or ridge
  if (W_ridge > 0.0) {
    float crest, sky, plume, layer;
    float v = mRidge(uv, u_t, u_flow, clamp(u_rms * 1.7, 0.0, 1.0),
                     crest, sky, plume, layer);
    ridgeLayer = layer;
    // The silhouette replaces the field rather than tinting it: past the
    // ridgeline you are looking at rock, and what is above it is sky.
    //
    // FULLY replaces, at W_ridge and not W_ridge * 0.88. The old factor left
    // about a fifth of the shared fog showing through solid rock, and against
    // a painted sky that reads exactly as the owner described: "glassy edges
    // to the mountains that you can, oddly enough, see the snow drifts
    // through". A mountain is opaque. Whatever is behind it is behind it.
    g = mix(g, v, W_ridge);
    skyward = max(skyward, crest);
    skyMask = sky;
    // Spindrift is snow in the air, so it rides the same overlay snow does.
    snow = max(snow, plume * W_ridge * 0.85);
    spec += plume * W_ridge * 0.7;
    // Weather stays in the sky. Snow has always been fenced by skyMask;
    // clouds were drawn unmasked, so switching them on over a ridge painted
    // white fbm across the summit — the same material as the snow, in the
    // same pixels, which is exactly the "interchangeable" failure the owner
    // warned about. The silhouette itself is the divider: cloud strictly
    // above it, snow strictly below it, spindrift the only crossing.
    cloud *= skyMask;
    cloudRim *= skyMask;
  }
  if (W_cone > 0.0) {
    float csky, cdown, cdesc, cvent, ccrat, con, ccrag;
    float rock = mCone(uv, csky, cdown, cdesc, cvent, ccrat, con, ccrag);
    ccrater = ccrat;
    coneCrag = ccrag;
    coneDown = cdown;
    coneDescent = cdesc;
    coneOn = con;
    coneVent = cvent;
    // Opaque, and the darkest thing in the frame. Same reasoning as the
    // ridgeline's full replacement: past the skyline you are looking at a
    // mountain, and a mountain is not translucent.
    g = mix(g, 0.04, rock * W_cone);
    skyMask = max(skyMask, csky);
    // Weather stays above the skyline, the same fence the ridgeline uses.
    cloud *= csky;
    cloudRim *= csky;
  }
  if (W_crags > 0.0) {
    float upface, joint;
    // Under a ridgeline this is not a motif in its own right — it is the
    // surface of somebody else's geometry, and everything below is about
    // making it belong to that geometry rather than sit in front of it. Each
    // range gets its own patch of the crag map (the offset), at its own cell
    // size (the grain), travelling at its own screen rate (the shift). Get any
    // one of the three wrong and the mountains read as a painted backdrop seen
    // through a fixed craggy window, which is what the owner reported twice.
    float hasRidge = step(0.001, W_ridge);
    // Much finer under a ridge: at the crag motif's own scale the cells read
    // as cobbles laid over a mountain. Rock at that distance is grain.
    //
    // And finer the FURTHER the range: one cell size across all three made the
    // far peaks' rock the same size as the near peaks', which is a flat
    // statement that they are the same distance away. Scale is the strongest
    // depth cue there is, and the crag map was contradicting the parallax with
    // it. Near range 3.75, far range 7.5 — the far one twice as fine.
    float grain = mix(2.6, 7.5 / (1.0 + ridgeLayer * 0.5), hasRidge);
    // CONVERT THROUGH SCREEN SPACE. The two motifs live in different units and
    // the old rate ignored that: it was written in the ridge's x-units and
    // then applied in crag space. A ridge layer's profile is a function of
    // uv.x * (1.5 - L*0.34), so a shift of R in its own units moves the
    // silhouette R / (1.5 - L*0.34) across the SCREEN; the crag map is sampled
    // at uv * u_scale * grain, so the same screen movement needs that figure
    // multiplied back up by u_scale * grain. The factor between them is about
    // 10 for mountain, which is why the rock crawled at a fifth of the speed
    // of the mountain it is supposed to be the surface of — "a stationary
    // craggy window" in front of moving mountains, in the owner's words.
    //
    // Far layer 0.35 x flow, near layer 3.45 x flow: 3x and 6x what it was.
    float lshift = (0.05 + ridgeLayer * 0.11) / (1.5 - ridgeLayer * 0.34)
                 * (u_scale * grain);
    vec2 lofs = vec2(ridgeLayer * 43.0 + u_flow * lshift, ridgeLayer * 19.0);
    // The slow ambient creep belongs to crags standing on their own. Under a
    // ridge it is a second motion the silhouette does not share, so the rock
    // would drift across its own mountain in silence — the same betrayal in
    // miniature, and the one that survives when the music stops.
    float amb = u_t * 0.012 * (1.0 - hasRidge);
    float lit = mCrags(p * grain + vec2(amb, 0.0) + lofs * hasRidge, upface, joint);
    // Textured by the base field, or every plane is a flat plate.
    lit = clamp(lit * (0.7 + 0.55 * f), 0.0, 1.0);
    // Under a ridgeline, crags are the rock's surface and must not repaint the
    // silhouette — and they must stop AT the silhouette: skyMask keeps the
    // texture off the sky, which was craggy too and not so cool (§14).
    float alone = mix(g, lit, W_crags * 0.55);              // crags as the subject
    float surface = mix(g, g * (0.5 + 0.85 * lit), W_crags * (1.0 - skyMask));
    g = mix(alone, surface, hasRidge);
    // The joint is a dark line between two planes. Standing alone that is what
    // makes crags read as rock; laid over a ridgeline at this grain it is a net
    // of thin dark lines at one contrast across the whole frame, which is a
    // crazed pane of glass — "a stationary craggy window", precisely. Under a
    // ridge the shading carries the rock and the lines mostly get out of the way.
    mass += joint * W_crags * 0.3 * (1.0 - skyMask) * mix(1.0, 0.3, hasRidge);
    // Crag faces may seed snow only when crags carry the scene alone: under
    // a ridge the crest decides, or upward faces in the SKY grow drifts that
    // read as holes with snow on the far side.
    skyward = max(skyward, upface * (1.0 - hasRidge));
  }
  // Cave's one lamp. Hoisted above the tunnel because the rock and the quartz
  // must be lit by the SAME vector — its angle is pitch, so the low end of the
  // keyboard finds different faces than the top does, and it swings further
  // the longer you play.
  float caveLa = u_centroid * 4.2 + u_flow * 0.9;
  vec2 caveLight = vec2(cos(caveLa), sin(caveLa));

  if (W_tunnel > 0.0) {
    float face, joint, flare;
    float lit = mTunnel(uv, u_t, u_pulse, clamp(u_sparkle, 0.0, 1.0), caveLight,
                        face, joint, flare, rockP, rockDepth);
    haveRock = 1.0;
    lit = clamp(lit * (0.72 + 0.5 * f), 0.0, 1.0);
    // The rock now REPLACES the field rather than tinting it. Mixing left
    // the base fog glowing between the cells, and a lit field behind faceted
    // shapes is precisely a stained-glass window: bright stuff seen THROUGH
    // gaps in dark stuff. A cave is the opposite — the stone is what there
    // is, and every bit of light in it has a source you can point at.
    g = mix(g * 0.35, lit, W_tunnel * 0.95);
    mass += joint * W_tunnel * 0.3;
    spec += face * W_tunnel * (0.12 + u_sparkle * 0.5);
    own = max(own, W_tunnel);
  }
  if (W_crystals > 0.0) {
    float faceGlow;
    // The light that finds them. Its ANGLE is pitch — so the low end of the
    // keyboard lights a different set of faces than the top does — and it
    // swings further as you keep playing. This is the whole mood: you are
    // not lighting the cave, you are catching different quartz with every
    // phrase.
    //
    // Both terms ride the travel clock, and cave carries a travel rate for
    // this and nothing else (its current is zero, so nothing is advected). It
    // had none, which quietly killed both halves of the design: u_flow was
    // pinned at 0, so the light never swung past whatever the centroid gave
    // it, and floor(selClock) never left its first epoch — the same clusters
    // were nominated forever. A clock that does not advance is not a clock.
    float pool;
    // The same vanishing point mTunnel uses. If these ever disagree the
    // crystals sit in a different passage from the rock.
    crystal = mCrystals(uv, vec2(-0.16, -0.07), u_t, u_flow * 0.5, caveLight,
                        u_pulse, clamp(u_sparkle, 0.0, 1.0), u_centroid,
                        crystalTint, faceGlow, pool);
    // Fade into the passage with the rock they grow on.
    crystal *= mix(1.0, rockDepth, haveRock) * W_crystals;
    lift += crystal * 0.5;
    spec += faceGlow * W_crystals * (0.6 + u_sparkle * 1.4 + u_pulse * 1.8);
    site = max(site, faceGlow);
    own = max(own, W_crystals);

    // NOTHING IS LIT BUT WHAT THE LIGHT FINDS. The owner's brief: you should
    // not be able to see anything in the cave by default, and when something
    // is illuminated you see the crystals there AND the rock around them.
    // Until now the passage was evenly visible and only the quartz responded,
    // which is why the crystals read as switching on and off rather than as
    // being revealed — a lamp lights the wall it is pointed at, and this one
    // lit nothing.
    //
    // Applied to the rock after the tunnel has drawn it, so the pool carves
    // the darkness back rather than the tunnel having to know about crystals.
    if (W_tunnel > 0.0) {
      float seen = clamp(pool, 0.0, 1.0);
      g *= mix(0.08, 1.0, seen);
      // The pool has to LIGHT the rock, not merely fail to darken it. Leaving
      // g alone inside the pool still left the wall reading as unlit stone at
      // the palette's dark end, so the halo looked like a coloured smudge
      // rather than a lamp finding a wall. Lift carries it up the ramp and
      // spec puts a wet sheen where the light actually lands, which is what
      // makes the surrounding rock legible — the owner's whole point.
      lift += seen * seen * 0.30 * W_tunnel;
      spec += seen * seen * 0.26 * W_tunnel * (0.5 + u_sparkle * 0.8);
    }
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
    // CAPS, and by ALTITUDE. Driving coverage off the crest band alone gave a
    // fixed-width white stroke hugging every ridgeline — piping on a cake, not
    // a snowfield, because crest is a constant offset below the line whatever
    // the terrain does. Real snow is an altitude phenomenon: everything above
    // the line is white, everything below is rock, and the boundary between
    // them wanders with the ground.
    float tear = fbm(p * 4.6 + 5.0 + vec2(u_flow * 0.7 + u_t * 0.02, -u_flow * 0.08));
    // The snowline itself, made ragged by noise so it crosses the range as a
    // torn edge instead of a horizontal cut.
    // The line sits HIGH. A first pass put it near the middle of the aperture
    // and the ranges came out white to their feet — no rock left to be a
    // mountain, and the summits lost against a pale sky, which is a different
    // way of failing than the piping was. Snow is the exception on this
    // silhouette, not the rule: only the top of the frame is above it.
    float alt = uv.y * 2.2 + (tear - 0.5) * 0.4;
    float s = smoothstep(0.26, 0.64, alt);
    // Upward faces hold more of it than steep ones — the crest band earns its
    // keep here, as a bias rather than as the gate.
    s *= mix(0.45, 1.0, clamp(base, 0.0, 1.0));
    // And genuinely torn at the lower edge, where a cap frays into gullies.
    // At smoothstep(0.20, 0.54) this passed everything and did nothing.
    s *= smoothstep(0.34, 0.64, tear + s * 0.22);
    // Never in the sky. Hard, not smooth: at the silhouette the snow noise
    // lives in warped texture space while the edge lives in screen space, so
    // a soft mask let flecks of drift sit just outside the rock — which reads
    // as seeing the snow THROUGH the mountain's edge.
    s *= 1.0 - smoothstep(0.0, 0.3, skyMask);
    snow = max(snow, s * W_snow);
    spec += s * W_snow * 0.4;
    site = max(site, s);
    own = max(own, W_snow * 0.8);
  }
  if (W_wisps > 0.0) wisp = mWisps(uv, u_t, W_wisps, u_flow, clamp(u_sparkle, 0.0, 1.0)) * W_wisps;
  if (W_stars > 0.0) {
    vec3 stint;
    float s = mStars(uv, u_t, W_stars, u_pulse, stint);
    // Stars are in the SKY. This was unfenced, so wherever a mood had both
    // stars and a silhouette they were scattered across the ground as well —
    // "the stars should only be in the sky, not on the sand too". Every other
    // sky-borne motif is already fenced by skyMask; this one was missed
    // because night, the mood it was written for, has no silhouette to be
    // wrong about. Moods with no silhouette leave skyMask at 0 and are
    // unchanged.
    float above = (W_ridge > 0.0 || W_cone > 0.0)
                ? clamp(skyMask, 0.0, 1.0) : 1.0;
    s *= above;
    lift += s * 0.42;
    // Less of the specular channel than before, because the stars now carry a
    // colour of their own (below) and u_c4 was making every one of them the
    // palette's top step — one temperature for a whole sky.
    spec += s * 0.55;
    starTint = stint;
    starAmt = s;
  }
  if (W_moon > 0.0) {
    float mg;
    moonDisc = mMoon(uv, mg) * W_moon;
    moonGlow = mg * W_moon;
    // The moon lights the sky it hangs in.
    lift += moonGlow * 0.30;
  }
  if (W_flock > 0.0) {
    // The one place the flock's cost is paid, and only this mood pays it.
    // mFlock early-outs in open sky before any tracing happens, and the
    // gradient now comes out of the quad rather than out of two more traces.
    flockDens = mFlock(uv, u_t, clamp(u_rms, 0.0, 1.0), clamp(u_pulse, 0.0, 1.0))
              * W_flock;
  }
  float lava = 0.0;
  float lavaHot = 0.0;
  float lavaSkin = 0.0;
  if (W_lava > 0.0) {
    float h, sk;
    lava = mLava(uv, u_t, u_flow, u_rms, u_pulse, coneDescent, coneCrag, h, sk) * W_lava;
    lavaHot = h * W_lava;
    lavaSkin = sk;
    // THE VENT. A flow is what you see; the crater is where it comes from, and
    // without a source the streams read as fires that started halfway down.
    if (W_cone > 0.0) {
      // Two churns crossed, so the surface boils rather than scrolling: one
      // travelling across the pool and one up it, at rates that do not divide.
      // A single scrolling field reads as a conveyor of lava, not a pool.
      float churn = fbm(vec2(uv.x * 9.0 - u_t * 0.30, coneDescent * 7.0 - u_t * 0.44))
                  * 0.6
                  + fbm(vec2(uv.x * 15.0 + u_t * 0.21, coneDescent * 4.0 + u_flow * 0.5))
                  * 0.4;
      // Brim-full and bright. A pool is molten all the way across — no
      // threshold, unlike the flows, which are what is left of it downhill.
      float pool = coneVent * (0.46 + 0.42 * churn)
                 * (0.62 + u_rms * 0.30 + u_pulse * 0.45);
      lava = max(lava, pool * W_lava);
      // Less of the white-hot step across the summit. At 0.55 the whole crater
      // surface reached the fresh-gush colour at once and the mountain came out
      // wearing a pale band — icing on a cake, and the one shape this mood
      // cannot afford. A pool is orange with hotter cracks in it, so the heat
      // rides the churn instead of covering the lot.
      lavaHot = max(lavaHot, pool * W_lava * (0.10 + 0.40 * churn));
      // THE OVERFLOW: the pool seen going somewhere, or it is a lit bowl with
      // unrelated fires burning below it. Just outside the crater lip the
      // flows are pulled up hard, so streams leave from the brim itself.
      //
      // coneDown, not coneDescent, is what says "below the surface here".
      // Descent is measured from the rim's HEIGHT, so it is negative
      // everywhere in the sky above the summit — gated on that alone this
      // painted a column of lava straight up out of the crater into the night.
      float lip = smoothstep(0.22, 0.80, ccrater) * (1.0 - smoothstep(0.86, 1.0, ccrater));
      float spill = lip
                  * smoothstep(0.34, 0.02, coneDescent)
                  * smoothstep(-0.002, 0.02, coneDown);
      lava = max(lava, spill * (0.55 + 0.45 * churn) * W_lava);
      lavaHot = max(lavaHot, spill * 0.5 * W_lava);
    }
    // FENCED LAST, so that everything above — flows, pool and overflow alike —
    // is subject to it. Applied before the vent was added, it fenced only the
    // flows and let the pool paint wherever its own terms happened to be
    // non-zero. Never above the skyline, and where there is a cone, kept on
    // the cone rather than running out across the plain it stands on.
    float onRock = 1.0 - clamp(skyMask, 0.0, 1.0);
    onRock *= mix(1.0, 0.12 + 0.88 * coneOn, step(0.001, W_cone));
    lava *= onRock;
    lavaHot *= onRock;
    // Molten rock lights the slope it is running down.
    lift += lava * 0.22;
  }
  if (W_ripples > 0.0) {
    // Sand is a SURFACE, so its combing goes into the field rather than over
    // it: the ripples have to be lit by the same light as the dune they lie
    // on, or they read as a pattern printed on the sand.
    float rip = mRipples(uv, u_t, u_flow, u_rms, ridgeLayer) * W_ripples;
    // FENCED TO THE SAND, AND TO THE NEAR DUNE ONLY.
    //
    // Giving the motif a per-layer patch of field was half the cure and read as
    // none of it, because nothing kept the result off the layers it did not
    // belong to. Two fences were missing:
    //
    // The sky. Every other surface motif is held below the silhouette by
    // skyMask and this one never was, so wherever a dune's crest dipped, the
    // combing carried straight on across the sky above it. That is what makes
    // it read as one flat overlay laid over the whole picture rather than as
    // something lying on the ground — and it is the same omission mStars had.
    //
    // The far ranges. Even correctly fenced, ribbing on all three layers gives
    // three sheets of corduroy at three scales, and the eye cannot tell which
    // is nearer from that. The owner's call settles it: "I'm fine with the
    // ripples only affecting the front layer anyway". So the near dune is
    // combed and the ones behind it are smooth sand — which is also true, since
    // ripples fall below resolving distance long before a dune does. The step
    // is hard on purpose: the boundary IS the near dune's own crest line, and a
    // ripple pattern that stops dead at it is the perspective cue.
    rip *= (1.0 - clamp(skyMask, 0.0, 1.0)) * step(1.5, ridgeLayer);
    g = clamp(g + (rip - 0.5) * 0.22, 0.0, 1.0);
    spec += rip * 0.22 * (0.4 + u_sparkle * 0.6);
  }
  float petals = 0.0;
  float petalTint = 0.5;
  if (W_petals > 0.0) {
    petals = mPetals(uv, u_t, W_petals, u_leaf, u_rms, u_pulse, u_flow, petalTint);
  }
  float flame = 0.0;
  float flameCore = 0.0;
  float embers = 0.0;
  float smoke = 0.0;
  float smokeLit = 0.0;   // the part of the plume still inside the firelight
  if (W_flame > 0.0) {
    float c;
    flame = mFlame(uv, u_t, u_flow, u_rms, u_pulse, c) * W_flame;
    flameCore = c * W_flame;
    // A fire lights what is around it. The seat glows, the rest of the frame
    // does not — which is the whole of "small fire in the dark".
    // The glow follows the seat. Left at -0.30 it sat well above the fire's
    // new base and lit the middle of the frame instead of the bottom of it.
    vec2 gd = (uv - vec2(0.0, -0.50)) * vec2(1.0, 0.72);
    float glow = exp(-dot(gd, gd) * 4.2);
    lift += glow * W_flame * (0.22 + u_rms * 0.3);
  }
  if (W_embers > 0.0) {
    embers = mEmbers(uv, u_t, u_flow, W_embers, u_rms, u_pulse);
  }
  if (W_smoke > 0.0) {
    // Fire's plume starts just above its flame; volcano's leaves the crater.
    float smokeSrc = W_cone > 0.0 ? CONE_RIM : 0.04;
    smoke = mSmoke(uv, u_t, u_flow, W_smoke, u_rms, smokeSrc, smokeLit);
    // Never in front of the flame. The plume's root and the fire's tip share
    // the same space, and smoke composited as a darkening over that overlap
    // takes a dark bite out of the middle of the flame — which is the one
    // place a fire must be solid. Smoke is what has stopped burning; it goes
    // behind what still is.
    float behind = 1.0 - clamp(flame * 1.6, 0.0, 1.0);
    smoke *= behind;
    smokeLit *= behind;
    // Smoke is opaque: it hides what is behind it rather than glowing.
    mass += smoke * 0.35;
  }
  float aur = 0.0;
  float aurHigh = 0.0;
  if (W_aurora > 0.0) {
    aur = mAurora(uv, u_t, u_rms, u_pulse, u_centroid, aurHigh) * W_aurora;
  }
  if (W_facets > 0.0) {
    float seam, flare;
    float shard = mFacets(p * 1.4, u_t, u_pulse, clamp(u_sparkle, 0.0, 1.0), u_centroid, seam, flare);
    g = mix(g, shard, W_facets * 0.4); // flatten the field into shards
    lift += seam * W_facets * 0.3;
    // The seams are where ice catches light, so that is where the music goes:
    // frozen geometry, moving highlights — and on an onset, whole shards.
    spec += seam * W_facets * (0.5 + u_rms * 1.8) + flare * W_facets * 1.6;
    iceFlash = max(iceFlash, flare * W_facets);
    // Frost crawls over the shards, patch by patch, and every onset cracks
    // it further out. It seeds from the seams, where real frost starts.
    // Scale, judged against the references and nothing else. 0.55 put about
    // two spine cycles across the frame — a handful of enormous ferns, where
    // both references are dense with small ones. 1.7 overshot into dust, which
    // is the failure frond() already warns about: below a certain size the
    // filaments stop being continuous and read as scratches on the glass.
    float frost = mFrost(p * 1.05, u_flow) * W_facets;
    frost = clamp(frost + seam * 0.25 * frost, 0.0, 1.0);
    // Frost used to ride the snow channel at 0.45 weight, and snow blends at
    // 0.88 — a ceiling of ~40% of the way to the pale step however hard the
    // frost grew, inherited from a blend tuned for lying snow on mountain
    // rock. The references make frost the SUBJECT: near-white ferns over
    // dark ice. Its own channel, its own strength; the dark ground the
    // filaments need survives because the growth front only ever passes the
    // top slice of the field.
    frostCover = frost;
    spec += frost * 0.3;
    site = max(site, frost);
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
  // The top step is a fixed part of the ramp now. It used to be gated by
  // loudness — a whole-field brightening on every mood at once — and that was
  // the same mistake as the onset ring: one generic response competing with
  // eight specific ones. A mood should answer the music with ITS OWN
  // material, not by turning the lights up. (brightRms is gone with it.)
  col = mix(col, u_c4, smoothstep(0.78, 1.0, g) * 0.55);
  // Sunbeams carry their own colour instead of riding the value ramp. Routed
  // through g, a shaft's core climbed past the top step and came out white,
  // while the ramp's warm band stayed wherever the base fog happened to sit —
  // so the gold appeared as blotches BETWEEN the rays rather than in them.
  // Same reasoning as snow below: light of a particular colour is a material,
  // not a brightness.
  col = mix(col, mix(u_c3, u_c4, 0.3), clamp(rays * 1.15, 0.0, 1.0) * 0.9);
  // Clouds: a pale body veiling whatever is behind it, and a rim of the
  // palette's gold on every edge that faces the sun — the billow is lit by
  // the same light the rays are made of, which is what keeps it one sky.
  // Aerial perspective in COLOUR. The shade term inside mRidge walks far
  // ranges up the brightness ramp, which leaves them paler but still fully
  // coloured; the reference's far ridges have lost their colour to the sky,
  // not just their darkness. ridgeLayer already knows which range is
  // frontmost at this pixel, so haze is a lerp toward the pale steps keyed
  // on it — the far range mostly sky-tint, the near one almost untouched.
  // Fenced to ridge moods; skyMask keeps it off the sky itself.
  if (W_ridge > 0.0) {
    // THE SKY. Its own colour, not the ramp's dark end — the same licence snow
    // and the aurora take, and for the same reason: a cold thin sky is a
    // material, and no arrangement of a rock palette produces one. Without
    // this the space above the ridgeline was whatever the fog field happened
    // to be doing, which is the "generic darkness" the owner asked to be rid
    // of. Mountain is a DAYTIME mood now.
    //
    // Thin air is the whole brief. Little scattering high up, so the zenith
    // keeps a deep cold blue; a lot of it near the horizon, so the base of the
    // sky washes out almost to white and the far ridges dissolve into it.
    // That gradient is what altitude looks like, and it is deliberately paler
    // and less saturated than a sea-level sky would be.
    vec3 skyHigh = vec3(0.38, 0.56, 0.80);
    vec3 skyLow = vec3(0.86, 0.91, 0.96);
    float up = clamp(uv.y * 1.15 + 0.42, 0.0, 1.0);
    vec3 sky = mix(skyLow, skyHigh, up * up);
    col = mix(col, sky, clamp(skyMask, 0.0, 1.0) * W_ridge);

    // Aerial perspective in COLOUR, on the rock only. The shade term inside
    // mRidge walks far ranges up the brightness ramp, which leaves them paler
    // but still fully coloured; distance takes the colour out too, and hands
    // back the sky's. Keyed on which range is frontmost here, so the far one
    // half dissolves and the near one is barely touched.
    // Held well short of dissolving the far range entirely: at 0.62 it took
    // so much colour out that the back of the chain stopped being rock.
    float hazeAmt = clamp(0.42 - ridgeLayer * 0.19, 0.0, 1.0)
                  * (1.0 - clamp(skyMask, 0.0, 1.0)) * W_ridge;
    col = mix(col, skyLow, hazeAmt);
  }
  if (W_cone > 0.0) {
    // A NIGHT sky, and its own material for the same reason mountain's is:
    // no arrangement of a basalt palette makes a sky, and left to the shared
    // fog field the space above the cone is the "generic darkness" that got
    // ruled out once already. Volcano inherited mountain's sky by inheriting
    // its motif — a pale blue thin-air gradient, in a mood that is supposed to
    // be at night, which is most of why it read as a mountain range.
    //
    // Deep and cold overhead, warming toward the summit rather than toward the
    // horizon: the light in this sky comes from the vent, so the gradient is
    // anchored to the mountain and not to the frame.
    vec3 nightHigh = vec3(0.016, 0.020, 0.052);
    vec3 nightLow = vec3(0.055, 0.045, 0.070);
    float up = clamp(uv.y * 1.1 + 0.45, 0.0, 1.0);
    vec3 nsky = mix(nightLow, nightHigh, up * up);
    // The eruption lights the underside of the sky above the crater. Keyed on
    // distance from the vent, so it is a glow ON something rather than an
    // overall brightening, and it answers the playing through the same pulse
    // the flows do.
    vec2 toVent = (uv - vec2(0.0, 0.30)) * vec2(0.75, 1.5);
    float ventGlow = exp(-dot(toVent, toVent) * 5.0)
                   * (0.35 + u_rms * 0.5 + u_pulse * 0.8);
    nsky += vec3(0.55, 0.20, 0.06) * ventGlow;
    col = mix(col, nsky, clamp(skyMask, 0.0, 1.0) * W_cone);
  }
  if (W_flock > 0.0) {
    // DUSK, painted as its own material for the reason mountain's sky and
    // volcano's are: a five-step ramp driven by a fog field makes haze, not a
    // sky, and this mood is a silhouette against a sky — if the backdrop is
    // flat there is nothing for the flock to be a silhouette ON.
    //
    // "a dark dusky sanguine purple sky": the last of the light low down and
    // sanguine with it, going bruised violet through the middle and nearly
    // black overhead, which is where the stars are.
    vec3 duskLow = vec3(0.42, 0.13, 0.16);
    vec3 duskMid = vec3(0.22, 0.08, 0.22);
    vec3 duskTop = vec3(0.045, 0.020, 0.075);
    float up = clamp(uv.y * 1.05 + 0.46, 0.0, 1.0);
    vec3 dusk = mix(duskLow, duskMid, smoothstep(0.0, 0.44, up));
    dusk = mix(dusk, duskTop, smoothstep(0.38, 0.95, up));
    col = mix(col, dusk, W_flock * 0.92);
  }
  if (W_moon > 0.0) {
    // Its own colour, like the aurora's and the snow's: moonlight is not a
    // step on a dusk palette, and mixing it from one gives a pink moon.
    col += vec3(0.95, 0.93, 0.88) * clamp(moonGlow, 0.0, 1.0) * 0.42;
    col = mix(col, vec3(0.97, 0.95, 0.90), clamp(moonDisc, 0.0, 1.0));
  }
  col = mix(col, mix(u_c2, u_c4, 0.45), clamp(cloud, 0.0, 1.0) * 0.5);
  col += mix(u_c3, u_c4, 0.35) * clamp(cloudRim, 0.0, 1.0) * 0.85;
  // BARK. Its own colour, like the aurora's and the quartz's, and for the same
  // reason: dead standing timber is bleached bone in places and a pale dusty
  // brown in others, and no arrangement of a grey palette holds both. The
  // owner's note on barren — "there have to be more interesting ways to convey
  // the idea of a barren, dry forest than just... make it white" — is really
  // two asks, and this is both of them: the trunks get their own material, and
  // neighbouring trunks differ, which is what makes a stand read as trees
  // rather than as a bar chart of one colour.
  //
  // Off by default (params.bark), because a wood that still has light and
  // leaves in it does not want its trunks picked out — there the columns are
  // silhouettes and should stay that way.
  if (u_bark > 0.0) {
    vec3 bone = vec3(0.84, 0.83, 0.80);
    vec3 wood = vec3(0.52, 0.42, 0.33);
    vec3 bark = mix(bone, wood, smoothstep(0.34, 0.66, trunkTint));
    // Shaded by the same cylinder term the mass uses, so the colour lies on a
    // round surface instead of filling a flat cut-out.
    bark *= 0.60 + 0.55 * (0.5 + trunkLit * 0.5);
    col = mix(col, bark, clamp(trunks, 0.0, 1.0) * u_bark);
  }

  // Snow lies over the palette, mixing the two brightest steps so it reads as
  // lit crust rather than blown-out highlight.
  col = mix(col, mix(u_c3, u_c4, 0.72), clamp(snow, 0.0, 1.0) * 0.88);
  // Frost is whiter than snow — filaments read by contrast against the dark
  // ice, and they are allowed nearly the whole distance to the top step.
  col = mix(col, mix(u_c3, u_c4, 0.9), clamp(frostCover, 0.0, 1.0) * 0.85);
  // Foam is white water, not bright water — same rule as snow and rays.
  col = mix(col, mix(u_c3, u_c4, 0.8), clamp(foam, 0.0, 1.0) * 0.75);
  // A struck shard goes toward white in one step — lightning inside the ice,
  // not a warmer shade of the ramp.
  col = mix(col, mix(u_c3, u_c4, 0.85), clamp(iceFlash, 0.0, 1.0) * 0.85);
  // Quartz colour is the mineral's own, not the palette's — the same licence
  // the aurora and the snow take. A seam is not one mineral: amethyst,
  // clear, smoky, citrine, a rare aqua, and which one a cluster is stays
  // fixed while the light swings across it.
  vec3 qz = mix(vec3(0.62, 0.45, 0.95), vec3(0.88, 0.93, 1.0),
                smoothstep(0.0, 0.35, crystalTint));
  qz = mix(qz, vec3(0.55, 0.5, 0.58), smoothstep(0.45, 0.6, crystalTint));
  qz = mix(qz, vec3(1.0, 0.85, 0.5), smoothstep(0.68, 0.8, crystalTint));
  qz = mix(qz, vec3(0.5, 0.9, 0.92), smoothstep(0.9, 0.97, crystalTint));
  // Soft rolloff, not a hard clamp. clamp() at 1.4 meant any face catching the
  // lamp went to flat white and took the mineral's colour with it — amethyst,
  // citrine and aqua all arrived as the same blown highlight, which is both
  // uglier and less like quartz than letting the colour survive the brightness.
  col += qz * (1.0 - exp(-crystal * 1.35)) * 0.9;
  // Storm. The bolt is very nearly white; the flash lifts the whole sky and
  // leaves the bruised blue-violet that says a big one just went off behind
  // the cloud, and low, dark playing keeps that bruise in the air.
  col = mix(col, vec3(0.9, 0.93, 1.0), clamp(bolt, 0.0, 1.0) * 0.95);
  col += vec3(0.62, 0.66, 0.85) * clamp(boltFlash, 0.0, 1.0) * 0.5;
  if (W_storm > 0.0) {
    col = mix(col, col * vec3(0.88, 0.86, 1.12),
              W_storm * (1.0 - smoothstep(0.3, 0.62, u_centroid)) * 0.55);
  }
  // The aurora is a veil of the palette's mid colour hung in front of the
  // dark; taking c2/c3 rather than the white step keeps the stars on top.
  // Aurora colour is the motif's OWN, not the theme palette's — the same
  // licence snow takes by being white. A palette-tinted aurora over a blue
  // sky is a slightly bluer blue, which is why it was so hard to see at all.
  // Green low, red-violet high (that gradient is altitude, physically), and
  // pitch slides the whole curtain along it: bass playing keeps it a low
  // green wash, the top of the piano throws violet up the sky.
  vec3 aurLow = vec3(0.25, 1.0, 0.55);    // oxygen green
  vec3 aurMid = vec3(0.35, 0.85, 0.95);   // green into cyan
  vec3 aurTop = vec3(0.85, 0.35, 0.95);   // the rarer red-violet crown
  float band = clamp(aurHigh * 0.75 + (u_centroid - 0.42) * 1.5, 0.0, 1.0);
  vec3 aurTint = mix(mix(aurLow, aurMid, smoothstep(0.0, 0.55, band)),
                     aurTop, smoothstep(0.5, 1.0, band));
  // Additive and generous. At 0.75 of a clamped value the curtain could never
  // be brighter than the stars behind it, which is backwards on the nights
  // worth looking at.
  col += aurTint * clamp(aur, 0.0, 1.4) * 1.05;
  // Stars carry their own temperature rather than the palette's top step. One
  // colour for every star in a sky is the thing that makes a starfield read as
  // a texture; the variation is small — these are all near white — and it is
  // exactly the amount the eye needs to stop seeing a lattice.
  col += starTint * clamp(starAmt, 0.0, 1.0) * 0.85;
  // The bow goes on last, over the weather it belongs to. Additive, because
  // it is light in the air rather than a surface — and it reads best against
  // the dark cloud a passing storm leaves behind, which is the whole reason
  // it belongs to rain.
  if (W_rainbow > 0.0) {
    float bowAmt;
    vec3 bow = mRainbow(uv, u_t, u_rms, u_pulse, u_centroid, u_slant, bowAmt);
    col += bow * bowAmt * W_rainbow * 1.25;
  }
  // LAVA. Blackbody again, and hotter than fire at its core because it is
  // material rather than flame: dull red where the crust is thick, orange in
  // the channel, and near-white in a fresh gush.
  if (W_lava > 0.0) {
    vec3 crust = vec3(0.55, 0.09, 0.02);
    vec3 run = vec3(1.0, 0.42, 0.06);
    vec3 fresh = vec3(1.0, 0.93, 0.66);
    vec3 lc = mix(crust, run, smoothstep(0.0, 0.55, lava));
    lc = mix(lc, fresh, smoothstep(0.25, 0.9, lavaHot));
    // THE CHARRED SKIN, over the top of the ramp. Lava is a black solid with
    // light in its cracks, and a stream drawn as one continuous glow is the
    // thing that reads as a lit stick rather than as molten rock. Plates of
    // near-black basalt ride the flow (they are advected in the channel's own
    // frame, so they travel with it), and where a plate thins or tears the
    // orange comes back through — which is the gooeyness: a bright fluid
    // visibly carrying dark solids, rather than a uniform bright band.
    lc = mix(lc, vec3(0.055, 0.032, 0.038), clamp(lavaSkin, 0.0, 1.0) * 0.88);
    col += lc * clamp(lava, 0.0, 1.0) * 1.2;
  }
  // PETALS take their colour from the palette's upper steps, spread by each
  // petal's own hash — so one motif is blossom under one theme and dead leaves
  // under another, without the engine knowing which.
  if (W_petals > 0.0) {
    vec3 pc = mix(u_c2, u_c3, smoothstep(0.0, 0.6, petalTint));
    pc = mix(pc, u_c4, smoothstep(0.55, 1.0, petalTint));
    col = mix(col, pc, clamp(petals, 0.0, 1.0) * 0.92);
  }
  // FIRE. Its own colours, like the aurora and the quartz — deep red at the
  // torn edges, orange through the body, and a white heart at the seat. No
  // palette holds a blackbody ramp, and a fire tinted from one reads as
  // coloured fog rather than as something burning.
  if (W_flame > 0.0 || W_embers > 0.0) {
    vec3 hot = vec3(1.0, 0.95, 0.82);
    vec3 mid = vec3(1.0, 0.55, 0.13);
    vec3 low = vec3(0.72, 0.13, 0.03);
    float f = clamp(flame, 0.0, 1.0);
    vec3 fireCol = mix(low, mid, smoothstep(0.10, 0.55, f));
    // Only the very hottest goes to white. Ramped from zero, any part of the
    // body with a little core in it was already most of the way to the pale
    // step, and with more of the flame in frame that turned the whole lower
    // half into one saturated shape — colour is what carries a fire's volume.
    fireCol = mix(fireCol, hot, smoothstep(0.15, 0.85, flameCore));
    col += fireCol * f * 1.05;
    // Embers cool as they rise: bright orange at the seat, dull red up high.
    vec3 sparkCol = mix(vec3(1.0, 0.72, 0.30), vec3(0.85, 0.22, 0.06),
                        smoothstep(-0.25, 0.4, uv.y));
    col += sparkCol * embers * 1.5;
  }
  // Smoke last, over the fire that made it, taking the palette's low steps —
  // it is the one thing here that is genuinely the colour of the surroundings.
  if (W_smoke > 0.0) {
    col = mix(col, mix(u_c1, u_c2, 0.55), clamp(smoke, 0.0, 1.0) * 0.5);
    // and the low plume glows with what is burning under it.
    col += mix(u_c2, u_c3, 0.6) * clamp(smokeLit, 0.0, 1.0) * (0.55 + u_rms * 0.5);
  }
  col += u_c4 * clamp(spec, 0.0, 1.0) * (0.16 + u_gloss * 0.5);
  // Wisps are their own small light sources, added rather than mixed: they
  // sit in front of the trunks and the mist, and nothing behind them dims
  // them. Each arrives already carrying its own colour from mWisps.
  col += clamp(wisp, vec3(0.0), vec3(1.5)) * 0.9;

  vec3 matter = texture2D(u_tex, q + r * 0.25).rgb;
  col = mix(col, col * matter * 1.7, u_texAmt);

  // Glints belong to the geometry (§14.2). Lightness-under-the-glint was only
  // ever an approximation of "is there something here to catch the light", and
  // it approximated badly: a lit patch of fog got sparkles, a crystal face got
  // them only by luck. Where a motif has nominated its own sites, those win —
  // and the density is raised there, because a site is a small part of the
  // aperture and the same count of glints spread over it is nothing. Themes
  // with no structural motif keep the old behaviour exactly.
  // Glints are OPT-IN now (params.glint). SCATTERED specks read as dust on
  // the lens — that failure stands — but pinned to a motif's own sites they
  // are material: frost seams, crystal faces, and the forest's sunbeams,
  // where the rays nominate their own column of air and the glints become
  // motes drifting in it. Sunshine still opts out: an open sky has nothing
  // for dust to hang under.
  if (u_glint > 0.0) {
    float where = mix(smoothstep(0.12, 0.6, g),
                      max(clamp(site, 0.0, 1.0), 0.15) * smoothstep(0.04, 0.32, g),
                      own);
    float glint = mGlint(uv * 30.0, u_t, u_glint, 0.35 + u_sparkle * 1.4);
    col += glint * u_c4 * where * 0.9;
  }

  // No onset ring here. An expanding circle was the whole of the engine's
  // answer to an onset back when a theme was a palette and a fog, and it read
  // as a generic ripple laid over everything. Now every mood spends the onset
  // envelope on its own gesture — rays leap, shards flash, a meteor falls,
  // splashes burst — and a circle on top of that is a leftover that fights
  // them. u_pulse is still very much alive; only the overlay is gone.
  // THE FLOCK IS A SILHOUETTE, so it goes on last — over the sky, and over
  // the moon, which is most of when you actually see a murmuration clearly.
  // Not quite black: birds against a lit dusk keep a little of the sky in
  // them, and pure black reads as a hole cut in the picture.
  if (W_flock > 0.0) {
    vec3 birds = mix(vec3(0.045, 0.040, 0.060), u_c1, 0.18);
    col = mix(col, birds, clamp(flockDens, 0.0, 1.0) * 0.96);
  }

  float d = length(uv);
  col *= 1.0 - 0.28 * d * d;   // slight vignette; the eye's socket supplies the rest
  col *= u_open;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither against banding

  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULT_PARAMS = { ...THEME_DEFAULT_PARAMS };
// TWO crossfades, because there are two transitions and one constant was
// serving both.
//
// Between kin (themes.js KIN) nothing closes: the rain goes on falling while
// the palette and the motif weights lerp underneath it, and the slowness IS
// the effect — a season turning, watched. That one stays long.
//
// Between unrelated moods the eye closes, and the crossfade is not something
// to watch but something to hide: two moods that share no motifs pass through
// configurations belonging to neither. At 2.2s against a 0.92s lid, 71% of
// that dissolve happened with the eye fully open — "I'm still seeing a lot of
// the fading between". Shortened here and covered by a longer hold in eye.js,
// so the swap happens where it was always meant to: unseen.
const KIN_MORPH_SECONDS = 2.2;
const CUT_MORPH_SECONDS = 0.75;
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
// WEATHER. Everything above answers a note or a phrase; this answers a
// passage. Rainfall going from drizzle to storm on a 0.18s follower would
// change the weather several times a bar, which is the owner's own worry
// about the idea — "that might make it too fickle" — and they were right.
// The answer is not less response but response with inertia.
//
// Asymmetric on purpose: weather gathers faster than it disperses. A storm
// builds while you work and takes its time clearing after you stop, which is
// what makes it read as weather rather than as a level meter with a long wire.
const WEATHER_RISE_TAU = 6.0;
const WEATHER_FALL_TAU = 20.0;

// One per renderer instance; seeded to IDLE's values so the first frame after
// a theme load does not lurch in from zero.
function createMotionSmoother() {
  const v = { warp: 0, shift: 0.4, light: 0, weather: 0 };
  return (f, dt) => {
    v.warp += (f.bass - v.warp) * (1 - Math.exp(-dt / GEOM_TAU));
    v.shift += (f.centroid - v.shift) * (1 - Math.exp(-dt / SHIFT_TAU));
    // Faster than the geometry pair: this one shapes motifs that are allowed
    // to answer a phrase, just not a single frame's worth of extraction noise.
    v.light += (f.rms - v.light) * (1 - Math.exp(-dt / LIGHT_TAU));
    // Reads the same loudness as `light`, on a clock two orders of magnitude
    // slower. Note that this is the AUTO-GAINED rms, so it tracks dynamics
    // relative to recent playing rather than absolutely: play hard for a while
    // and the storm builds, ease off and it clears. Absolute dynamics need the
    // centroid-scale calibration first (see MOODS.md) — this version cannot be
    // wrong about a room it has not measured.
    const wTau = f.rms > v.weather ? WEATHER_RISE_TAU : WEATHER_FALL_TAU;
    v.weather += (f.rms - v.weather) * (1 - Math.exp(-dt / wTau));

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
  'u_sparkle', 'u_pulse', 'u_shift', 'u_open', 'u_tex', 'u_texAmt',
  'u_gloss', 'u_slant', 'u_base', 'u_drift', 'u_rms', 'u_weather', 'u_glint',
  'u_flow', 'u_cur', 'u_centroid', 'u_angular', 'u_canopy', 'u_leaf', 'u_bark',
  'u_mw[0]',
];

// The shader's preamble, decided at build time from what the context can do.
//
// It has to be prepended rather than written into FRAG for two reasons: an
// #extension directive must precede every other token in the source, and
// tools/validate-assets.mjs finds the shader by looking for a plain
// "const FRAG = " template literal (it guards against a backtick inside it
// closing the string early — a failure that has cost two debugging rounds).
// Concatenating here keeps both true.
function fragSource(hasDerivatives) {
  return hasDerivatives
    ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1\n' + FRAG
    : FRAG;
}

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
  let morphSecs = KIN_MORPH_SECONDS;
  let tAcc = Math.random() * 100;
  let flowAcc = 0;
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
    // Asked for on every build, not once: the extension belongs to the context,
    // and a context restore hands back a new one that may not have it.
    const hasDerivatives = !!gl.getExtension('OES_standard_derivatives');
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSource(hasDerivatives)));
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

  function setTheme(theme, seamless) {
    cur = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    tgt = theme;
    morph = 0;
    // A kin change is watched; a cut is hidden behind the lid. See the two
    // constants for why that is one decision and not two.
    morphSecs = seamless ? KIN_MORPH_SECONDS : CUT_MORPH_SECONDS;
    // A seamless change keeps the clock running. Between kin (see themes.js)
    // this is not a new visit to a new mood — the rain that was falling goes on
    // falling at the same phase while the palette and the motif weights lerp
    // underneath it — so restarting would put a jump into the one thing the
    // transition exists to carry through.
    if (seamless) return;
    // The travel clock restarts with every mood. It is what "the longer you
    // play" means — frost thickening, the cave's light swinging round, the
    // sea and the forest travelling — and the only reading of that which
    // makes sense is THIS visit to THIS mood. One clock for the whole
    // session (what this used to be) meant ocean's current was advancing
    // cave's crystal selection while cave was not even on screen, and a mood
    // returned to an hour later resumed mid-cycle instead of beginning.
    //
    // The cost is a cut in the outgoing mood's motion during the 2.2s
    // crossfade, since one uniform cannot hold two positions. Inside a
    // crossfade, where the whole image is dissolving anyway, that is the
    // cheaper of the two flaws.
    flowAcc = 0;
  }

  const smoothMotion = createMotionSmoother();

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / morphSecs);
    const th = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    if (lost) return; // morph still advances; drawing waits for the restore
    const m = th.mappings;
    const sm = smoothMotion(f, dt);

    const motion = reducedMotion ? 0.35 : 1;
    tAcc += dt * th.params.speed * motion * (0.6 + intensity * 0.6);
    // The travel clock: integrated HERE because level-driven motion must be
    // monotonic. An offset proportional to loudness slides back when the
    // sound dies — the owner watched the snow do exactly that. Integrating
    // the rate means motion earned by the music is kept.
    //
    // The idle floor is LOW on purpose: a mountain range should hold nearly
    // still until the music moves it, and the owner found the ocean's resting
    // pace too quick. Playing is what buys motion.
    //
    // Scaled by intensity, so the clock runs only while the mood is actually
    // on screen: a sealed eye does not quietly age the frost for twenty
    // minutes and then open onto the middle of a cycle. Together with the
    // reset in setTheme, "the longer you play" means this visit to this mood,
    // and nothing wider.
    //
    // An onset spends itself on the RATE as well, and that is what lets a
    // motif have a crackle without having a retreat. mFrost used to shove its
    // growth front outward by the onset envelope and then let the envelope
    // decay, so the pane crazed and un-crazed with every chord — the owner
    // watched it "swell a little and thin". Anything driven by an envelope
    // directly has that shape built into it. Driven through this clock instead,
    // an onset is a surge of travel that can never be taken back: the frost
    // that grew stays grown, the cave's lamp keeps the ground it swung across,
    // the walk through the trees carries on from where the chord left it.
    flowAcc += dt * (th.params.travel || 0) * motion * intensity
             * (0.12 + sm.light * 1.6 + pulse * 0.8);

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
    gl.uniform1f(U.u_weather, sm.weather);
    gl.uniform1f(U.u_flow, flowAcc);
    gl.uniform2f(U.u_cur, th.params.travelX || 0, th.params.travelY || 0);
    gl.uniform1f(U.u_centroid, sm.shift);
    gl.uniform1f(U.u_angular, th.params.angular === undefined ? 1 : th.params.angular);
    gl.uniform1f(U.u_canopy, th.params.canopy || 0);
    gl.uniform1f(U.u_leaf, th.params.leaf || 0);
    gl.uniform1f(U.u_bark, th.params.bark || 0);
    gl.uniform1f(U.u_glint, (th.params.glint || 0) * 0.3);
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
  // A canvas that has already handed out a WebGL context will refuse a 2D
  // one — getContext returns null rather than throwing. That is exactly the
  // path taken when createGL gets far enough to bind a context and THEN
  // fails (a shader that will not compile, say), and without this guard the
  // fallback throws on every animation frame and takes the eye down with it.
  // A dark aperture is a bad day; a dead page is a worse one.
  if (!ctx) {
    console.warn('viz: no 2D context either — the field will not render');
    return {
      resize() {}, setSize() {}, setTheme() {}, frame() {}, kind: 'none',
    };
  }
  let cur = themeStub();
  let tgt = cur;
  let morph = 1;
  let morphSecs = KIN_MORPH_SECONDS;
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

  function setTheme(theme, seamless) {
    cur = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    tgt = theme;
    morph = 0;
    morphSecs = seamless ? KIN_MORPH_SECONDS : CUT_MORPH_SECONDS;
  }

  const css = (rgb, a) =>
    `rgba(${rgb[0] * 255 | 0},${rgb[1] * 255 | 0},${rgb[2] * 255 | 0},${a})`;

  const smoothMotion = createMotionSmoother();

  function frame(t, dt, f, intensity) {
    if (morph < 1) morph = Math.min(1, morph + dt / morphSecs);
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
