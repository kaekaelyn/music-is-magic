// Validates the drop-in asset contracts (§5.3 eye, §5.4 themes) so a bad
// drop shows up here instead of as a blank screen on someone's phone.
//
//   node tools/validate-assets.mjs
//
// Zero dependencies, and the only tool that must always run: M5's whole job is
// dropping files into these folders, and every check below is a mistake that
// would otherwise be silent (the portal is built to never throw on bad
// assets — it falls back, which is right at runtime and useless in review).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = join(ROOT, 'portal/assets/themes');
const EYE = join(ROOT, 'portal/assets/eye');

// scale/speed/warp must be positive; gloss and sparkle may legitimately be 0.
const KNOWN_PARAMS = [
  'scale', 'speed', 'warp', 'sparkle', 'gloss', 'slant', 'base', 'drift',
  'travel', 'travelX', 'travelY',
];
// travelX/travelY are a direction: negative is a legitimate way to point.
const SIGNED_PARAMS = ['travelX', 'travelY'];
const POSITIVE_PARAMS = ['scale', 'speed', 'warp'];
const KNOWN_MAPPINGS = [
  'warpBass', 'brightRms', 'sparkleTreble', 'pulseFlux', 'shiftCentroid',
];
const EYE_LAYERS = ['plate', 'socket', 'lid-lower', 'lid-upper', 'glow', 'frame'];
const HEX = /^#[0-9a-f]{6}$/i;

// The engine is the authority on what a motif is called; importing it here
// means a renamed motif fails validation instead of silently doing nothing.
const themesModule = await import(pathToFileURL(join(ROOT, 'portal/js/themes.js')));
const MOTIF_NAMES = Object.keys(themesModule.MOTIFS);
const PARAM_DEFAULTS = themesModule.DEFAULT_PARAMS;

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`${label}: ${err.message}`);
    return null;
  }
}

const dirs = (path) =>
  existsSync(path)
    ? readdirSync(path).filter((n) => statSync(join(path, n)).isDirectory())
    : [];

// --- §5.4 themes ---------------------------------------------------------

const index = readJson(join(THEMES, 'index.json'), 'themes/index.json');
let names = [];

if (index !== null) {
  if (!Array.isArray(index) || !index.length) {
    fail('themes/index.json: must be a non-empty array of theme names');
  } else if (!index.every((n) => typeof n === 'string')) {
    fail('themes/index.json: every entry must be a string');
  } else {
    names = index;
    // 'default' is the landing spot for every unknown token (§5.2) — if it
    // isn't listed, themes.js normalizes to a name it will then reject.
    if (!names.includes('default')) fail("themes/index.json: must include 'default'");
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) fail(`themes/index.json: duplicate entries: ${dupes.join(', ')}`);
    for (const n of names) {
      if (n !== n.trim().toLowerCase()) {
        fail(`themes/index.json: '${n}' must be lowercase and untrimmed of spaces`);
      }
    }
  }
}

for (const name of names) {
  const dir = join(THEMES, name);
  const label = `themes/${name}`;
  if (!existsSync(dir)) {
    fail(`${label}: listed in index.json but the folder is missing`);
    continue;
  }
  const file = join(dir, 'theme.json');
  if (!existsSync(file)) {
    // Legal at runtime (built-in palette renders) but almost always a mistake.
    warn(`${label}: no theme.json — the built-in palette will be used`);
    continue;
  }
  const t = readJson(file, `${label}/theme.json`);
  if (!t) continue;

  if (t.name !== name) {
    fail(`${label}/theme.json: name is '${t.name}', expected '${name}'`);
  }
  if (!Array.isArray(t.palette) || t.palette.length < 5) {
    fail(`${label}/theme.json: palette must be at least 5 entries (dark→light)`);
  } else {
    t.palette.slice(0, 5).forEach((c, i) => {
      if (!HEX.test(String(c))) {
        fail(`${label}/theme.json: palette[${i}] '${c}' is not #rrggbb`);
      }
    });
  }
  for (const [key, val] of Object.entries(t.params || {})) {
    if (!KNOWN_PARAMS.includes(key)) {
      fail(`${label}/theme.json: unknown param '${key}' (engine ignores it)`);
    } else if (!Number.isFinite(val) || (val < 0 && !SIGNED_PARAMS.includes(key))) {
      fail(`${label}/theme.json: params.${key} must be a non-negative number`);
    } else if (POSITIVE_PARAMS.includes(key) && val <= 0) {
      fail(`${label}/theme.json: params.${key} must be greater than zero`);
    }
  }
  for (const [key, val] of Object.entries(t.motifs || {})) {
    if (!MOTIF_NAMES.includes(key)) {
      fail(
        `${label}/theme.json: unknown motif '${key}' — the engine only has ` +
        `${MOTIF_NAMES.join(', ')} (a typo here is silently no motif at all)`
      );
    } else if (!Number.isFinite(val) || val < 0 || val > 1) {
      fail(`${label}/theme.json: motifs.${key} must be a number between 0 and 1`);
    }
  }
  for (const [key, val] of Object.entries(t.mappings || {})) {
    if (!KNOWN_MAPPINGS.includes(key)) {
      fail(`${label}/theme.json: unknown mapping '${key}' (engine ignores it)`);
    } else if (!Number.isFinite(val) || val < 0) {
      fail(`${label}/theme.json: mappings.${key} must be a non-negative number`);
    }
  }
  if (t.textures !== undefined && !Array.isArray(t.textures)) {
    fail(`${label}/theme.json: textures must be an array`);
  } else {
    for (const rel of t.textures || []) {
      // Resolved as assets/themes/<name>/<rel> by themes.js.
      if (!existsSync(join(dir, String(rel)))) {
        fail(`${label}/theme.json: texture '${rel}' does not exist`);
      }
    }
    if ((t.textures || []).length > 1) {
      warn(`${label}/theme.json: only textures[0] is used by the engine today`);
    }
  }
}

