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
uniform float u_canopy;  // how much foliage overhead breaks the shafts. 0 is
                         // open sky, and open sky is most themes' situation

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
float mColumns(vec2 uv, float t, float flow) {
  float near = smoothstep(0.47, 0.56,
      fbm(vec2(uv.x * 2.2 + uv.y * 0.14 + t * 0.014 + flow * 0.55, 4.7)));
  float far = smoothstep(0.44, 0.58,
      fbm(vec2(uv.x * 3.6 + uv.y * 0.1 + t * 0.01 + flow * 0.22, 9.3))) * 0.55;
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
float frond(vec2 q, vec2 a, vec2 b, float ph) {
  // Slow along the spine, fast across it: ridges run in the direction the
  // field varies least.
  float s = 1.0 - abs(2.0 * lnoise(vec2(dot(q, a) * 1.7 + ph, dot(q, b) * 8.5)) - 1.0);
  s *= s;   // narrow it — a spine is a line, not a band
  // The same trick turned ninety degrees and finer, so shoots run out
  // sideways at a regular pitch along the spine's length.
  float bb = 1.0 - abs(2.0 * lnoise(vec2(dot(q, b) * 3.1 + ph, dot(q, a) * 23.0)) - 1.0);
  // A third generation on the barbs themselves: dendrites have dendrites, and
  // it is that recursion the eye reads as frost rather than as a feather.
  float tw = 1.0 - abs(2.0 * lnoise(vec2(dot(q, a) * 41.0, dot(q, b) * 37.0)) - 1.0);
  // The spine keeps most of its own value; the barbs BRIGHTEN it rather than
  // gating it. At a floor of 0.30 the product of three ridged fields survived
  // only at isolated peaks, so the fronds broke into disconnected white
  // specks — frost has to be continuous filaments or it is just dust.
  return s * (0.62 + 0.38 * bb) + s * bb * tw * 0.28;
}

float mFrost(vec2 q, float t, float grow, float strike) {
  // Six-fold habit: three spine directions 60 degrees apart, each with its own
  // perpendicular for its barbs. Ice grows on its lattice, and three axes is
  // what makes a hexagonal one.
  const vec2 a0 = vec2(1.0, 0.0);
  const vec2 b0 = vec2(0.0, 1.0);
  const vec2 a1 = vec2(0.5, 0.866);
  const vec2 b1 = vec2(-0.866, 0.5);
  const vec2 a2 = vec2(-0.5, 0.866);
  const vec2 b2 = vec2(-0.866, -0.5);

  float v = 0.0;
  v = max(v, frond(q, a0, b0, 0.0));
  v = max(v, frond(q, a1, b1, 4.0));
  v = max(v, frond(q, a2, b2, 9.0));

  // Where it is growing right now. Patches run on their own phase, so the
  // field crazes over here while it clears there, and an onset shoves every
  // front outward at once — the crackle.
  //
  // The front also travels ALONG the spines rather than only rising in place:
  // adding a term that varies with position means the threshold clears at the
  // root of a frond before its tip, so a frond extends outward instead of
  // fading in whole. That is the "they don't move or extend like I would
  // expect" note — the old front was a single number applied everywhere at
  // once, which can only fade.
  float patch = fbm(q * 0.9 + 5.0);
  float reach = 0.5 + 0.5 * sin(grow * 0.55 + patch * 7.0);
  float along = fbm(q * 0.5 + 17.0);
  float front = 0.92 - 0.34 * reach - 0.12 * (reach - along)
              - strike * 0.09;
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
#define CRYSTAL_CLUSTERS 5
#define CRYSTAL_SPEARS 3
float mCrystals(vec2 uv, vec2 vp, float t, float selClock, vec2 lightDir,
                float strike, float drive, out float tint, out float faceGlow,
                out float pool) {
  tint = 0.5;
  faceGlow = 0.0;
  pool = 0.0;
  float best = 0.0;

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
    best = max(best, bed * env * (0.20 + drive * 0.4));

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

      float v = env * (body + glint * (0.26 + drive * 0.6) + glint * strike * 0.85);
      if (v > best) {
        best = v;
        faceGlow = env * glint;
        tint = qtint;
      }
    }
  }
  return best;
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

// A rainbow.
//
// Its colour is its OWN — the same licence the aurora, the snow and the quartz
// minerals take, and here it is not a licence but a necessity: a rainbow is
// the entire spectrum by definition, and no five-step palette can hold one.
//
// Geometry is a large circle centred well below the frame, so what falls
// inside the aperture is the crown of a big arc rather than a small hoop
// sitting in the sky. Red outside, violet inside, and a faint reversed
// secondary further out, because the second bow is most of what makes people
// believe the first one.
vec3 bowSpectrum(float x) {
  vec3 c = mix(vec3(0.95, 0.28, 0.22), vec3(0.98, 0.70, 0.20), smoothstep(0.00, 0.26, x));
  c = mix(c, vec3(0.93, 0.94, 0.34), smoothstep(0.20, 0.44, x));
  c = mix(c, vec3(0.32, 0.86, 0.44), smoothstep(0.40, 0.62, x));
  c = mix(c, vec3(0.26, 0.56, 0.96), smoothstep(0.56, 0.82, x));
  c = mix(c, vec3(0.58, 0.32, 0.88), smoothstep(0.76, 1.00, x));
  return c;
}

// Deliberately NOT meteorological. An earlier cut gated this on a storm having
// happened and now passing, which is what a real rainbow needs and made for a
// rare, solemn event. The owner's call, and the better one: let it play. This
// is refracted light loose in a sunshower, free to wander, brighten, break up
// and reform with the music — a lovely small feature of the mood rather than a
// reward for a particular passage. Realism is not the brief here.
vec3 mRainbow(vec2 uv, float t, float drive, float kick, float pitch, out float amt) {
  vec2 c = vec2(0.04, -1.24);
  vec2 dv = uv - c;
  float r = length(dv);
  float ang = atan(dv.x, dv.y);   // 0 straight up the crown

  // It BREATHES and it FLINCHES. The radius drifts on a slow clock and an
  // onset shoves it outward, so a struck chord makes the whole arc spring
  // rather than merely brighten.
  float R = 1.42 + sin(t * 0.19) * 0.055 + kick * 0.075;
  float width = 0.085 * (1.0 + drive * 0.55);

  float d = (r - R) / width;
  float primary = smoothstep(1.0, 0.0, abs(d));
  // Only the crown: an arc, not a hoop.
  float crown = smoothstep(-0.30, 0.06, uv.y);

  // ALIVE ALONG ITS LENGTH. Segments swell and fade on their own slow clock,
  // so the bow is never quite the same shape twice — sometimes a full arc,
  // sometimes two or three suggestions of one. This is the dancing.
  float seg = fbm(vec2(ang * 2.7 + t * 0.09, 5.0));
  float alive = smoothstep(0.30, 0.68, seg + drive * 0.3);

  // Where the spectrum sits across the band slides with pitch, so bright
  // playing walks the colours outward through the arc.
  float k = clamp(d * 0.5 + 0.5 + (pitch - 0.45) * 0.45, 0.0, 1.0);
  vec3 col = bowSpectrum(k) * primary * alive;

  // A second, fainter suggestion on its own wandering radius — a nod to the
  // real secondary bow, colours reversed, but untethered from the physics and
  // free to drift against the first.
  float R2 = R * (1.16 + sin(t * 0.13 + 1.7) * 0.045);
  float d2 = (r - R2) / (width * 1.8);
  float ghost = smoothstep(1.0, 0.0, abs(d2)) * 0.32
              * smoothstep(0.36, 0.82, fbm(vec2(ang * 1.9 - t * 0.06, 12.0)));
  col += bowSpectrum(clamp(0.5 - d2 * 0.5, 0.0, 1.0)) * ghost;

  amt = (primary * alive + ghost) * crown * (0.5 + drive * 0.7 + kick * 0.45);
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
    float ang = 0.45 + fi * 0.275; // fi 0 = far, softened; fi 2 = near, angular
    float n = mix(noise(s1), lnoise(s1), ang) * 0.72
            + mix(noise(s2), lnoise(s2), ang) * 0.28;
    float ridged = 1.0 - abs(2.0 * n - 1.0);            // peaks, not dunes
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
    ridged = clamp(ridged * (0.64 + 0.48 * fine) + fine * fine * 0.07, 0.0, 1.5);
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
  return (star + band * 0.42 + meteor) * w;
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
  float hem = -0.22 + fbm(vec2(x * 1.1 + t * 0.05, 3.7)) * 0.26 + kick * 0.05;
  float fold = fbm(vec2(x * 4.0 + t * 0.08, uv.y * 0.6));
  // RAYS. A curtain is not a wash — it is a palisade of near-parallel shafts
  // standing along the field lines, and that structure is most of why the eye
  // reads "aurora" instead of "green fog". Their absence is the largest part
  // of why this motif was too subtle to notice. They drift sideways on their
  // own slow clock, so the curtain shimmers along its length rather than
  // pulsing as one block.
  float rays = smoothstep(0.30, 0.80, fbm(vec2(x * 9.5 + t * 0.07, 11.0)));
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
  // The floor was 0.1, which is not a whisper, it is invisible — and the
  // owner's measurement says the top of a piano only drives the centroid to
  // about 0.76, so the old 0.45-0.62 ramp sat in the top third of what the
  // instrument can actually reach and ordinary playing never left the floor.
  // Lower, wider, and off a floor you can see. (The scale itself still wants
  // rebasing once the bass and mid readings exist — see MOODS.md.)
  float wake = 0.3 + 0.7 * smoothstep(0.32, 0.58, pitch);
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
  if (W_columns > 0.0) mass += mColumns(uv, u_t, u_flow) * W_columns * 0.78;
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
                        u_pulse, clamp(u_sparkle, 0.0, 1.0),
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
    float s = mStars(uv, u_t, W_stars, u_pulse);
    lift += s * 0.42;
    spec += s * 1.2;
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
    float frost = mFrost(p * 0.55, u_t, u_flow, u_pulse) * W_facets;
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
  col = mix(col, mix(u_c2, u_c4, 0.45), clamp(cloud, 0.0, 1.0) * 0.5);
  col += mix(u_c3, u_c4, 0.35) * clamp(cloudRim, 0.0, 1.0) * 0.85;

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
  // The bow goes on last, over the weather it belongs to. Additive, because
  // it is light in the air rather than a surface — and it reads best against
  // the dark cloud a passing storm leaves behind, which is the whole reason
  // it belongs to rain.
  if (W_rainbow > 0.0) {
    float bowAmt;
    vec3 bow = mRainbow(uv, u_t, u_rms, u_pulse, u_centroid, bowAmt);
    col += bow * bowAmt * W_rainbow * 1.25;
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
  float d = length(uv);
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
  'u_flow', 'u_cur', 'u_centroid', 'u_canopy', 'u_mw[0]',
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

  function setTheme(theme, seamless) {
    cur = morph < 1 ? mixTheme(cur, tgt, morph) : tgt;
    tgt = theme;
    morph = 0;
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
    if (morph < 1) morph = Math.min(1, morph + dt / MORPH_SECONDS);
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
    flowAcc += dt * (th.params.travel || 0) * motion * intensity
             * (0.12 + sm.light * 1.6);

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
    gl.uniform1f(U.u_canopy, th.params.canopy || 0);
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
