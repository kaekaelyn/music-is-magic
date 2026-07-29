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
  default: {
    palette: ['#070810', '#181a33', '#463d6b', '#8d80b8', '#e9e4f2'],
    params: { scale: 1.5, speed: 0.3, warp: 1.1, sparkle: 0.5 },
  },
  forest: {
    palette: ['#05130a', '#0f3820', '#2f6b3a', '#7fae62', '#e2f2c5'],
    params: { scale: 1.8, speed: 0.28, warp: 1.25, sparkle: 0.45 },
  },
  cave: {
    palette: ['#07070b', '#161421', '#2e2741', '#5d5178', '#cdc4e6'],
    params: { scale: 2.2, speed: 0.18, warp: 1.5, sparkle: 0.75 },
  },
  ice: {
    palette: ['#040d18', '#0f2f4e', '#2b628f', '#79b3d8', '#eafaff'],
    params: { scale: 2.0, speed: 0.22, warp: 0.8, sparkle: 0.85 },
  },
  mountain: {
    palette: ['#0b0b10', '#26262e', '#4c4a55', '#8f8577', '#eadfc8'],
    params: { scale: 1.4, speed: 0.16, warp: 0.9, sparkle: 0.3 },
  },
  ocean: {
    palette: ['#02101c', '#043a57', '#0b6d85', '#39ac9b', '#c9f2e2'],
    params: { scale: 1.6, speed: 0.4, warp: 1.6, sparkle: 0.4 },
  },
  rain: {
    palette: ['#0a0e12', '#1d2a33', '#3a5464', '#6f909f', '#d3e3ea'],
    params: { scale: 2.4, speed: 0.5, warp: 1.0, sparkle: 0.6 },
  },
  sunshine: {
    palette: ['#170e04', '#553811', '#a06e1d', '#dfb84a', '#fff3c2'],
    params: { scale: 1.3, speed: 0.34, warp: 1.2, sparkle: 0.6 },
  },
};

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
    params: { ...base.params, ...(src.params || {}) },
    mappings: { ...DEFAULT_MAPPINGS, ...(src.mappings || {}) },
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
