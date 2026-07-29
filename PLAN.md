# Music Is Magic — Master Plan

> **Status:** Planning locked 2026-07-25. This is a living document and the single
> source of truth. Build sessions: read this file first, follow the milestone
> you're assigned, and update §11 (Open Items) and §4 (Decisions) as things
> resolve. Chat history does not survive between sessions — this file does.

---

## 1. Vision

An audio-only livestream site with little to no visitor-facing text.
Instrumental improvised music, no schedule — the site is either live or dormant.

Dormant: a closed eye, druidic graphic design, passive and patient.
Live: the eye opens, and a nature-themed visualization breathes with the
music in real time on each visitor's own device.

No accounts, no analytics beyond Cloudflare's free basics, no cookies,
no consent banners. The site is a place, not a product.

---

## 2. The Experience

### 2.1 Eye states

The eye is **carved, not drawn**: a stone plate — golem, idol — with a
lens-shaped aperture cut through it, in a dark room. Nothing about it is
anatomical; a stylized human eye reads as cartoon at this scale, and stone
does not blink.

The aperture is a **window onto the visualization**, not a decoration over it.
Where an iris and pupil would be, there is the moving field. Sealed, there is
nothing to see but stone; open, you see what is inside the eye. That inversion
is the design — everything else follows from it, including the fact that light
spilling onto the surrounding stone is the only place a theme colors anything
outside the aperture.

The eye is a state machine, not a boolean. The names below are used in code.

| State | Trigger | Look & feel |
|---|---|---|
| **Sealed** | No live source (steady state) | Stone, and a carved slit where the aperture will part. Nothing inside. The life-sign is a slow ember in the seam (~8s cycle) rather than movement — the page must feel patient, not broken, and stone that breathes stops being stone. |
| **Stirring** | Source detected (2 consecutive positive polls) | The opening ceremony: the stone parts over a deliberate 2–3s, and the field appears inside. This transition is the brand. |
| **Open** | Live, but visitor hasn't interacted yet | Aperture open on a dim field, faint light spilling onto the stone. Autoplay is blocked by browsers — the eye itself is the click target that unlocks audio. |
| **Communing** | Visitor clicked while live | Audio playing; the field inside the aperture is driven by the stream and the current theme, and the aperture widens slightly with the low end. |
| **Drowsing** | Signal lost while Open/Communing | The aperture narrows to a slit, up to **90 seconds**. The field dims and slows. If the source returns → resume (reload audio src, `play()`); if not → Sealed. |

State-change hygiene: **opening** requires 2 consecutive positive polls
(no flicker on a fluke); **closing** goes through Drowsing (no slam on a
dropped packet). A single failed fetch never changes the eye.

### 2.2 Visitor journey

1. Arrive → Sealed eye, nothing to read, nothing to click that looks clickable. Or: the eye is already Open — the invitation.
2. Click the open eye → audio begins, visualization blooms (Communing).
3. Stream ends → eye drowses, then seals. The visitor watched it fall asleep.

### 2.3 Dropout behavior (decided: drowse-then-close)

Streaming happens from a phone, plausibly outdoors; cell hiccups are normal
operations, not errors. The 90s drowse window covers reconnection without
lying to the visitor. No fallback ambience loop — silence is honest.

---

## 3. Architecture

```mermaid
flowchart LR
    subgraph phone [Streamer's phone]
        CM[Cool Mic\nAndroid source app]
        CTRL[/control.html\ntheme buttons/]
    end
    subgraph vps [VPS ~$4-5/mo]
        CADDY[Caddy\nHTTPS + CORS]
        ICE[Icecast\n/live mount]
        LS[Liquidsoap\ncontingency: Ogg to MP3]
        CADDY --> ICE
        LS -.-> ICE
    end
    subgraph cf [Cloudflare Pages, free]
        PORTAL[Portal: eye + viz engine\nstatic HTML/JS/WebGL]
    end
    NTFY[ntfy.sh topic]
    V((Visitor))

    CM -->|source stream| CADDY
    CTRL -->|metadata updates| CADDY
    ICE -->|on-connect hook| NTFY
    V --> PORTAL
    PORTAL -->|poll status-json.xsl every 5s| CADDY
    PORTAL -->|audio element + Web Audio analyser| CADDY
    NTFY -.->|push| V
    NTFY -.->|someday| ESP32[ESP32 lamp]
```

