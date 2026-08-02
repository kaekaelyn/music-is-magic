// §5.4 — themes are pure data. The engine never changes per theme.
//
// Each theme: 5-step palette (dark→light), engine params, and mappings —
// gains that say how strongly each audio feature drives its visual parameter.
// The same definitions live in assets/themes/<name>/theme.json (the editable
// source); these built-ins keep the site alive if a fetch ever fails.

// Exported so tools/validate-assets.mjs can catch drift between these
// fallbacks and the theme.json files they mirror — a silent divergence would
// only show up as "the site looks different when the network is slow".
// The landing spot for every unknown or empty token (§5.2). Renamed from
// 'default' at the owner's request — call it what it is — and old 'default'
// tokens resolve here through the unknown-token path, so nothing breaks.
export const FALLBACK_THEME = 'night';

export const BUILTIN = {
  // Night sky — and named for what it is. 'night' is also the fallback every
  // unknown or empty token lands on (FALLBACK_THEME below): a sky is what is
  // there before any weather arrives, and nothing else in the set looks up.
  // Old 'default' tokens still arrive from cached phones and old metadata;
  // they are simply unknown now, so they resolve here. That is the alias.
  night: {
    // Midnight BLUE, not violet — cave owns the violet dark, and the two were
    // reading as siblings. The aurora and the onset meteors are what keep the
    // sky from being just another sparkle field: stars sit still and twinkle,
    // the aurora breathes with loudness, and a strong onset sends one meteor.
    // Still deliberately brighter than a real night: this is the face shown
    // if a theme.json fetch ever fails, and an aperture that barely differs
    // from sealed stone reads as broken rather than as night.
    // Warmed at the top and leaned teal in the ground (owner's reference: a
    // teal starfield with GOLD nebula cloud). Safe for the aurora precisely
    // because the aurora stopped drawing from the palette — its greens are
    // its own. The gold reaches what should carry it: the stars and the
    // brightest fog, via c4.
    palette: ['#030714', '#0f2340', '#1d3e66', '#4467af', '#f6edd8'],
    // No ambient glint: the stars ARE this theme's points of light, and a
    // second scattered set on top of them was just noise.
    // base DOWN from 0.66. The shared fog was lighting the whole sky to a
    // mid blue-grey, and an aurora is a bright thing against a dark one — at
    // that base there was nothing for it to be bright against, which is most
    // of why it read as absent even once it was drawn. A night sky is mostly
    // black; the stars and the curtain are what is in it.
    params: { scale: 1.2, speed: 0.14, warp: 0.7, sparkle: 0.85, gloss: 0.1, base: 0.3, drift: 0.18, travel: 0.12, travelX: 0.08 },
    motifs: { stars: 0.95, aurora: 0.7 },
    mappings: { warpBass: 0.2, sparkleTreble: 1.3, pulseFlux: 1.1, shiftCentroid: 0.15 },
  },
  // Light through a canopy onto trunks, wisps drifting between them. The
  // palette's second step stays grey-brown so the trunks read as wood, but
  // the LIGHT is the subject now: the owner's screenshot showed a dim green
  // murk because the mist was winning — so more dapple, more rays, brighter
  // and more frequent wisps, and a saturated canopy-green in the upper steps.
  // Audio: dapple shifts overhead with loudness, wisps swell, rays flare.
  forest: {
    // Two different greens in the mid steps — teal-green shade into
    // yellow-green light — so the shiftCentroid sweep wanders real hue
    // instead of one green's brightness. Brown stays confined to the trunk
    // step, which is what keeps this out of army-camo territory.
    palette: ['#081409', '#332f20', '#2e6b4a', '#92bd5e', '#eef7d4'],
    // travel: a walk among the trees. Near trunks pass fastest, wisps at a
    // middle rate, the mist drifts with you, and the rays stay anchored to
    // the sky — the parallax is the depth. Loud playing quickens the walk.
    // glint here means MOTES, not sparkle: the rays nominate their own beam
    // as the glint site (see viz.js), so these are dust hanging in the
    // shafts — the thing that makes a beam read as a volume of air. Rays
    // raised toward the references, where the shafts are the subject of the
    // frame rather than an accent in it.
    params: { scale: 1.8, speed: 0.22, warp: 1.25, sparkle: 0.45, gloss: 0.1, base: 0.42, drift: 0.35, travel: 0.55, travelX: 0.3, canopy: 0.95, glint: 0.16 },
    motifs: { columns: 0.85, dapple: 0.8, rays: 0.78, wisps: 0.6 },
    mappings: { warpBass: 0.5, sparkleTreble: 1.2, pulseFlux: 1, shiftCentroid: 0.32 },
  },
  // Wet dark. Rounded stone receding into a passage, crystal clusters
  // growing out of it, a floor for the drips to arrive on, and very little
  // else. Three rounds of "this reads as stained glass" all had one cause:
  // a lit fog field showing THROUGH faceted shapes, which is what a window
  // is. The rock replaces the field now (base is nearly off), the walls are
  // shaded round rather than flat, and the crystals are objects standing in
  // front of the wall instead of a pattern printed on it.
  cave: {
    palette: ['#04040a', '#100f1c', '#282340', '#5d5480', '#d6e2f5'],
    // travel drives the crystals and nothing else: cave has no current, so
    // nothing is advected by it. It is the clock the light swings on and the
    // clock that nominates which seam is showing — "the longer you play". It
    // was absent, which pinned u_flow at zero and left both of those frozen.
    params: { scale: 2.0, speed: 0.1, warp: 0.55, sparkle: 0.8, gloss: 0.3, base: 0.3, drift: 0.05, glint: 0.3, travel: 0.5 },
    // No drips. They were a lone droplet falling at the mouth of a passage
    // that recedes forty feet, and making that read correctly needed a floor
    // to land on, a near-mask to keep them out of the deep, and a scale that
    // agreed with the perspective — three fixes deep and still fighting the
    // geometry. The owner's call: "maybe it's best to forget the drips".
    // The cave's answer to the music is its light and its quartz.
    motifs: { tunnel: 0.7, crystals: 0.85 },
    // brightRms cut low ON PURPOSE: a cavern that brightens when you play
    // reads as a light bulb behind rock. The cave's whole answer to the music
    // is its crystals (tunnel flare + face shimmer) and its drips.
    mappings: { warpBass: 0.18, sparkleTreble: 1.4, pulseFlux: 1.1, shiftCentroid: 0.1 },
  },
  // Shards with lit seams — and the strike system: quiet ice is genuinely
  // still and dark, and every onset flash-illuminates a handful of whole
  // shards (treble widens the handful). The music is the only light source
  // that matters here; pulseFlux is raised so more of the playing registers.
  ice: {
    palette: ['#04101c', '#0d2b45', '#2f6f96', '#8fc8e0', '#f2fbff'],
    // travel feeds the FROST clock: frost creeps over the shards while the
    // room is loud and thaws back on the same slow cycle. Playing frosts the
    // glass; silence lets it clear.
    params: { scale: 2.0, speed: 0.16, warp: 0.5, sparkle: 1.0, gloss: 0.6, base: 0.55, drift: 0.02, travel: 0.25, glint: 0.35 },
    motifs: { facets: 0.9 },
    mappings: { warpBass: 0.06, sparkleTreble: 1.6, pulseFlux: 1.3, shiftCentroid: 0.1 },
  },
  // Ranges against the sky with snow near the tops. `ridge` supplies the
  // silhouette, and by the owner's verdict it supplies ALL of it: crags is 0
  // here. Three attempts to make a rock texture belong to a moving mountain
  // (per-layer patches, then matched screen rates and per-range cell sizes)
  // each got closer and none arrived — "it is like we are viewing the moving
  // mountains through a stationary craggy window", twice, and then "no crags
  // looks better". A texture that betrays the illusion is worse than no
  // texture. The motif stays in the engine; mountain just does not use it.
  // The landscape never moves — that stillness is the mood — but the WEATHER
  // answers the music: spindrift tears off the near crest with loudness,
  // dapple drifts past as cloud-light shouldered by the room, and the
  // snowline shimmers.
  mountain: {
    palette: ['#0a0d14', '#252d3a', '#525e6f', '#97aabe', '#f4f9ff'],
    // travel: a journey along the chain — each range passes at its own rate,
    // near ones fastest, sped by the music. The snow streams one way on the
    // same clock; nothing here ever slides back.
    params: { scale: 1.4, speed: 0.1, warp: 0.9, sparkle: 0.5, gloss: 0.2, base: 0.6, drift: 0.25, travel: 0.4, glint: 0.12 },
    // clouds on, gated by the ridge silhouette in the shader: weather above
    // the line, snow below it, and the two never trade places.
    motifs: { ridge: 0.92, snow: 0.8, dapple: 0.4, clouds: 0.32 },
  },
  // The sea as one moving body. The watery fog is BACK (the owner missed
  // it: it looked more like ocean than the bare surf did) — but now it, the
  // caustics and the surf all ride the same current, down and slightly
  // across, on the flow clock. One direction, always; the music sets the
  // pace. Loudness also works the surf harder: sharper crests, more white.
  ocean: {
    // Top step near-WHITE, not mint. Foam is drawn from c3/c4, and with a
    // mint c4 white water was unreachable — the one thing every ocean
    // reference agrees on. The water stays turquoise through c3.
    palette: ['#02101c', '#043a57', '#0b6d85', '#39ac9b', '#eaf9f4'],
    // drift is LOW so the water's internal churn cannot fight the current:
    // the whole body — fog, caustics, crests — now translates together.
    params: { scale: 1.6, speed: 0.45, warp: 1.15, sparkle: 0.4, gloss: 0.35, base: 0.62, drift: 0.12, travel: 0.9, travelX: -0.05, travelY: 0.42 },
    motifs: { caustics: 0.7, foam: 0.75 },
    mappings: { warpBass: 0.35, sparkleTreble: 1, pulseFlux: 1, shiftCentroid: 0.15 },
  },
  // The same drips as cave, dense and fast — that is what the weight means —
  // but blown off vertical, which is the difference between weather and a
  // ceiling. Cave keeps slant at 0: nothing underground is windy.
  // Grey, not blue — overcast is a colour of its own (owner's note). The
  // floor sits lower and curves with the lens, and the splashes answer the
  // room: loudness widens the crowns, an onset lands a burst of them.
  rain: {
    palette: ['#0b0d10', '#22272c', '#485056', '#87939b', '#e0e6ea'],
    params: { scale: 2.4, speed: 0.55, warp: 1.0, sparkle: 0.5, gloss: 0.25, slant: 0.34, base: 0.7, drift: 0.8 },
    motifs: { columns: 0.15, drips: 0.95, storm: 0.85 },
    mappings: { warpBass: 0.4, sparkleTreble: 1, pulseFlux: 1.1, shiftCentroid: 0.2 },
  },
  // Shafts. Slow, wide, and the brightest thing in the set. The top steps
  // are saturated GOLD now, not cream — the rays carry their own colour after
  // the ramp (mix of c3/c4), so golden light means golden steps, per the rule
  // that light of a colour is a material. Onsets kick the fan sideways and
  // flare it: the beams dance rather than merely brighten.
  sunshine: {
    palette: ['#0d2340', '#2f5f8c', '#8fb6cf', '#f2a93b', '#ffd873'],
    // clouds: billows that build with loudness and drift one way on the
    // travel clock, every sunward edge rimmed in the palette's gold — and
    // they are what breaks the shafts here. No canopy: this is open sky,
    // and foliage overhead belongs to a theme that has trees in it.
    params: { scale: 1.3, speed: 0.26, warp: 0.9, sparkle: 0.5, gloss: 0.2, base: 0.3, drift: 0.3, travel: 0.42, travelX: 0.2 },
    motifs: { rays: 0.95, dapple: 0.3, clouds: 0.55 },
    mappings: { warpBass: 0.15, sparkleTreble: 1.0, pulseFlux: 1.15, shiftCentroid: 0.2 },
  },

  // A small fire in the dark. Explicitly NOT a wildfire — the brief is sacred
  // and intimate, which is a statement about scale before it is one about
  // colour: the flame is seated low, the frame stays black, and what lights
  // the surroundings is the fire itself rather than any ambient field. base is
  // near zero for exactly that reason.
  //
  // A few stars, because a fire in the dark is usually outdoors and the sky
  // being there is what makes the dark feel large rather than enclosed.
  fire: {
    palette: ['#08060a', '#1e1114', '#4a2418', '#a34e1c', '#ffd9a0'],
    params: { scale: 1.6, speed: 0.3, warp: 0.7, sparkle: 0.5, gloss: 0.15, base: 0.16, drift: 0.3, travel: 0.18 },
    motifs: { flame: 1.0, embers: 0.6, smoke: 0.45, stars: 0.18 },
    // pulseFlux high: a fire should visibly jump when a chord lands, and the
    // flame's reach and the ember burst both hang off the onset.
    mappings: { warpBass: 0.25, sparkleTreble: 1.0, pulseFlux: 1.25, shiftCentroid: 0.12 },
  },

  // --- SUB-MOODS ------------------------------------------------------------
  //
  // A sub-mood is just a theme. No new machinery was needed: both panels build
  // their buttons from index.json, and every theme carries every motif key, so
  // moving between any two is a plain lerp. A folder and one line is the whole
  // mechanism.

  // Rain falling through sunlight. NOT a rain sub-mood and not a sunshine one
  // — it is the place those two meet, which is why it carries neither name as
  // a prefix and why arriving from either side is a single morph.
  //
  // The first attempt built it out of forest, on the reasoning that forest
  // already owned shafts and canopy and only wanted drips added. That was
  // reasoning about the parts instead of the thing: it came out GREEN, a wood
  // in the rain rather than weather lit from behind. There are no trees here
  // now — no canopy, no trunks, no wisps. This mood is archetypal, and what it
  // is made of is falling water, low sun, and the sky between them.
  //
  // Palette from the owner's reference: deep blue and violet cloud, lilac
  // through the middle, and a warm near-white at the top. That last step is
  // load-bearing — drips take their highlight from it, so the rain itself
  // falls GOLD against the blue, which is the whole look of backlit rain.
  //
  // The rainbow lives here rather than in a mood of its own, and it is gated
  // on the clearing (see u_clearing): play hard, then let it go, and the bow
  // arrives on the way down.
  sunshower: {
    // base is LOW. At 0.5 the shared field sat high enough in the ramp that
    // everything resolved to the pale top steps and the mood came out a
    // washed grey — the blue and violet the reference is built on never got
    // a look in. The sky has to be dark enough for backlit rain to be gold
    // against it.
    palette: ['#101736', '#2f3d78', '#6b7ac0', '#c8b9c6', '#ffe6bd'],
    params: { scale: 1.9, speed: 0.32, warp: 1.0, sparkle: 0.6, gloss: 0.3, slant: 0.18, base: 0.26, drift: 0.45, travel: 0.4, travelX: 0.16 },
    motifs: { rays: 0.58, dapple: 0.25, drips: 0.66, clouds: 0.55, rainbow: 1.0 },
    mappings: { warpBass: 0.3, sparkleTreble: 1.1, pulseFlux: 1.0, shiftCentroid: 0.25 },
  },

  // Night, and deliberately its own mood rather than a child of mountain or
  // fire: it shares a silhouette with one and a palette with the other, and
  // resembles neither. Lava runs in channels down the slope, the crust between
  // them staying dark, so what you see is glow coming up through cracks. An
  // onset opens the ground — the gush IS the eruption.
  volcano: {
    palette: ['#0a0708', '#1c1216', '#3a2028', '#8c3a1e', '#ffcf94'],
    params: { scale: 1.5, speed: 0.18, warp: 0.85, sparkle: 0.5, gloss: 0.3, base: 0.2, drift: 0.2, travel: 0.45 },
    motifs: { ridge: 0.85, lava: 0.95, smoke: 0.6, embers: 0.45, stars: 0.35 },
    mappings: { warpBass: 0.4, sparkleTreble: 1.0, pulseFlux: 1.3, shiftCentroid: 0.15 },
  },

  // Dunes are ridgelines that are not angular. `angular: 0.1` folds the same
  // silhouette from smooth noise instead of linear, and rock becomes sand for
  // one number. Blowing sand off a crest is spindrift, which is why snow is on
  // in a desert: that motif means "what the wind tears off the top", and it
  // never cared what the material was.
  desert: {
    palette: ['#2a1a10', '#6b4526', '#b98a4e', '#e5c489', '#fff4dc'],
    params: { scale: 1.5, speed: 0.1, warp: 0.55, sparkle: 0.4, gloss: 0.12, base: 0.55, drift: 0.1, travel: 0.3, travelX: 0.12, angular: 0.1 },
    motifs: { ridge: 0.9, ripples: 0.75, snow: 0.35, clouds: 0.12 },
    mappings: { warpBass: 0.2, sparkleTreble: 0.8, pulseFlux: 0.8, shiftCentroid: 0.25 },
  },

  // The same sand under a moon, and not merely a recolour: the light works
  // differently. Stars carry the sky, the ripples take a hard cold specular
  // rather than a diffuse glare, and the whole field sits far lower.
  'night-desert': {
    palette: ['#05070f', '#131c33', '#37456b', '#8090b4', '#e8eeff'],
    params: { scale: 1.5, speed: 0.08, warp: 0.5, sparkle: 0.8, gloss: 0.16, base: 0.34, drift: 0.08, travel: 0.22, travelX: 0.1, angular: 0.1 },
    motifs: { ridge: 0.9, ripples: 0.6, snow: 0.22, stars: 0.9 },
    mappings: { warpBass: 0.18, sparkleTreble: 1.2, pulseFlux: 0.9, shiftCentroid: 0.2 },
  },

  // Forest in blossom. The petals motif takes its colours from the palette's
  // upper steps, so putting pink and white there is what makes these blossom
  // rather than leaves — the engine never learns which it is drawing.
  'forest-blooming': {
    palette: ['#0b1a0d', '#2f3a22', '#3f8a52', '#e78fb8', '#fff2f6'],
    params: { scale: 1.8, speed: 0.24, warp: 1.2, sparkle: 0.6, gloss: 0.12, glint: 0.14, canopy: 0.9, base: 0.5, drift: 0.35, travel: 0.5, travelX: 0.26 },
    motifs: { columns: 0.75, dapple: 0.75, rays: 0.8, petals: 0.8, wisps: 0.25 },
    mappings: { warpBass: 0.4, sparkleTreble: 1.2, pulseFlux: 1.1, shiftCentroid: 0.35 },
  },

  // The same wood and the same motif, amber and rust in the upper steps.
  'forest-autumn': {
    palette: ['#140d07', '#3a2413', '#8a4a1c', '#d98a34', '#ffd98f'],
    params: { scale: 1.8, speed: 0.22, warp: 1.15, sparkle: 0.55, gloss: 0.14, glint: 0.12, canopy: 0.8, base: 0.46, drift: 0.32, travel: 0.55, travelX: 0.28 },
    motifs: { columns: 0.8, dapple: 0.7, rays: 0.72, petals: 0.7 },
    mappings: { warpBass: 0.45, sparkleTreble: 1.1, pulseFlux: 1.0, shiftCentroid: 0.3 },
  },

  // No canopy — and that is the mood, not a detail of it. With nothing
  // overhead the shafts arrive unbroken and weak instead of dappled and
  // shifting, the trunks carry the frame alone, and the light stops being the
  // subject. Grey-brown throughout; the only colour left is a few last leaves.
  'forest-barren': {
    palette: ['#171a1f', '#3d3f44', '#71757c', '#a8adb5', '#e9edf2'],
    params: { scale: 1.7, speed: 0.16, warp: 1.0, sparkle: 0.4, gloss: 0.1, base: 0.82, drift: 0.3, travel: 0.6, travelX: 0.3 },
    motifs: { columns: 0.95, rays: 0.5, petals: 0.12 },
    mappings: { warpBass: 0.5, sparkleTreble: 0.9, pulseFlux: 1.0, shiftCentroid: 0.25 },
  },
};

