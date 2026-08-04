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
    // base DOWN again, 0.3 -> 0.2. With the aurora gated to the top of the
    // register the shared fog is what is left carrying the sky most of the
    // time, and at 0.3 it draws large pale masses that read as overcast rather
    // than as night — the curtain used to sit on top of them and hide it. A
    // night sky is mostly black, and the stars have to be the brightest thing
    // in it or there is no depth anywhere.
    params: { scale: 1.2, speed: 0.14, warp: 0.7, sparkle: 0.85, gloss: 0.1, base: 0.2, drift: 0.18, travel: 0.12, travelX: 0.08 },
    // The aurora is the BONUS, not the subject — it is gated to the top of the
    // register in the shader now, so most playing gets a night sky and the
    // curtain is what bright high playing conjures. The stars carry the mood:
    // two depths of them, real scintillation, temperature colour and spikes on
    // the brightest. Weight down a little with the gate, so that when it does
    // wake it is a curtain rather than a wash.
    motifs: { stars: 0.95, aurora: 0.6 },
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
    // travel feeds the FROST clock, and that clock only ever runs forward:
    // frost creeps out over the shards while the room is loud and HOLDS where
    // it got to when the room goes quiet. Playing grows the ice; silence stops
    // it growing. It used to thaw back on the same cycle, which read as
    // blotches thickening and shrinking rather than as crystal.
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
    // BLUER, AND GOLDER, and the two are one change: the middle steps were a
    // muted lilac-grey that sat between the blue and the warm without being
    // either, so the mood came out as a lighter shade of overcast — "just a
    // lighter tone of muted gloom". A sunshower is a bright sky with weather
    // falling through it. The lower steps take real blue, and c3 gives up the
    // mauve for the low sun's gold: the rays draw their colour from mix(c3,c4),
    // and so do the drips' highlights, so backlit rain now falls gold against
    // blue rather than pearl against grey.
    palette: ['#0e1738', '#28418f', '#6b8ad8', '#f0c78a', '#fff0cb'],
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
    motifs: { cone: 1.0, lava: 0.95, smoke: 0.6, embers: 0.45, stars: 0.35 },
    mappings: { warpBass: 0.4, sparkleTreble: 1.0, pulseFlux: 1.3, shiftCentroid: 0.15 },
  },

  // A murmuration at dusk, and CALLED 'flock' — the owner's word for it. The
  // motif has always been named flock; the mood carried the longer word for no
  // reason beyond having been written first. (Old 'murmuration' tokens are
  // simply unknown now and resolve to the fallback, which is the same path
  // every retired name takes.)
  //
  // Its OWN mood — the owner's decision, and the right one: the flock's
  // backwards-in-time trace is far too expensive to make every other mood carry
  // it, and here exactly one mood does.
  //
  // "a dark dusky sanguine purple sky, a few stars and a moon maybe". So the
  // palette runs blood-dark violet up from near-black into a bruised rose,
  // with the last light of the day left in the top step — the flock is a
  // silhouette, and a silhouette needs something behind it that is still lit.
  //
  // stars deliberately low: 0.30 is a few points of light, and below the
  // threshold where mStars adds its galactic band, because a Milky Way would
  // pull the eye off the one thing this mood is about. The moon does not
  // answer the music at all — a sky that reacts is a lamp, and the whole
  // effect depends on the sky being indifferent while the flock is not.
  flock: {
    palette: ['#0a0610', '#241030', '#4a1a3a', '#8c3050', '#e8a48c'],
    // speed is derived, not picked. The prototype ran its one clock at
    // dt * agile * 0.40 and the owner tuned the look at roughly agile 0.6, so
    // about 0.24x real time; viz.js advances u_t at dt * speed * 1.2, which
    // puts the same rate at speed 0.20. Every rate in the flock — folding,
    // banking, a generation's lifetime — is measured against that one clock,
    // so this number alone decides whether it looks like what was approved.
    params: { scale: 1.3, speed: 0.2, warp: 0.35, sparkle: 0.35, gloss: 0.08, base: 0.3, drift: 0.1, travel: 0.16, travelX: 0.05, meteors: 0 },
    motifs: { flock: 1.0, moon: 0.9, stars: 0.3 },
    mappings: { warpBass: 0.12, sparkleTreble: 0.7, pulseFlux: 1.35, shiftCentroid: 0.18 },
  },

  // Dunes are ridgelines that are not angular. `angular: 0.1` folds the same
  // silhouette from smooth noise instead of linear, and rock becomes sand for
  // one number. Blowing sand off a crest is spindrift, which is why snow is on
  // in a desert: that motif means "what the wind tears off the top", and it
  // never cared what the material was.
  // heat: 0.9 — the day desert's own note. The owner's read was that it "seems
  // pretty temperate", and they were right that nothing in it was actually hot:
  // warm sand under a warm sky is a beach in April. Heat is a property of the
  // AIR, so it shows as the far ground swimming and the horizon bleaching out,
  // neither of which any palette can say. desert-night leaves it at 0 — the
  // same sand, and the shimmer goes with the sun.
  desert: {
    palette: ['#2a1a10', '#6b4526', '#b98a4e', '#e5c489', '#fff4dc'],
    params: { scale: 1.5, speed: 0.1, warp: 0.55, sparkle: 0.4, gloss: 0.12, base: 0.55, drift: 0.1, travel: 0.3, travelX: 0.12, angular: 0.1, heat: 0.9 },
    motifs: { ridge: 0.9, ripples: 0.75, snow: 0.35, clouds: 0.12 },
    mappings: { warpBass: 0.2, sparkleTreble: 0.8, pulseFlux: 0.8, shiftCentroid: 0.25 },
  },

  // The same sand under a moon, and not merely a recolour: the light works
  // differently. Stars carry the sky, the ripples take a hard cold specular
  // rather than a diffuse glare, and the whole field sits far lower.
  'desert-night': {
    palette: ['#05070f', '#131c33', '#37456b', '#8090b4', '#e8eeff'],
    params: { scale: 1.5, speed: 0.08, warp: 0.5, sparkle: 0.8, gloss: 0.16, base: 0.34, drift: 0.08, travel: 0.22, travelX: 0.1, angular: 0.1 },
    motifs: { ridge: 0.9, ripples: 0.6, snow: 0.22, stars: 0.9 },
    mappings: { warpBass: 0.18, sparkleTreble: 1.2, pulseFlux: 0.9, shiftCentroid: 0.2 },
  },

  // Forest in blossom. The petals motif takes its colours from the palette's
  // upper steps, so putting pink and white there is what makes these blossom
  // rather than leaves — the engine never learns which it is drawing.
  // Forest in blossom. leaf: 0 — the motif draws broad blunt petals, sparse in
  // the air, each one fluttering on its own private phase. The palette's upper
  // steps still decide the colour; what has changed is that colour is no longer
  // the ONLY thing separating this from autumn.
  //
  // petals down from 0.8: "I'd like to see petals be more sparse". Weight is
  // density here as well as presence, so this is the ask directly.
  // SUNNY, not merely green. The old ramp began at #0b1a0d and #2f3a22 — a
  // near-black green and a dark olive — so four fifths of the field sat in
  // shadow and the blossom read as pink confetti in a gloomy wood. The owner's
  // words are the specification: "sunny, soft-petaled joy, flowers bursting,
  // petals fluttering breezily". A spring wood in sunlight has light in its
  // SHADOWS: the darkest thing in it is a lit green, not a black one. So the
  // bottom two steps come up and warm, the mid step goes to sunlit leaf, and
  // the top stays a warm white rather than the old cool pink-white.
  //
  // NO WHOLE FLOWERS. flower: 0 turns off the open-rosette shape, and this is
  // the owner's call: "not a big fan of the full-on flowers, because it's very
  // obvious that they don't tumble and float like they actually would. It gives
  // it a very cartoonish effect." A five-lobed rosette fifteen pixels across
  // reads as a symbol of a flower however well it moves, and a symbol among
  // abstractions is what breaks the spell — the petals are the better object
  // precisely because they are "more abstract". The shape stays in the engine
  // behind its own parameter, so this is a data decision and reversible.
  //
  // AND NOT SO BRIGHT. "Bloom is WAY too bright, and the green is not working."
  // Two causes, and base was the bigger one: at 0.62 the shared fog field was
  // lighting the entire frame, which in a mood that also runs rays at 0.86 and
  // dapple at 0.82 means the light has nothing to be brighter THAN. Sunlight
  // reads as sunlight because of what it is next to; wash the shadows out and
  // it stops being light and becomes exposure. base comes down to forest's own
  // 0.44 and the two dark steps go deeper.
  //
  // The green was acid — #8cc25a is a yellow-green at high saturation, which is
  // new growth in April sun and reads as artificial over a whole frame. Cooler
  // and a little duller in the mid step, with the shadows kept green rather
  // than grey so it is still a wood full of leaves.
  'forest-blooming': {
    palette: ['#0d1a0b', '#294a22', '#5e9440', '#eaa9c5', '#fdf1e4'],
    params: { scale: 1.8, speed: 0.24, warp: 1.2, sparkle: 0.6, gloss: 0.12, glint: 0.14, canopy: 0.9, base: 0.44, drift: 0.35, travel: 0.5, travelX: 0.26, leaf: 0, flower: 0 },
    motifs: { columns: 0.75, dapple: 0.82, rays: 0.86, petals: 0.62, wisps: 0.25 },
    mappings: { warpBass: 0.4, sparkleTreble: 1.2, pulseFlux: 1.1, shiftCentroid: 0.35 },
  },

  // The same wood, and leaf: 1 — long pointed leaves with a rib, more of them,
  // each on its own swirling path. Blooming and autumn are kin, so a move
  // between them lerps this from 0 to 1 and the blossom becomes leaves in the
  // open, without the eye closing.
  //
  // BRASSY, BUT NOT A COPPER WASH — and this took overshooting in both
  // directions to find. The original ran amber and rust through every step,
  // which tinted the sky, the mist, the shafts and the trunks the colour of a
  // leaf; the owner called that "a lazy way to convey the colors of autumn",
  // and they were right that the light is not that colour. So it went cool and
  // olive, and that was worse: "the gloomy gray look isn't it, either. It just
  // looks sad. I prefer the brassy light to this."
  //
  // The mistake in the second attempt was treating "the colour is not in the
  // light" as "there is no colour in the light". Late autumn light IS warm —
  // low sun, thin air, everything reflecting off ten thousand yellow leaves —
  // it simply is not the same saturated copper as the leaves themselves. So the
  // palette is brass, one notch off the original's saturation in the mid steps,
  // and it now sits against leaves that carry their own oxblood-to-gold ramp
  // (see the u_leaf ramp in main) rather than being the only source of warmth.
  // Two related warms with a gap between them, instead of one flat one.
  'forest-autumn': {
    palette: ['#150f08', '#3a2a17', '#7d5a2c', '#cfa055', '#ffe6b0'],
    params: { scale: 1.8, speed: 0.22, warp: 1.15, sparkle: 0.55, gloss: 0.14, glint: 0.12, canopy: 0.8, base: 0.46, drift: 0.32, travel: 0.55, travelX: 0.28, leaf: 1 },
    motifs: { columns: 0.8, dapple: 0.7, rays: 0.72, petals: 0.8 },
    mappings: { warpBass: 0.45, sparkleTreble: 1.1, pulseFlux: 1.0, shiftCentroid: 0.3 },
  },

  // No canopy — and that is the mood, not a detail of it. With nothing
  // overhead the shafts arrive unbroken and weak instead of dappled and
  // shifting, the trunks carry the frame alone, and the light stops being the
  // subject. Grey-brown throughout, and nothing left in the air.
  //
  // petals was 0.12 — "a few last leaves", which sounded right and was not:
  // the motif never reaches zero, so leaves went on falling through a mood
  // whose whole subject is that they have finished falling. The owner's note
  // was that they "don't want to disappear when I switch to barren", and they
  // were correct that nothing was making them stop. Barren is bare.
  //
  // AND NOT MONOCHROME. "Make it white" was doing all the work of saying dry
  // and dead, and one colour cannot carry a whole mood — the owner's note.
  // bark: 0.62 gives the trunks a material of their own, bleached bone through
  // pale dusty brown, varying from trunk to trunk; the mColumns cylinder term
  // then shades each one round. The palette stays cold and pale, so the brown
  // is a warmth found among the white rather than a recolour of it.
  'forest-barren': {
    palette: ['#171a1f', '#3d3f44', '#71757c', '#a8adb5', '#e9edf2'],
    params: { scale: 1.7, speed: 0.16, warp: 1.0, sparkle: 0.4, gloss: 0.1, base: 0.68, drift: 0.3, travel: 0.6, travelX: 0.3, bark: 0.8 },
    motifs: { columns: 0.95, rays: 0.5, petals: 0 },
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
  desert: ['desert-night'],
  'desert-night': ['desert'],
});

