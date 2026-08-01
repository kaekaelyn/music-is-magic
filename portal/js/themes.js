// §5.4 — themes are pure data. The engine never changes per theme.
//
// Each theme: 5-step palette (dark→light), engine params, and mappings —
// gains that say how strongly each audio feature drives its visual parameter.
// The same definitions live in assets/themes/<name>/theme.json (the editable
// source); these built-ins keep the site alive if a fetch ever fails.

// Exported so tools/validate-assets.mjs can catch drift between these
// fallbacks and the theme.json files they mirror — a silent divergence would
// only show up as "the site looks different when the network is slow".
export const BUILTIN = {
  // Night sky. The reserved fallback used to sit at almost exactly cave's
  // colour and behave like it, so the one theme a visitor sees if a fetch ever
  // fails read as a duplicate of another mood. A sky is the right character
  // for it: it is what is there before any weather arrives, it is legible at
  // a glance, and nothing else in the set is looking upward.
  default: {
    // Not as dark as a real night sky, deliberately: this is the look a
    // visitor gets if theme.json ever fails to load, and an aperture that
    // barely differs from sealed stone reads as broken rather than as night.
    palette: ['#050614', '#131b3d', '#2d3c6e', '#6274ab', '#f2f4ff'],
    params: { scale: 1.2, speed: 0.14, warp: 0.7, sparkle: 0.7, gloss: 0.1, base: 0.62, drift: 0.18 },
    motifs: { stars: 0.9 },
    mappings: { warpBass: 0.2, brightRms: 0.5, sparkleTreble: 1.3, pulseFlux: 1, shiftCentroid: 0.15 },
  },
  // Light coming down through a canopy onto trunks, with wisps between them.
  // The palette's second step is grey-brown rather than green on purpose: the
  // columns subtract mass, so they take their colour from the ramp's low end —
  // an all-green ramp made them green fog instead of trunks.
  forest: {
    palette: ['#050f0a', '#2b2b23', '#3f6b40', '#8bb069', '#e8f4d2'],
    params: { scale: 1.8, speed: 0.22, warp: 1.25, sparkle: 0.45, gloss: 0.1, base: 0.46, drift: 0.35 },
    motifs: { columns: 0.85, dapple: 0.55, rays: 0.28, wisps: 0.5 },
    mappings: { warpBass: 0.5, brightRms: 0.6, sparkleTreble: 1, pulseFlux: 1, shiftCentroid: 0.2 },
  },
  // Wet dark: a tunnel receding, crystal on its walls, and a drip now and then.
  // The low drips weight is the sparseness — see mDrips' duty cycle. crags is
  // gone from here: voronoi on the flat plane is what read as stained glass,
  // and `tunnel` is the same lattice in a space that recedes.
  cave: {
    palette: ['#05050a', '#12101d', '#2b2440', '#5f5280', '#d2dcef'],
    params: { scale: 2.0, speed: 0.1, warp: 0.55, sparkle: 0.8, gloss: 0.3, base: 0.5, drift: 0.05 },
    motifs: { columns: 0.2, drips: 0.15, tunnel: 0.75 },
    mappings: { warpBass: 0.18, brightRms: 0.62, sparkleTreble: 1.4, pulseFlux: 0.7, shiftCentroid: 0.1 },
  },
  // Shards with lit seams. The one theme where the field is hard-edged.
  ice: {
    palette: ['#04101c', '#0d2b45', '#2f6f96', '#8fc8e0', '#f2fbff'],
    params: { scale: 2.0, speed: 0.16, warp: 0.5, sparkle: 1.0, gloss: 0.6, base: 0.55, drift: 0.02 },
    motifs: { facets: 0.9 },
    mappings: { warpBass: 0.06, brightRms: 0.6, sparkleTreble: 1.6, pulseFlux: 1, shiftCentroid: 0.1 },
  },
  // Ranges against the sky with snow near the tops. `ridge` supplies the
  // silhouette — the thing that was missing when this was crags alone, and
  // the reason it read as stained glass rather than as mountains — and crags
  // is now only the surface texture on it, at a much lower weight.
  mountain: {
    palette: ['#0a0d14', '#252d3a', '#525e6f', '#97aabe', '#f4f9ff'],
    params: { scale: 1.4, speed: 0.1, warp: 0.9, sparkle: 0.5, gloss: 0.2, base: 0.6, drift: 0.25 },
    motifs: { ridge: 0.9, crags: 0.16, snow: 0.7 },
  },
  // Caustics from under the surface, and the surface itself above them.
  ocean: {
    palette: ['#02101c', '#043a57', '#0b6d85', '#39ac9b', '#c9f2e2'],
    params: { scale: 1.6, speed: 0.4, warp: 1.6, sparkle: 0.4, gloss: 0.35 },
    motifs: { caustics: 0.75, foam: 0.6 },
  },
  // The same drips as cave, dense and fast — that is what the weight means —
  // but blown off vertical, which is the difference between weather and a
  // ceiling. Cave keeps slant at 0: nothing underground is windy.
  rain: {
    palette: ['#0a0e12', '#1d2a33', '#3a5464', '#6f909f', '#d3e3ea'],
    params: { scale: 2.4, speed: 0.55, warp: 1.0, sparkle: 0.5, gloss: 0.25, slant: 0.34, base: 0.7, drift: 0.8 },
    motifs: { columns: 0.15, drips: 0.95 },
    mappings: { warpBass: 0.4, brightRms: 0.6, sparkleTreble: 1, pulseFlux: 1, shiftCentroid: 0.2 },
  },
  // Shafts. Slow, wide, and the brightest thing in the set.
  sunshine: {
    palette: ['#0d2340', '#2f5f8c', '#8fb6cf', '#f5c257', '#fff0b8'],
    params: { scale: 1.3, speed: 0.26, warp: 0.9, sparkle: 0.5, gloss: 0.2, base: 0.3, drift: 0.3 },
    motifs: { rays: 0.95, dapple: 0.3 },
    mappings: { warpBass: 0.15, brightRms: 0.7, sparkleTreble: 1.0, pulseFlux: 1, shiftCentroid: 0.2 },
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
  foam: 0,      // swell with breaking white water on the crests
  stars: 0,     // fixed points of light and a faint band of them — night sky
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
});

const DEFAULT_MAPPINGS = {
  warpBass: 0.9,      // bass energy deepens the domain warp
  brightRms: 0.6,     // loudness lifts the palette's bright end
  sparkleTreble: 1.0, // treble drives glints
  pulseFlux: 1.0,     // onsets ripple outward
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

  // Unknown or empty token → default. Never an error (§5.2).
  async function load(token) {
    let name = String(token || '').trim().toLowerCase();
    if (!names.includes(name)) name = 'default';
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