// KINSHIP. Which moods flow into which without a cut.
//
// Moving between kin is not going somewhere else — it is the same weather
// changing its mind — so it gets neither the lid nor a clock reset, and the
// morph is the only thing that happens. Moving between unrelated moods still
// closes the eye, because that IS a different place and the cut wants hiding.
//
// The useful consequence: sunshower is kin to both of its parents, so rain and
// sunshine are two steps apart through it, and the whole passage from one to
// the other can be made without the eye ever shutting.
//
// Deliberately not in theme.json. A relationship is not a property of either
// theme on its own, and putting half of it in each file is how the two halves
// come to disagree.
const KIN = Object.freeze({
  sunshower: ['rain', 'sunshine'],
  rain: ['sunshower'],
  sunshine: ['sunshower'],
  // A wood through the year. All three are the same trees, so moving between
  // them is a season turning rather than a journey — and the seasons are kin
  // to each other as well as to the parent, since autumn to barren is the most
  // natural passage in the set.
  forest: ['forest-blooming', 'forest-autumn', 'forest-barren'],
  'forest-blooming': ['forest', 'forest-autumn', 'forest-barren'],
  'forest-autumn': ['forest', 'forest-blooming', 'forest-barren'],
  'forest-barren': ['forest', 'forest-blooming', 'forest-autumn'],
  // Same sand, sun down.
  desert: ['night-desert'],
  'night-desert': ['desert'],
});