// Sub-moods that belong to MORE THAN ONE parent.
//
// The naming convention encodes a tree — `x-y` is a child of `x` — and a tree
// cannot say "belongs to both", which is exactly what a sunshower is. It is not
// a kind of rain that happens to be sunny, nor a kind of sunshine that happens
// to be wet; it is the one place the two overlap, and it was showing up as a
// mood in its own right because there is nothing in the NAME for the
// derivation to work from.
//
// Declared rather than derived for that reason, and kept beside KIN because it
// is the same sort of fact: a relationship between themes rather than a
// property of any one of them. This is not the duplicate parentage list the
// derivation exists to avoid — it says only what the names cannot.
const SHARED_CHILDREN = Object.freeze({
  sunshower: ['rain', 'sunshine'],
});

// Families, derived from the names. A theme called `x-y` is a sub-mood of `x`
// whenever `x` is itself in the list — which is why night-desert was renamed
// desert-night: it is a child of the desert, and the old name said it belonged
// to the night. Anything with no such parent stands on its own, unless
// SHARED_CHILDREN gives it parents the name cannot.
//
// Derived rather than declared so that adding a folder still costs one line in
// index.json. A second list of who-belongs-to-whom is a second thing to forget
// to update.
export function familiesOf(names) {
  const set = new Set(names);
  const parentOf = (n) => {
    const cut = n.indexOf('-');
    if (cut < 0) return null;
    const head = n.slice(0, cut);
    return set.has(head) ? head : null;
  };
  // Only counts as shared if every declared parent is actually present, so a
  // partial theme list degrades to the child standing on its own rather than
  // vanishing from the picker entirely.
  const sharedParents = (n) => {
    const ps = (SHARED_CHILDREN[n] || []).filter((p) => set.has(p));
    return ps.length ? ps : null;
  };
  const families = [];
  const byParent = new Map();
  for (const n of names) {
    if (parentOf(n) || sharedParents(n)) continue;
    const fam = { parent: n, children: [] };
    families.push(fam);
    byParent.set(n, fam);
  }
  for (const n of names) {
    const shared = sharedParents(n);
    if (shared) {
      for (const p of shared) if (byParent.has(p)) byParent.get(p).children.push(n);
      continue;
    }
    const p = parentOf(n);
    if (p && byParent.has(p)) byParent.get(p).children.push(n);
  }
  return families;
}

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
  cone: 0,      // ONE volcano: straight flanks, a flat cratered summit, a vent
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
  flock: 0,     // a murmuration: one body of birds, folded by its own flow
  moon: 0,      // a moon, and the light it puts on everything under it
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
  leaf: 0,    // what the petals motif is drawing. 0 is blossom: sparse, broad,
              // blunt, and moved by its own private flutter. 1 is dead leaves:
              // thicker, long and pointed with a rib, and moved by a gust the
              // whole frame shares. Continuous, so blooming morphs into autumn
              // rather than cutting to it — they are kin, and a season turns
  flower: 0,  // whether whole open blooms turn among the falling petals. Its
              // OWN parameter rather than a reading of leaf, and that is not
              // tidiness: gating the blooms on leaf < 0.35 meant a crossfade
              // between two flowerless moods (autumn's leaf 1, barren's 0) swept
              // through the window on the way and put blossom in a dead wood for
              // a second. A gate fires on the PATH between two themes, not on
              // their endpoints. Currently 0 everywhere — the rosette reads as
              // cartoonish at mote size (the owner's call) — but the shape is
              // still in the engine, so bringing it back is a data change
  heat: 0,    // how hot the air is: the shimmer over far ground and the haze
              // that bleaches the horizon. A property of the AIR, which is why
              // it is a parameter and not a palette — no arrangement of warm
              // colours distinguishes a hot landscape from a temperate one
  bark: 0,    // how far the trunks take a wood colour of their own instead of
              // standing as silhouettes. A wood with light still in it wants 0;
              // a barren one is nothing but its trunks and wants them legible
  meteors: 1, // whether the stars motif throws a shooting star on a strong
              // onset. On wherever there is a night sky to cross; off for
              // flock, whose subject is the birds — the owner's call, and the
              // right one: a meteor is an event, and a mood that already has
              // one does not want a second competing with it
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
