# Tools

Dev-only. Nothing under `portal/` depends on anything here, and Cloudflare
Pages never sees this folder — which is exactly why `package.json` lives here
and not at the repo root (a root manifest would tempt Pages into an install
step the portal doesn't have and doesn't want).

```sh
node tools/validate-assets.mjs   # zero dependencies, run it anywhere

cd tools && npm install && npm test   # validator + headless smoke test
```

## `validate-assets.mjs`

Checks the drop-in contracts — `index.json` against the theme folders,
palettes, engine params and mappings against what the engine actually reads,
texture paths, and the eye manifest's layers against the files they name. It
also compares each `theme.json` with its built-in fallback in
`portal/js/themes.js`.

This exists because the portal is deliberately unbreakable: a bad palette, an
unknown mapping key or a missing texture all degrade silently to something
that still renders. That is right at runtime and useless in review, so the
checks live here instead. Run it after any M5 asset drop.

Exit code 1 on errors; warnings (an unlisted theme folder, a manifest with no
layers yet) never fail the run.

## `smoke.mjs`

Drives the whole §2.1 ceremony in headless Chromium against a status endpoint
the test process owns: sealed → two positive polls → stirring → open → click →
communing → theme morph → unknown-token fallback → drowse → resume → seal, plus
the control page, the summons rune, WebGL context loss and restore, and a
`prefers-reduced-motion` pass. Any console error, page error or failed request
fails the run.

Two things it leans on, both worth knowing before editing:

- `?fast=1` (mock mode only, see `js/config.js`) shortens the poll interval and
  the 90s drowse window. The 2.6s stir is never shortened — it is the brand, and
  a test that skips it isn't testing the thing anyone will actually see.
- The mock status endpoint is served from the test process itself, so flipping
  the stream live is a variable assignment. No control endpoint, and no test
  hooks in portal code.

If a chromium is already on the machine it is used as-is
(`PLAYWRIGHT_BROWSERS_PATH/chromium`, or `MIM_CHROMIUM` to point somewhere
else), so a build-number mismatch with whatever npm resolved doesn't force a
browser download.