export function isKin(a, b) {
  if (!a || !b || a === b) return false;
  return (KIN[a] || []).includes(b);
}

// Motifs are the answer to "why does every theme look like the same fog in a
// different color". The engine compiles all of them in; a theme picks which
// ones it is made of and how strongly, as pure data (D10 — adding a theme is
// still a folder, and the engine still never changes per theme).
//
// Weight is not just opacity: `drips` reads its own weight as density too, so
// a slow cave seep and hard rain are the same motif at two settings.
export const MOTIFS = Object.freeze({
  rays: 0,      // shafts of light from above — sun through a gap
  columns: 0,   // irregular vertical masses — trunks, formations
  dapple: 0,    // patches of light drifting at their own rate — canopy shadow
  drips: 0,     // falling streaks — seepage, rain
  facets: 0,    // crystal shards with a lit seam where they meet — ice
  caustics: 0,  // undulating light web — water
  crags: 0,     // angular rock planes, each catching light its own way
  snow: 0,      // accumulation on the upward faces of those layers
  tunnel: 0,    // a passage receding into the dark, crystal on its walls
  ridge: 0,     // layered ridgelines against the sky — a mountain's silhouette
  wisps: 0,     // slow wandering lights — will-o-wisps between the trunks
  foam: 0,      // travelling swell with breaking white water on the crests
  stars: 0,     // fixed points of light, a faint band, meteors on onsets
  aurora: 0,    // curtains of light in a night sky, breathing with loudness
  clouds: 0,    // billowing cumulus, sunward edges rimmed in the palette's gold
  crystals: 0,  // prisms growing out of the rock, lit face and shadowed face
  storm: 0,     // forked lightning and the flash that follows it
  rainbow: 0,   // a spectral arc against dark weather — conjured, not ambient
  flame: 0,     // tongues of fire rising from a seat — small, not a wildfire
  embers: 0,    // sparks carried up on the draught, dying as they climb
  smoke: 0,     // a plume above a fire, widening and thinning as it rises
  lava: 0,      // molten rock finding its way downhill, glowing from within
  ripples: 0,   // wind-combed sand, ridge upon ridge of it
  petals: 0,    // blossom and leaf-fall, tumbling as they go
});

