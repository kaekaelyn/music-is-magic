# Mood direction

Owner-supplied references and what it takes to hit them. One section per mood.

Each section records the reference, the feel in PLAN.md's quiet/loud terms, and
the concrete changes — split into **data** (`theme.json`: palette, params, motif
weights, which is cheap and per-mood) and **engine** (`viz.js`, which is shared
by every mood and both builds, so it needs care).

Working order: mountain, cave → rain, sunshine → night, ocean → forest, ice.

---

## mountain

**Reference.** Three photographs. (1) A wide dark-rock massif under pale blue
sky, soft cumulus along the top, snow held in the gullies and fall lines.
(2) A single sharp white summit against deep saturated blue. (3) An aerial view
of ranges receding into near-white haze, almost no colour left in the far ones.

Owner's direction: *"make the sky look cold and thin. the pic on the left is
good at that, where the clouds and snowdrifts have a similar character (but that
doesn't mean they should be interchangeable!)"*

Image 1 is the target for the sky. Image 2 is **not** — its blue is dense and
deep, which is the opposite of thin. Image 3 is the target for distance.

Confirmed by the owner: *"The pale blue is good."* Image 1's sky is the
reference; do not reach for image 2's saturation.

### The gap

Mountain has `clouds: 0`. There is no sky in it at all right now — the entire
upper aperture is empty ramp above the ridgeline. Everything below follows from
filling it.

### Cold is free — don't let the shader comment mislead you

`mClouds`' comment (viz.js:889) says the sun-facing rim "takes the gold". That
is true of sunshine, not of mountain. Both cloud colours are drawn from the
theme's own palette:

- body → `mix(u_c2, u_c4, 0.45)` (viz.js:1342)
- rim  → `mix(u_c3, u_c4, 0.35)` (viz.js:1343)

Against mountain's `#525e6f → #97aabe → #f4f9ff` those land pale blue-white
unaided. No engine work, and no palette change needed, to get cold.

The crepuscular-ray coupling (viz.js:1066–1077) is gated behind `W_rays > 0` and
mountain has `rays: 0`, so switching clouds on leaks no sunbeam light either.

### "Similar character, not interchangeable" — the real risk, and the fix

The two families already share what they should: both are `fbm` fields, both
take their white from the top two palette steps. That is the "similar
character" half, and it is free.

The danger is spatial. Snow is fenced in hard — it may only lie on skyward
faces, below a snowline, and **never in the sky**:

```
s *= smoothstep(-0.5, 0.32, uv.y);  // a snowline
s *= 1.0 - skyMask;                 // and never in the sky
```
(viz.js:1279–1280)

Clouds have no such fence. `mClouds` is called unmasked (viz.js:1061–1065), so
switching it on paints cloud across the **whole** aperture — over the summit as
well as above it. White fbm over the rock, sitting in the same pixels as white
fbm on the rock, is exactly the two reading as one material. That is the
interchangeability failure, and it is structural rather than a tuning problem.

**Fix: gate cloud by `skyMask`.** `skyMask` is already computed from the ridge
silhouette (viz.js:1156) and mountain has `ridge: 0.92`, so it is live. Multiply
cloud by it and the two families become spatially disjoint, divided by the
silhouette itself — clouds strictly above the ridgeline, snow strictly below.
Same material vocabulary, never in the same place, and the peak cuts a hard
edge across the sky the way it does in image 1.

Keep them kin, not clones, by frequency: `mClouds` samples at
`vec2(uv.x * 1.5, uv.y * 2.6)` — low frequency, vertically stretched, soft
threshold, so it reads rounded and billowy. Snow's coverage noise runs at
`p * 4.6` with a tighter `smoothstep(0.40, 0.68, …)`, so it reads finer and
sharper-edged, cut by rock. That contrast is already right; don't equalise them.

**Where they are allowed to meet: spindrift.** Snow torn off the near crest
when the room is loud (viz.js:818, 1157–1158), riding `W_ridge`. It is snow
becoming air — the one legitimate crossing between the families, it only
happens under drive, and it is the best answer to the owner's note. Leave it
alone and let it be the only bridge.

### "Thin" is the one thing that needs engine work

Aerial perspective exists but only as a **luminance** effect:

```
float shade = 0.46 - fi * 0.17;   // fi: 0 = far, 2 = near
v = mix(v, shade, below);
```
(viz.js:804–807)

That walks far ranges up the brightness ramp, so a far range lands near
`#525e6f` — pale**r**, but still fully coloured. Image 3's far ridges have lost
their colour, not just their darkness; they have taken on the sky's tint.

The hook is already there: `ridgeLayer` (viz.js:1049) carries which range is
frontmost at each pixel and is already used for parallax and rock grain. The
change is a haze lerp in **colour** space keyed on `ridgeLayer`, pulling far
ranges toward the pale step (`u_c3`/`u_c4`) rather than up the ramp — applied
after the palette, near the snow/cloud tinting at viz.js:1342–1347.

Scope it to `W_ridge > 0` so no other mood's colour moves.

### Feel

| | |
|---|---|
| **Quiet is** | High thin cloud barely drifting, the summit sharp against it, snow holding still on the ridges, far ranges ghosted almost into the sky. |
| **The music is** | Coverage swelling — `mClouds` drops its threshold with loudness (`0.52 - drive * 0.1`) so a working room builds weather — and spindrift tearing off the near crest. Weather closing in, from a sky that was empty. |

### Changes

**Data** (`portal/assets/themes/mountain/theme.json`)
- `motifs.clouds`: `0` → **~0.35**. A band of high cloud, not overcast. Tune
  against image 1, where sky still outweighs cloud.
- Palette unchanged — it already produces cold cloud. Note that `c3`/`c4` colour
  snow *and* cloud rim, so any later palette move hits both; that shared tint is
  wanted, the shared *position* is not.
- `params` unchanged to start. `speed: 0.1` suits high slow cloud and
  `travel: 0.4` drives the drift through `flow * 0.35`.

**Engine** (`portal/js/viz.js`) — both small, both scoped
1. Gate cloud by `skyMask` so weather cannot paint over rock.
2. `ridgeLayer`-keyed haze lerp toward the pale step, for image 3's distance.

Change 1 affects any mood running clouds and ridge together; today only mountain
would. Change 2 is fenced to `W_ridge > 0`. Check `index.html` as well as
`broadcast.html` after either — `js/` is shared by both builds.

---

## cave

**Reference.** Four images. (1) and (2) are owner-generated with AI — *"nothing's
quite right but perhaps you can get the idea of it"* — dark purple-black wet
rock, crystal clusters rooted at the base of the walls in several distinct
minerals (lilac, clear-white, warm amber, a small teal), water along the floor,
and a single water drop caught mid-fall from the ceiling. (3) is a receding
tunnel of layered rock converging on a small bright violet cluster at the far
end. (4) is a glowworm cave: blue-black, ceiling pinpoints, stalactites, still
water.

Owner's direction: *"the third image's main value is in the shape of the tunnel.
That is what I am looking for, though there should be a sense of it being wider
so that there is room for more crystal structures."*

### Cave owns its machinery

Cave is the **only** theme with `tunnel` or `crystals` above zero (every other
theme is 0 for both). So `TUNNEL_SIDES`, the depth coefficient, and
`CRYSTAL_CLUSTERS` are cave-private in practice: changing them cannot disturb
another mood, even though they are engine constants rather than theme data.

`drips` is **not** private — rain runs it at 0.95. Cave's own `drips` weight is
safe to change; the shape of `mDrips` is not.

### Already right — leave alone

**The minerals are done.** viz.js:1355–1361 already varies quartz per cluster:
amethyst `(0.62, 0.45, 0.95)` → clear → smoky → citrine `(1.0, 0.85, 0.5)` →
a rare aqua `(0.5, 0.9, 0.92)`, one mineral per cluster, held fixed while the
light swings across it. That is precisely the lilac / white / amber / teal mix
in images 1 and 2. Nothing to do.

**Crystals already come out of the wall.** They are grown in `rockP`, the rock
frame handed out by `mTunnel` (viz.js:558–562), so they inherit the passage's
perspective — deep clusters small, mouth clusters large. That correlation
between architecture and crystal is what the references show and it is built.

**The lone drip is the right idea.** At `drips: 0.16` the engine puts ~0.27
drips on screen at a time (viz.js:235) — deliberately *"a small droplet falling
fast and alone"*, not thin rain. That matches images 1 and 2, which each show a
single suspended drop rather than weather. If it wants to be more present, nudge
the weight; do not reach for the shape.

### "Wider" — the primary ask

The bore's width is set by one constant:

```
float dep = -log(rad) * 1.55 + t * 0.03;   // viz.js:429
```

`-log(rad)` is the perspective compression: lowering **1.55** means less depth
travelled per unit of radius, so cells stay larger and fewer of them stack
between the mouth and the vanishing point. That reads as a wider, shorter
passage — which is the ask. This is the knob to turn first.

Secondary: `TUNNEL_SIDES = 11.0` (viz.js:414) sets facets around the ring.
Image 3's rock lobes are chunky; 9–10 may suit better than 11. Lower is wider
per facet.

Neither is exposed in `theme.json`, so widening is an engine edit. Given cave
is the only user, that is acceptable — but if it needs iterating against the
owner's eye, consider promoting the depth coefficient to a theme param first so
tuning stops requiring a shader edit.

### "Room for more crystal structures" — a separate knob

Width does not by itself add crystals. Two constants govern how many exist:

```
#define CRYSTAL_CLUSTERS 4
#define CRYSTAL_SPEARS   3
```

and a selection clock staggers those four slots so only one or two are near
full brightness at any moment. That stagger is deliberate — it guarantees
*some* cluster is always nominated, which was the fix for the owner's earlier
*"I can't see any crystals"* (viz.js:582–591). **Do not widen the envelope in a
way that breaks that guarantee.**

More visible structures means raising `CRYSTAL_CLUSTERS`, and possibly widening
the hold so more overlap.

**Measure it.** The cost is `CLUSTERS × SPEARS` spear evaluations per fragment
in the worst case — 12 today, 18 at six clusters. This mood was rewritten this
session *specifically* for that cost (viz.js:548–556: enumerate, don't search a
lattice), so raising the count spends the exact budget that rewrite bought.
`tools/perf.mjs` exists now; take a before and after rather than raising blind.

### Two open questions for the owner

**The light at the end.** Image 3's focal point is a small glowing violet
cluster at the vanishing point. The engine has nothing there — `mTunnel`'s
`flare` (viz.js:482) is per-cell wet-rock sparkle gated by loudness, not a light
source — and crystal placement deliberately biases *toward the mouth*
(`hc.y * hc.y`, viz.js:603) on the grounds that a cluster deep in the passage is
a few pixels of nothing. So image 3's composition and the current design
actively disagree. Ask whether the glowing terminus is wanted, or only the
tunnel's shape. It is a different mechanism from a crystal cluster.

**Image 4.** The owner did not comment on it. Its ceiling pinpoints are close to
the `stars` motif — fixed, non-moving, which is what separates stars from glints
(viz.js:931–934) — and cave runs `stars: 0`. Adding them would need masking to
the upper aperture. Do not design for this until asked; it may have been
included only for the blue.

### Feel

| | |
|---|---|
| **Quiet is** | The passage still, one seam lit, wet rock holding a little light, a drip every several seconds. |
| **The music is** | *Which* seam is lit changes rather than whether one is — the selection clock rides intensity. Drips thicken (`duty` scales with drive, viz.js:241) and the wet-rock flare picks up. |

### Changes

**Data** (`portal/assets/themes/cave/theme.json`)
- `motifs.drips`: `0.16` → **~0.22** if the lone drop should be more present.
  Small moves only; this knob is quadratic.
- Palette unchanged — `#04040a → #282340 → #5d5480 → #d6e2f5` already sits where
  images 1–3 live, and the mineral colours are independent of it.

**Engine** (`portal/js/viz.js`) — cave-private, but measure
1. Lower the `-log(rad) * 1.55` depth coefficient for the wider bore. Consider
   promoting it to a theme param if it needs iterating.
2. `TUNNEL_SIDES` 11 → 9–10 for chunkier lobes, if wanted after (1).
3. `CRYSTAL_CLUSTERS` 4 → 5–6 for more structures. Perf-check with
   `tools/perf.mjs`; keep the always-one-nominated guarantee.

## rain

*Awaiting reference.*

## sunshine

*Awaiting reference.*

## night

*Awaiting reference.*

## ocean

*Awaiting reference.*

## forest

*Awaiting reference.*

## ice

*Awaiting reference.*