All visualization compute happens in the visitor's browser. The server does
nothing but move audio bytes and answer a status poll.

---

## 4. Decisions (locked)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Streaming server | Icecast 2 | Free, proven internet-radio standard, status JSON, metadata, mount hooks. |
| D2 | Server host | Cheap VPS (~$4–5/mo, e.g. Hetzner / RackNerd) | Reliable, minutes to provision. Oracle free tier rejected: provisioning roulette + reclaim risk not worth $5. |
| D3 | TLS + CORS | Caddy reverse proxy in front of Icecast | Automatic HTTPS (Pages is HTTPS; mixed content would block everything). Adds CORS headers, without which the status fetch fails and the Web Audio analyser silently reads zeros. |
| D4 | Phone source app | Cool Mic (Android, free) | Streamer is on Android. BUTT on desktop as fallback. |
| D5 | Listener mount format | **MP3, 192 kbps**, mount `/live` | Only universally playable format (iOS Safari can't play Ogg) **and** the only one accepting Icecast admin metadata updates — which is our entire theme mechanism. 192k suits instrumental music; ~86 MB/hr per listener is fine. |
| D6 | Codec escape hatch | Liquidsoap on the VPS transcoding Ogg→MP3 | If Cool Mic can't source MP3 directly (verify in M2), phone streams Ogg to a Liquidsoap harbor input; Liquidsoap feeds Icecast `/live` as MP3. Decided in advance, not discovered in week three. |
| D7 | Portal hosting | Cloudflare Pages (free) | Static, global, $0. |
| D8 | Live detection | Portal polls `status-json.xsl` every 5s | No backend, no websocket infra. See §5.1. |
| D9 | Theme control | Metadata "song" field carries a bare theme token; hidden `/control.html` sends it | See §5.2, §5.6. Zero extra backend. |
| D10 | Visualization | One WebGL engine; themes are pure data (palette + params + **motif weights** + mappings + textures). Canvas2D fallback for weak devices | Adding a theme = adding a folder. Engine code never changes per theme. Motifs (§5.4) are how a theme gets character without breaking that: the engine holds the library, the theme picks from it. |
| D11 | Art pipeline | All visual assets are **drop-in plugs** per manifest contracts (§5.3, §5.4). Engine ships with procedural placeholders for every slot | Owner generates/refines AI art separately, on their own schedule, and swaps files — never code. |
| D12 | Dropout posture | Drowse (90s half-lidded grace) then Sealed | Honest but forgiving of cell hiccups. |
| D13 | Go-live alerting | Icecast per-mount `on-connect`/`on-disconnect` hooks curl an ntfy.sh topic | No watcher process, no cron. Visitors and (someday) an ESP32 lamp subscribe to the same topic. |
| D14 | Analytics/privacy | None beyond Cloudflare's free aggregate stats | No cookies, no banners, fits the aesthetic. |
| D15 | Visitor notification transport | A link to the ntfy topic page (§5.7), not Web Push | Web Push needs VAPID keys, a service worker and a permission prompt — a backend and an interruption, for something ntfy already does. |
| D17 | The eye's form | Carved stone (golem/idol) with a lens aperture; the visualization lives **inside** the aperture, not behind the eye | A stylized human eye — sclera, iris, lashes — reads as cartoon at full-screen scale. And a field behind a floating eye is wallpaper; a field seen *through* carved stone is the thing the site is about. Reverses the first implementation. See §2.1. |
| D16 | Dev tooling | `tools/` holds a zero-dep asset validator and a headless smoke test; `tools/package.json` keeps npm out of the repo root | The portal must stay buildless and dependency-free (§12); the contracts in §5 still need something that fails loudly, because the portal is built to fail silently. |

---

## 5. Contracts

These interfaces are the airtight part. Build sessions implement *to* them;
changing one means updating this file.

### 5.1 Status polling

- `GET https://stream.<domain>/status-json.xsl?t=<epoch-ms>` (cache-bust param; Caddy/CF must not cache).
- Interval: 5s ± 1s jitter. Pause polling when `document.hidden`; poll immediately on visibility regain.
- Icecast quirk: `icestats.source` is an object when one mount, an **array** when several, absent when none. Normalize defensively.
- Live = a source entry whose `listenurl` ends in `/live`.
- Theme = that source's `title` (or `song`) field, lowercased, trimmed. Unknown/empty → `default` theme. Never an error.

### 5.2 Theme metadata protocol

- The metadata "song" field carries a bare token: `forest`, `cave`, `ice`, `mountain`, `ocean`, `rain`, `sunshine` (initial set; `default` reserved).
- Update endpoint: `GET /admin/metadata?mount=/live&mode=updinfo&song=<token>` with Icecast admin basic auth.
- Caddy exposes **only** `/admin/metadata` from the admin surface, with CORS (including `Authorization` header + preflight) so `/control.html` can call it cross-origin. The rest of Icecast admin stays unexposed.
- Unknown tokens are silently treated as `default` — typos can never break a live stream.

### 5.3 Eye asset plug

```
portal/assets/eye/
  manifest.json      # ships with no layers → built-in procedural eye
  plate.(svg|png)    # the stone face, aperture left transparent
  socket.(svg|png)   # carved rim + inner shadow, over the field's edge
  lid-upper.(svg|png)
  lid-lower.(svg|png)
  glow.(png)
  frame.(svg|png)    # surrounding druidic ornament, optional
```

`manifest.json` declares which layer files exist, the aperture the field is
clipped to, and per-layer motion hints (e.g. how far lids travel). The engine
animates whatever layers are present and procedurally fills the rest.
**Dropping art in never requires a code change**, and partial drops are fine.
The shipped manifest declares no layers — equivalent to having none, but
without a 404 on every page load.

There is no eyeball to author. See §2.1: the aperture is a window onto the
visualization, so the art is stone and the hole in it. `aperture: {w, h}`
(fractions of the shared square box) is the one value that must agree with
the art, since it decides where the field is clipped.

### 5.4 Theme asset plug

```
portal/assets/themes/
  index.json               # ordered list of theme names (static hosting can't list dirs)
  <name>/
    theme.json             # palette, texture list, feature→parameter mappings
    textures/*.webp        # suggested: 3–6 images, 1024×1024, seamless preferred
```

A theme with `theme.json` but no textures renders procedurally in its
palette. Adding theme #8 later = new folder + one line in `index.json`.

**Motifs.** A palette and four scalars only ever produced the same fog in
different colors, which is not a mood. So the engine compiles in a fixed
library of procedural motifs and a theme declares which ones it is made of:

| Motif | What it is | Used by |
|---|---|---|
| `rays` | shafts of light from above | sunshine, forest |
| `columns` | irregular vertical masses — trunks, formations | forest, cave, mountain |
| `dapple` | patches of light drifting at their own rate | forest, sunshine |
| `drips` | falling streaks | cave, rain |
| `facets` | crystal shards with a lit seam where they meet | ice |
| `caustics` | undulating light web | ocean |
| `crags` | angular rock planes, each catching the light its own way | mountain |
| `snow` | accumulation on whichever crag faces tilt skyward, below a snowline | mountain |

```json
"motifs": { "rays": 0.85, "dapple": 0.25 },
"params": { "gloss": 0.2, ... }
```

Weights are 0–1 and every theme carries every key (absent = 0), so morphing
between two themes is a plain lerp and a motif the target lacks fades out
rather than snapping off. Weight is not purely opacity: `drips` reads its own
weight as **density** — both how many lanes exist and how often a lane fires —
which is why a cave's occasional seep and hard rain are the same motif at two
settings rather than two motifs. Brightness stays nearly constant across that
range, or the sparse case just disappears. `gloss` hardens the palette ramp and
lets specular highlights through — the difference between weather and ice.

This keeps D10 intact: the motifs are engine code that never changes per
theme, and a theme is still only data. Adding a *motif* is an engine change
and should be rare — reserve it for a material the library genuinely lacks,
the way `snow` was. Adding a theme is still a folder.

Two findings worth not rediscovering:

- **Regular banding reads as electronic.** A horizontal-strata motif, however
  warped, looked like VHS scanlines inside a glowing aperture. It was replaced
  by `crags`. Anything with a repeating axis will have the same problem.
- **Clean voronoi reads as mosaic.** `crags` warps its lattice with noise
  before cells are found, and blends snow coverage with noise rather than
  taking it per-cell — otherwise the facets tile like cracked glass, which is
  `facets`' job, not rock's.
- **Check the sign of anything that moves.** `uv.y` increases upward, so
  `uv.y * k + t` falls and `uv.y * k - t` rises. Drips shipped rising and rays
  shipped lighting the aperture from below; neither is visible in a
  screenshot. There is no automated guard — the composited output is dominated
  by the base field's drift and the socket shading, so nothing measured from it
  isolates one motif's motion. Two attempts at a smoke check were too flaky to
  keep. Reason about the sign, then watch it move.

### 5.5 Audio features → visualization

The engine extracts one fixed feature set per animation frame from an
`AnalyserNode`; themes map features to visuals declaratively in `theme.json`.

- `bass`, `mid`, `treble` — band energies, normalized 0–1 with slow auto-gain so quiet and loud passages both use the full range.
- `rms` — overall loudness.
- `flux` — spectral flux (attack/onset detector).
- `centroid` — brightness of timbre.

Requirements: `<audio crossorigin="anonymous">`, CORS on the stream mount
(else the analyser silently returns zeros — this is D3's second job).
On drowse→resume, reset the audio element `src` and call `play()`
(live streams don't resume from a stall; the original click gesture keeps
`play()` permitted).

### 5.6 Control page

`portal/control.html` — unlisted, plain, owner-only by obscurity + admin password.

- First visit: enter Icecast admin password once → localStorage.
- Then: big theme buttons + a live-status glow (it runs the same §5.1 poll). Buttons are generated from `assets/themes/index.json`, so adding a theme folder updates the control page with zero edits here.
- Buttons `fetch()` the §5.2 endpoint with an `Authorization: Basic` header.
- Threat model: it's a radio station theme switcher on the owner's own phone; localStorage is acceptable. The password grants access to `/admin/metadata` only (see §5.2 exposure rule).
- Fallback if ever needed: browser bookmarks hitting the same URL.

### 5.7 Summons opt-in (M6, visitor side)

The server side of D13 already pushes to an ntfy topic when the source
connects. The visitor side is the smallest thing that can work: a link.

- `NTFY_TOPIC` in `portal/js/config.js` — empty by default. Empty means
  `main.js` **removes the element from the DOM**, so the feature does not exist
  until the owner opts in. It is the second and last production config edit.
- When set: a small sigil (no text) fades in at the bottom of the screen, and
  **only while the eye is Sealed** — once the eye is open there is nothing to be
  notified about, so it withdraws. Opacity 0.22, 0.6 on hover/focus.
- Tapping it opens `https://ntfy.sh/<topic>`, where the visitor subscribes in
  the ntfy app or web client. No Web Push keys, no service worker, no backend,
  no permission prompt from us — consistent with D14, and $0.
- The topic is unguessable-random, and anyone holding it can post to it as well
  as read (§6). That is the accepted trade for having no backend; the worst case
  is a stranger sending a false "the eye opens" to subscribers.

---

## 6. Server spec

- Debian stable, 1 vCPU / 1 GB is ample. `ufw` (22, 80, 443 only), `unattended-upgrades`.
- Icecast bound to localhost; Caddy is the only public listener. Caddy sketch:

```
stream.example.com {
    @cors_paths path /live /status-json.xsl /admin/metadata
    header @cors_paths Access-Control-Allow-Origin https://example.com
    header @cors_paths Access-Control-Allow-Headers Authorization
    reverse_proxy localhost:8000
}
```

(Preflight/OPTIONS handling and blocking `/admin/*` except `/admin/metadata`
to be fleshed out in M2.)

- Strong distinct source + admin passwords; never committed — `server/` holds config **templates** with placeholders and a setup doc.
- ntfy hooks in `icecast.xml` on the `/live` mount:
  `<on-connect>` → script curls `https://ntfy.sh/<unguessable-topic>` ("the eye opens");
  `<on-disconnect>` → optional companion. Topic name is a secret-ish random string (anyone holding it can subscribe/post — acceptable).
- If D6's escape hatch activates: Liquidsoap systemd service, harbor input (phone connects here) → MP3 encode → Icecast `/live`.

---

## 7. Milestones

Each is sized for one focused build session. **Done when** is the acceptance test.

| # | Name | Scope | Done when |
|---|---|---|---|
| M1 | **The Sealed Eye** | Portal on Cloudflare Pages: full state machine (§2.1), §5.1 poller against a mock status endpoint, procedural placeholder eye honoring the §5.3 manifest contract, click-to-unlock wiring, domain connected. | Flipping the mock opens the eye on the production URL, on a phone. |
| M2 | **First Breath** | VPS + Caddy + Icecast per §6; Cool Mic streaming; swap the portal's endpoint config to the real server. **Go/no-go here:** verify Cool Mic MP3 sourcing; activate D6 (Liquidsoap) if not. Also verify metadata updates land on the mount. | A friend's iPhone hears live playing at the real domain, eye open, over cell data. |
| M3 | **The Pulse** | Web Audio feature extraction (§5.5) + WebGL engine + `default` theme, all procedural. Canvas2D fallback. Drowse/resume audio handling. | Visualization visibly, pleasingly reacts to live playing on a mid-range phone at smooth framerate. |
| M4 | **The Moods** | Theme system: `index.json`, `theme.json` loader, morph transition between themes, `/control.html` (§5.6). Seven themes defined with procedural looks (empty texture folders). | Tapping "cave" on the phone mid-stream morphs every viewer's visualization within one poll cycle. |
| M5 | **The Gallery** | Owner generates AI texture banks + eye art separately and drops them in per §5.3/§5.4. Build session only assists: validates manifests (`tools/validate-assets.mjs`), tunes motif weights and mappings against `tools/shots.mjs`, optimizes images. | At least one theme runs on real textures with zero code edits — proving the plug. |
| M6 | **The Summons** | ntfy on-connect hooks (§6); portal gets a subtle opt-in for notifications (§5.7). ESP32 lamp: someday, `hardware/`, subscribes to the same topic. | Phone buzzes "the eye opens" within seconds of the source connecting. |

---

## 8. Risks & escape hatches

| Risk | Likelihood | Mitigation |
|---|---|---|
| WebGL context lost on a backgrounded phone tab | Routine on mobile | Engine catches `webglcontextlost`/`restored` and rebuilds its GPU objects; animation state survives. Covered by the smoke test. |
| Audio element stalls while the status poll still says live | Likely on cell data | 4s watchdog re-primes `src` when the playhead stops advancing (§5.5). |
| Cool Mic can't source MP3 | Real — verify first in M2 | D6: Liquidsoap transcode, planned in advance. |
| Ogg mount would break both Safari playback **and** metadata updates | Certain if Ogg-only | D5: MP3 listener mount, non-negotiable. |
| Mixed content / CORS silently breaks polling or zeroes the analyser | Certain without action | D3: Caddy from day one; `crossorigin` attr; §5.5 requirements. |
| Cell dropouts mid-stream | Routine | D12 drowse; 2-poll open hygiene; resume logic in §5.5. |
| Autoplay blocked | Certain | By design: the eye is the unlock gesture (§2.1 Open). |
| WebGL too heavy on old phones | Possible | D10 Canvas2D fallback; feature-detect. |
| Streaming piano through a phone mic sounds thin | Likely eventually | Phone mic is fine for v1. USB audio interface on Android is hit-or-miss with source apps — test with Cool Mic; BUTT on a laptop is the quality fallback (D4). |
| VPS dies / config lost | Someday | `server/` holds templated configs + a rebuild doc; rebuild is <1hr. |

---

## 9. Costs

| Item | Cost |
|---|---|
| Domain (Cloudflare Registrar, at-cost) | ~$10/yr |
| VPS | ~$4–5/mo |
| Cloudflare Pages, Icecast, Caddy, Liquidsoap, ntfy.sh, Cool Mic, BUTT | $0 |
| AI image generation for texture banks | One-time, owner-side |
| ESP32 + LED (optional, someday) | ~$10 one-time |

Steady state: **≈ $5/mo + $10/yr.** No cost scales with listener count until
well past a hobby audience (bandwidth: ~86 MB/listener-hour at 192 kbps).

---

## 10. Repo layout

```
PLAN.md            ← this file (single source of truth)
README.md          ← one paragraph + pointer here
portal/            ← static site → Cloudflare Pages
  index.html
  control.html
  js/  css/
  _headers         ← Pages response headers (Pages consumes, never serves)
  robots.txt
  assets/eye/      ← §5.3 plug
  assets/themes/   ← §5.4 plug
server/            ← icecast/caddy/(liquidsoap) config TEMPLATES + setup doc
                     (placeholders only — real secrets never committed)
tools/             ← dev-only: asset validator + headless smoke test (D16).
                     npm lives here and nowhere else; portal/ has no deps.
hardware/          ← empty until the ESP32 day
```

---

## 11. Open items

| Item | Owner | Needed by |
|---|---|---|
| Pick + register domain name | Owner | M1 |
| Deploy `portal/` to Cloudflare Pages (no build command, output dir = `portal`), connect domain | Owner | M1 |
| Set `STREAM_BASE` in `portal/js/config.js` once the server exists | M2 session | M2 |
| Pick VPS vendor (Hetzner vs RackNerd vs other) | Owner | M2 |
| Verify Cool Mic MP3 sourcing (activates/retires D6) | M2 session | M2 |
| Confirm/adjust initial theme list (currently the 7 in §5.2) | Owner | M4 |
| Generate the ntfy topic string, put it in `server/ntfy-on-connect.sh` **and** `NTFY_TOPIC` in `portal/js/config.js` (§5.7) | Owner | M6 |
| USB audio interface vs phone mic for piano | Owner | Whenever sound quality itches |

---

## 12. Handoff notes for build sessions

- Read this file before writing code. Implement to the contracts in §5.
- Keep the portal dependency-free: plain HTML/CSS/JS + WebGL. No frameworks, no build step, no npm. It must deploy to Pages as-is and still make sense in five years. Dev tooling is exempt but stays inside `tools/` (D16).
- Run `cd tools && npm test` before committing portal changes. It is fast, it drives the real ceremony, and a console error fails it.
- The portal is written to degrade silently — a bad asset, a missing file, a dead fetch all render *something*. That is correct for visitors and terrible for review, which is why the validator exists. Never "fix" a silent fallback by making it throw.
- Placeholder art is real deliverable, not filler: every asset slot renders procedurally until the owner plugs files in (D11).
- When a decision changes or an open item resolves, edit §4/§11 in the same commit as the code.
- Little to no visitor-facing text — resist adding UI. The eye is the interface.

---

## 13. Build log

### 2026-07-25 — portal + server templates built

Code for M1/M3/M4 plus M2's repo-side templates now exists and passes an
automated headless-Chromium smoke test (sealed render → mock flip → 2-poll
open → click → communing viz → theme morph → control page, zero console
errors). What remains on each milestone is the part only the owner/VPS can
do:

- **M1** — code done. §2.1 state machine, §5.1 poller (jitter, hidden-tab
  pause, defensive normalization), procedural eye honoring the §5.3 manifest
  (drop-in layers verified absent→procedural), click/keyboard unlock.
  Remaining: Pages deploy + domain (owner). Acceptance mock: open the portal
  with `?mock=live` — the eye opens on the production URL.
- **M2** — `server/` holds Caddyfile, icecast.xml, ntfy hook scripts, and the
  D6 Liquidsoap contingency as placeholder templates plus a <1hr rebuild doc.
  Remaining: provision VPS, run the doc, Cool Mic go/no-go, set
  `STREAM_BASE` in `portal/js/config.js`.
- **M3** — code done. §5.5 feature set with slow auto-gain, WebGL
  domain-warped field (Canvas2D fallback auto-selected), drowse/resume audio
  handling. Remaining: acceptance against a real live stream on a mid-range
  phone.
- **M4** — code done. Theme loader with built-in fallback palettes (a failed
  theme.json fetch can never blank the site), ~2s morph transition,
  `control.html` with buttons generated from `index.json`. Remaining:
  acceptance mid-stream.

### 2026-07-29 — motifs, so a theme is a mood and not a palette swap

Owner review, second pass: the colors were fine but every theme was the same
fog. Fair — `theme.json` carried a palette and four scalars, so there was
nothing for a theme to *be*. Wanted sunshine to have rays, ice to glitter and
be glossy, cave to drip, forest to have columns and dappled light.

Fixed by giving the shader a **motif library** (§5.4) that themes weight as
data, which keeps D10: the engine holds all seven motifs and never changes per
theme; a theme still only picks from them. The branches are uniform-coherent,
so an unused motif costs nothing but shader length.

Tuning notes, since these were all found by looking rather than reasoning:

- First pass blew out ice and sunshine and turned cave and mountain black.
  Motif `mass` is now clamped — an all-mass theme would just be a shut
  aperture, which is what Sealed is for.
- `drips` takes its weight as density *and* strength, so a cave's slow seep
  and hard rain are one motif at two settings. Brightness is `sqrt(weight)`
  or the sparse case is invisible.
- Frequencies tuned against a full screen do not survive the move into a
  short aperture — a motif that looked right at fullscreen can arrive with one
  and a half features visible.
- Mountain went through three motifs before it worked, and both failures are
  now recorded in §5.4: horizontal strata read as VHS scanlines, and clean
  voronoi crags read as a mosaic. It needed a warped lattice, a noise-blended
  snowline, and a cold palette — the old warm tan left no white to put snow on.
- Watch for backticks in the GLSL comments. The whole shader is a JS template
  literal, and one in a comment cost a confusing syntax error. Twice.

Also landed `tools/shots.mjs` (every state × every theme at phone size, plus a
contact sheet) and `tools/mock-portal.mjs`, now shared with the smoke test.
The shots tool is the M5 loop: procedural looks leave nothing to inspect in
the repo, so tuning art without it is guessing.

### 2026-07-29 — the eye is carved, and the field moved inside it

Owner review of the first build: the eye looked too human, and stylizing a
human eye at that scale reads as cartoon. Wanted stone — golem, idol — with
the moving pattern *inside*, where an iris and pupil would be. Sealed shows
nothing; open shows what is inside. Locked as D17 and written into §2.1.

Architecturally this inverts the two canvases. `#viz` was a full-screen field
with the eye floating on top; it is now an offscreen **source**, sized to the
aperture's bounding box, and `#eye` is the compositor — it draws the stone,
clips to the aperture, and pulls the field in. Two consequences worth knowing:

- Shading stopped at the aperture, so the fragment shader now covers a few
  percent of the pixels it used to. This is a large win on exactly the
  mid-range phone M3 has to pass on, not a cost.
- The field is drawn at the *full* aperture box no matter how open the eye is,
  so it stays a fixed plane seen through a changing gap rather than something
  that stretches as the stone parts.

On the stone itself, in case it ever gets retouched: it is shaded by the
**slope** of a noise height field, not its value. Value alone gives clouds no
matter how it is tuned — the first attempt looked like fog. Ridged noise cuts
the fissures, one light direction (`LIGHT_X/Y`) governs the relief, the socket
lip and the aperture bevel alike, and every carved line is a concentric vesica
echoing the aperture. Concentric *circles* around a lens-shaped hole read as a
targeting reticle at any opacity; that was the second attempt. A raised brow
arc was the third, and it pulled the composition upward and started the face
being a face again — dropped.

§5.3's layer names changed with the design: `sclera`/`iris` no longer describe
anything, so the plug is now `plate`/`socket`/`lid-*`/`glow`/`frame` plus a
declared `aperture` the field is clipped to.

### 2026-07-25 — hardening, M6 visitor side, and a test that exists

The previous entry claimed a headless smoke test; it was never committed.
`tools/` now holds a real one (32 checks, drives the whole ceremony) plus a
zero-dependency asset validator (D16). Everything below was found or fixed
with them in place.

Fixed:
- **Centroid was doing nothing.** `features.js` reported a linear bin fraction
  (~0.1 for real music) while `IDLE` and `syntheticFeatures` assumed ~0.4, so
  `shiftCentroid` was pinned to a constant negative nudge. Now log-frequency
  normalized between 60 Hz and 8 kHz, which puts a piano mid-scale and makes
  the mapping actually swing. Deliberately *not* auto-gained like the other
  features: centroid is a position, not an energy.
- **WebGL context loss** left the field black forever on a backgrounded phone
  tab. The GPU objects now rebuild on restore; morph and field time survive.
  The smoke test loses and restores the context for real.
- **Audio stall watchdog** (4s). A cell hiccup shorter than the drowse window
  could stall the element permanently while the poll still said "live".
- `resume` now goes through `startAudio`, so a first attempt that failed still
  gets its extractor rebuilt on the way back.
- The eye's `manifest.json` is shipped (empty layers) instead of absent, so
  every visitor no longer 404s on page load.

Added:
- **M6 visitor side (§5.7, D15)** — the summons rune. Config-gated on
  `NTFY_TOPIC`; removed from the DOM entirely when unset; visible only while
  Sealed. A link to the ntfy topic, not Web Push — no keys, no service worker,
  no permission prompt, no backend.
- `portal/_headers` and `portal/robots.txt` for the Pages deploy. Full CSP is
  deliberately absent: `connect-src`/`media-src` would name the streaming host
  and make it a second production touchpoint alongside `STREAM_BASE`.
- `body[data-theme]` and `body[data-viz]` for field debugging ("is this phone
  on the Canvas2D fallback?") and as the smoke test's observation hooks.

Still owner-side, unchanged: Pages deploy + domain (M1), the whole VPS (M2),
acceptance against real audio on a real phone (M3/M4), art (M5), topic (M6).

Portal implementation notes for future sessions:
- Plain ES modules, no build step. `portal/js/config.js` holds the only two
  production edits: `STREAM_BASE` (M2) and `NTFY_TOPIC` (M6).
- Mock mode is automatic while `STREAM_BASE` is empty; dev overrides:
  `?mock=live`, `?theme=<token>`, `?stream=<url>` (persisted; `?stream=clear`),
  `?fast=1` (short poll/drowse for tests). All except `?stream` are gated on
  mock mode, so no URL can retune a real deployment.
- In mock/no-analyser situations the viz runs on gentle synthetic features
  instead of freezing — also the graceful path if audio ever fails.
- `prefers-reduced-motion` is honored (slower field, no blinks/ripples).