// Spread under every theme so each one carries every key. Morphing is then a
// plain lerp with nothing missing on either side, exactly as with motifs.
export const DEFAULT_PARAMS = Object.freeze({
  scale: 1.5,
  speed: 0.3,
  warp: 1.1,
  sparkle: 0.5,
  gloss: 0,   // hardens the palette ramp and lets specular through
  glint: 0,   // ambient scattered sparkles. Off by default: white specks
              // belong to ice and crystal and read as dust anywhere else
  canopy: 0,  // foliage overhead breaking the shafts. Only a theme with trees
              // in it should say anything here — an open sky has no canopy
  slant: 0,   // how far falling things lean from vertical — wind, basically
  base: 1,    // how much the shared fog field contributes; 0 leaves a dark floor
  drift: 1,   // how fast that field evolves; 0 freezes it into something solid
  travel: 0,  // rate of the flow clock: how fast this theme journeys, sped by
              // loudness. 0 = a place you stand in; >0 = a place you move through
  travelX: 0, // direction the texture-space frame is carried by that clock —
  travelY: 0, // the current. Motifs also read the clock along their own axes.
  angular: 1, // how sharp a ridgeline's profile is. 1 = rock, folded from
              // linear noise so the flanks are straight and the summits
              // pointed; 0 = the same silhouette folded from smooth noise,
              // which is a DUNE. Sand and stone are the same geometry at two
              // settings, and this is the setting.
});