for (const found of dirs(THEMES)) {
  if (names.length && !names.includes(found)) {
    // Static hosting can't list directories, so an unlisted folder is invisible.
    warn(`themes/${found}: folder exists but is not in index.json — it will never load`);
  }
}

// Drift between the built-in fallbacks and theme.json. The built-ins exist so
// a failed fetch can't blank the site; if they disagree with the files, a slow
// network silently shows a different theme.
for (const name of names) {
  const builtin = themesModule.BUILTIN[name];
  const file = join(THEMES, name, 'theme.json');
  if (!builtin) {
    warn(`themes/${name}: no built-in fallback in js/themes.js`);
    continue;
  }
  if (!existsSync(file)) continue;
  const t = readJson(file, `themes/${name}/theme.json`);
  if (!t) continue;
  const a = JSON.stringify(builtin.palette);
  const b = JSON.stringify((t.palette || []).slice(0, 5));
  if (a !== b) fail(`themes/${name}: palette drift — js/themes.js ${a} vs theme.json ${b}`);
  // Compare against the merged view the engine actually builds, or every
  // param a theme leaves to its default would look like drift.
  const effective = { ...PARAM_DEFAULTS, ...builtin.params };
  for (const key of KNOWN_PARAMS) {
    if (t.params && t.params[key] !== undefined && effective[key] !== t.params[key]) {
      fail(
        `themes/${name}: params.${key} drift — js/themes.js ${effective[key]} ` +
        `vs theme.json ${t.params[key]}`
      );
    }
  }
  for (const key of MOTIF_NAMES) {
    const bv = (builtin.motifs || {})[key] || 0;
    const tv = (t.motifs || {})[key] || 0;
    if (bv !== tv) {
      fail(`themes/${name}: motifs.${key} drift — js/themes.js ${bv} vs theme.json ${tv}`);
    }
  }
}

// --- §5.3 eye ------------------------------------------------------------

// Shape-check the example even though its files don't exist: it is what an
// owner copies, so a broken example breaks the plug.
for (const [file, checkFiles] of [
  ['manifest.example.json', false],
  ['manifest.json', true],
]) {
  const path = join(EYE, file);
  if (!existsSync(path)) {
    // Both are shipped; absence of manifest.json is legal (procedural eye) but
    // means a visitor's every page load 404s on the fetch in eye.js.
    fail(`eye/${file}: missing — ship it, empty layers if there is no art yet`);
    continue;
  }
  const m = readJson(path, `eye/${file}`);
  if (!m) continue;
  if (!m.layers || typeof m.layers !== 'object') {
    fail(`eye/${file}: needs a 'layers' object`);
    continue;
  }
  if (m.aperture !== undefined) {
    for (const k of ['w', 'h']) {
      const v = m.aperture[k];
      if (v !== undefined && !(Number.isFinite(v) && v > 0 && v <= 0.5)) {
        // Fractions of the shared square box, so anything over 0.5 would put
        // the aperture's edge outside the art.
        fail(`eye/${file}: aperture.${k} must be a number between 0 and 0.5`);
      }
    }
  }
  if (file === 'manifest.json' && !Object.keys(m.layers).length) {
    warn('eye/manifest.json: no layers declared — the procedural eye renders (intended default)');
  }
  for (const [layer, spec] of Object.entries(m.layers)) {
    if (!EYE_LAYERS.includes(layer)) {
      fail(`eye/${file}: unknown layer '${layer}' (expected one of ${EYE_LAYERS.join(', ')})`);
      continue;
    }
    if (!spec || typeof spec.file !== 'string' || !spec.file) {
      fail(`eye/${file}: layer '${layer}' needs a 'file'`);
      continue;
    }
    if (checkFiles && !existsSync(join(EYE, spec.file))) {
      fail(`eye/${file}: layer '${layer}' points at missing file '${spec.file}'`);
    }
    if (spec.travel !== undefined && !(Number.isFinite(spec.travel) && spec.travel >= 0 && spec.travel <= 1)) {
      fail(`eye/${file}: layer '${layer}' travel must be a number between 0 and 1`);
    }
    if (spec.travel !== undefined && !layer.startsWith('lid-')) {
      warn(`eye/${file}: travel on '${layer}' is ignored — only lids travel`);
    }
  }
}

// --- report --------------------------------------------------------------

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);

if (errors.length) {
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(
  `\nassets ok — ${names.length} theme(s), ${warnings.length} warning(s)`
);
