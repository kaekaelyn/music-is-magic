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
    palette: ['#030714', '#101d40', '#1c3468', '#4467af', '#ecf3ff'],
    params: { scale: 1.2, speed: 0.14, warp: 0.7, sparkle: 0.7, gloss: 0.1, base: 0.66, drift: 0.18, travel: 0.12, travelX: 0.08 },
    motifs: { stars: 0.95, aurora: 0.65 },
    mappings: { warpBass: 0.2, brightRms: 0.5, sparkleTreble: 1.3, pulseFlux: 1.1, shiftCentroid: 0.15 },
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
    params: { scale: 1.8, speed: 0.22, warp: 1.25, sparkle: 0.45, gloss: 0.1, base: 0.55, drift: 0.35, travel: 0.55, travelX: 0.3 },
    motifs: { columns: 0.75, dapple: 0.85, rays: 0.5, wisps: 0.65 },
    mappings: { warpBass: 0.5, brightRms: 0.75, sparkleTreble: 1.2, pulseFlux: 1, shiftCentroid: 0.32 },
  },
  // Wet dark: a tunnel receding, crystal on its walls, and a drip now and then.
  // The low drips weight is the sparseness — see mDrips' duty cycle. crags is
  // gone from here: voronoi on the flat plane is what read as stained glass,
  // and `tunnel` is the same lattice in a space that recedes.
  cave: {
    palette: ['#05050a', '#12101d', '#2b2440', '#5f5280', '#d2dcef'],
    params: { scale: 2.0, speed: 0.1, warp: 0.55, sparkle: 0.8, gloss: 0.3, base: 0.5, drift: 0.05 },
    motifs: { columns: 0.2, drips: 0.15, tunnel: 0.75 },
    // brightRms cut low ON PURPOSE: a cavern that brightens when you play
    // reads as a light bulb behind rock. The cave's whole answer to the music
    // is its crystals (tunnel flare + face shimmer) and its drips.
    mappings: { warpBass: 0.18, brightRms: 0.25, sparkleTreble: 1.4, pulseFlux: 1.1, shiftCentroid: 0.1 },
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
    params: { scale: 2.0, speed: 0.16, warp: 0.5, sparkle: 1.0, gloss: 0.6, base: 0.55, drift: 0.02, travel: 0.25 },
    motifs: { facets: 0.9 },
    mappings: { warpBass: 0.06, brightRms: 0.55, sparkleTreble: 1.6, pulseFlux: 1.3, shiftCentroid: 0.1 },
  },
  // Ranges against the sky with snow near the tops. `ridge` supplies the
  // silhouette; crags is only surface texture on it. The landscape never
  // moves — that stillness is the mood — but the WEATHER answers the music:
  // spindrift tears off the near crest with loudness, dapple drifts past as
  // cloud-light shouldered by the room, and the snowline shimmers.
  mountain: {
    palette: ['#0a0d14', '#252d3a', '#525e6f', '#97aabe', '#f4f9ff'],
    // travel: a journey along the chain — each range passes at its own rate,
    // near ones fastest, sped by the music. The snow streams one way on the
    // same clock; nothing here ever slides back.
    params: { scale: 1.4, speed: 0.1, warp: 0.9, sparkle: 0.5, gloss: 0.2, base: 0.6, drift: 0.25, travel: 0.4 },
    motifs: { ridge: 0.9, crags: 0.16, snow: 0.78, dapple: 0.4 },
  },
  // The sea as one moving body. The watery fog is BACK (the owner missed
  // it: it looked more like ocean than the bare surf did) — but now it, the
  // caustics and the surf all ride the same current, down and slightly
  // across, on the flow clock. One direction, always; the music sets the
  // pace. Loudness also works the surf harder: sharper crests, more white.
  ocean: {
    palette: ['#02101c', '#043a57', '#0b6d85', '#39ac9b', '#c9f2e2'],
    params: { scale: 1.6, speed: 0.45, warp: 1.15, sparkle: 0.4, gloss: 0.35, base: 0.62, drift: 0.4, travel: 0.9, travelX: -0.05, travelY: 0.42 },
    motifs: { caustics: 0.7, foam: 0.75 },
    mappings: { warpBass: 0.35, brightRms: 0.65, sparkleTreble: 1, pulseFlux: 1, shiftCentroid: 0.15 },
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
    motifs: { columns: 0.15, drips: 0.95 },
    mappings: { warpBass: 0.4, brightRms: 0.6, sparkleTreble: 1, pulseFlux: 1.1, shiftCentroid: 0.2 },
  },
  // Shafts. Slow, wide, and the brightest thing in the set. The top steps
  // are saturated GOLD now, not cream — the rays carry their own colour after
  // the ramp (mix of c3/c4), so golden light means golden steps, per the rule
  // that light of a colour is a material. Onsets kick the fan sideways and
  // flare it: the beams dance rather than merely brighten.
  sunshine: {
    palette: ['#0d2340', '#2f5f8c', '#8fb6cf', '#f2a93b', '#ffd873'],
    // clouds: billows that build with loudness and drift one way on the
    // travel clock, every sunward edge rimmed in the palette's gold.
    params: { scale: 1.3, speed: 0.26, warp: 0.9, sparkle: 0.5, gloss: 0.2, base: 0.3, drift: 0.3, travel: 0.3, travelX: 0.2 },
    motifs: { rays: 0.95, dapple: 0.3, clouds: 0.55 },
    mappings: { warpBass: 0.15, brightRms: 0.7, sparkleTreble: 1.0, pulseFlux: 1.15, shiftCentroid: 0.2 },
  },
};

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
});

// Spread under every theme so each one carries every key. Morphing is then a
// plain lerp with nothing missing on either side, exactly as with motifs.
export const DEFAULT_PARAMS = Object.freeze({
  scale: 1.5,
  speed: 0.3,
  warp: 1.1,
  sparkle: 0.5,
  gloss: 0,   // hardens the palette ramp and lets specular through
  slant: 0,   // how far falling things lean from vertical — wind, basically
  base: 1,    // how much the shared fog field contributes; 0 leaves a dark floor
  drift: 1,   // how fast that field evolves; 0 freezes it into something solid
  travel: 0,  // rate of the flow clock: how fast this theme journeys, sped by
              // loudness. 0 = a place you stand in; >0 = a place you move through
  travelX: 0, // direction the texture-space frame is carried by that clock —
  travelY: 0, // the current. Motifs also read the clock along their own axes.
});

const DEFAULT_MAPPINGS = {
  warpBass: 0.9,      // bass energy deepens the domain warp
  brightRms: 0.6,     // loudness lifts the palette's bright end
  sparkleTreble: 1.0, // treble drives glints
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