const DEFAULT_MAPPINGS = {
  warpBass: 0.9,      // bass energy deepens the domain warp
  sparkleTreble: 1.0, // treble drives glints and motif shimmer
  pulseFlux: 1.0,     // how readily an onset registers as a strike
  shiftCentroid: 0.2, // timbre brightness shifts the gradient
};

export function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function buildTheme(name, base, override) {
  const src = override || {};
  const theme = {
    name,
    palette: Array.isArray(src.palette) && src.palette.length >= 5 ? src.palette : base.palette,
    params: { ...DEFAULT_PARAMS, ...base.params, ...(src.params || {}) },
    mappings: { ...DEFAULT_MAPPINGS, ...(src.mappings || {}) },
    // Every theme carries every motif key, so morphing between two themes is
    // a plain lerp with nothing missing on either side.
    motifs: { ...MOTIFS, ...(base.motifs || {}), ...(src.motifs || {}) },
    textures: Array.isArray(src.textures) ? src.textures : [],
    textureImage: null,
  };
  theme.paletteRGB = theme.palette.map(hexToRgb01);
  return theme;
}

export function createThemeStore(baseUrl = 'assets/themes') {
  const cache = new Map();
  let names = Object.keys(BUILTIN);

  async function init() {
    try {
      const res = await fetch(`${baseUrl}/index.json`, { cache: 'no-cache' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) names = list.map(String);
      }
    } catch (_) {
      // Static hosting hiccup — built-in list carries on.
    }
    return names.slice();
  }

  // Unknown or empty token → the fallback. Never an error (§5.2).
  async function load(token) {
    let name = String(token || '').trim().toLowerCase();
    if (!names.includes(name)) name = FALLBACK_THEME;
    if (cache.has(name)) return cache.get(name);

    const base = BUILTIN[name] || BUILTIN.default;
    let override = null;
    try {
      const res = await fetch(`${baseUrl}/${name}/theme.json`, { cache: 'no-cache' });
      if (res.ok) override = await res.json();
    } catch (_) {
      // theme.json missing or unreachable — built-in look renders instead.
    }
    const theme = buildTheme(name, base, override);

    // A theme may plug in textures (M5); the engine picks up the first one
    // whenever it finishes loading. Failure to load = procedural look.
    if (theme.textures.length) {
      const img = new Image();
      img.src = `${baseUrl}/${name}/${theme.textures[0]}`;
      img.onload = () => { theme.textureImage = img; };
    }

    cache.set(name, theme);
    return theme;
  }

  return { init, load, get names() { return names.slice(); } };
}
