# Mood direction

Owner-supplied references and what it takes to hit them. One section per mood.

## How to read the references — read this first

The owner's standing instruction:

> *"All the images I show you are just vague approximations of the atmosphere it
> should give off, unless there are obvious crossovers or I tell you something
> specific."*

**The images are mood, not specification.** They are not shot lists, and nothing
in one is a feature request on its own. Chase the atmosphere; do not transcribe
the contents. An element appearing in a reference is not a reason to build that
element.

Two things do carry literal weight:

1. **What the owner says in words.** Direct instructions ("cold and thin", "the
   shape of the tunnel", "wider") are the specification. The image shows what
   the words mean.
2. **Obvious crossovers** — where several references, or a reference and the
   existing build, plainly agree on the same thing.

This applies to the write-ups below as much as to the pictures. Where a section
describes an image's contents, that is context for the feeling, not a checklist.
Where it proposes a mechanism, that mechanism is a means to the atmosphere and
may be replaced by a better one — the feeling is the requirement, the shader
route is not.

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

### Settled — do not reopen

**No stars.** The owner, on image 4's glowworms: *"No stars. Only crystals. But
the feeling is there."* Cave keeps `stars: 0`. Crystals are the only luminous
structure in this mood, and there is no second population of small lights.

Image 4 still counts — as atmosphere, not as a feature. What it contributes is
the *quality of the darkness*: a black deep enough that a few small lights carry
the whole frame, and still water under it. That is the target for how dark cave
should sit and how much work its few lit things should do. It contributes no
element.

**No light at the end of the tunnel.** Image 3's glowing violet terminus falls
under the standing rule — atmosphere, not specification. What the owner asked
for in words was *"the shape of the tunnel"*, widened. Take the shape; do not
build a terminus light. The existing bias of clusters toward the mouth
(`hc.y * hc.y`, viz.js:603) stays, and "only crystals" means that if anything
luminous ever does sit deep in the passage it is a crystal, not a new light
source.

**Obvious crossover — the palette is already right.** Images 1 and 2 are purple,
image 4 is blue, and the owner endorses the feeling of all three. Cave's palette
already spans exactly that: `#04040a → #100f1c → #282340 → #5d5480 → #d6e2f5`,
purple through to pale blue-white. Leave it.

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

**Reference.** Five images. (1)–(3) are grey storm: rain over open water, a night
bolt through cloud, a city river under heavy rain and branching lightning. The
owner places these as *"more in line with what we have right now"*. (4) is a
sunshower — green garden, sun blazing through trees, rain falling lit gold.
(5) is a full rainbow arc against dark storm cloud over a lit field.

Owner's direction, three separate asks:

> *"it would be nice if it were a little more responsive. Like if it could go
> from a drizzle to a storm depending on the volume. But that might make it too
> fickle."*
>
> *"other potential rainy sub-moods … Maybe this could be the beginning of an
> implementation of a sub-mood system that I can work with from the control
> panel."*
>
> *"a way to conjure a rainbow would be really cool."*

Images 4 and 5 are sub-mood candidates, not corrections to rain.

### 1. Responsiveness — the "too fickle" worry is correct, and measurable

Rain already answers the room, but on the wrong timescale. Both of its motifs
ride fast envelopes:

- drips density: `duty = (0.012 + 0.988 * w * w) * (0.5 + drive * 1.3)`
  (viz.js:241), where `drive` is `rms`, smoothed at **attack 0.04s / release
  0.3s** (features.js:60).
- lightning: gated on the onset envelope, faster still — `flux` runs
  **0.015 / 0.12** (features.js:96) and `mStorm` squares it twice so only real
  attacks throw a bolt.

Those are tuned for *notes*, which is right for lightning — a bolt is an event.
It is wrong for rainfall. Mapping drizzle→storm onto a 0.3s release means the
weather changes several times a bar. The owner's instinct is exactly right: done
naively, this is fickle.

**Fix: a second, much slower follower.** `_smooth` already takes per-feature
time constants — flux uses `(0.015, 0.12)`, centroid `(0.4, 0.6)` — so adding a
slow one is idiomatic rather than a new mechanism. A "weather" follower on rms
with taus in the seconds-to-tens-of-seconds range (start around **attack 6s,
release 20s**) makes a loud passage *build* a storm and a quiet one let it
clear. Asymmetry matters: weather should gather faster than it disperses.

That is the whole answer to fickleness — not less response, but response with
inertia. Lightning keeps its fast envelope; only rainfall gets the slow one.

**The trap that will make this silently not work.** `_norm` (features.js:52–57)
divides every feature by its own peak with a **20-second half-life**. Features
are relative to *recent* loudness, not absolute. After a couple of minutes of
soft playing, soft playing reads as full scale — so "drizzle when quiet, storm
when loud" would storm through a quiet passage and look broken for no visible
reason.

A weather follower keyed on dynamics must therefore read **pre-normalisation
rms**, or carry its own much longer auto-gain. This is the most likely way this
feature fails, and the failure is baffling rather than obvious. Do not skip it.

### 2. Sub-moods — the system already exists

This needs no new machinery. Two comments in the build already guarantee it:

> *"Buttons come from the same index.json the portal uses — adding a theme
> folder updates this page too, no edits here."* (control.html:205–206)

> *"Every theme carries every motif key, so morphing between two themes is a
> plain lerp with nothing missing on either side."* (themes.js:225–226)

So a sub-mood **is** a theme. Add `portal/assets/themes/rain-sunshower/`, add
one line to `index.json`, and it appears as a control-panel button and
cross-fades smoothly from rain. No protocol change, no engine change, nothing in
`control.html` to edit.

Name them with a prefix — `rain-sunshower`, `rain-rainbow` — which costs nothing
now and gives free grouping later. The only thing that degrades as sub-moods
multiply is that the control panel is a flat row of buttons; grouping by prefix
is a presentation change in `control.html` when it becomes annoying, not
architecture.

**`rain-sunshower` is data-only.** Image 4 is, almost exactly, forest plus rain:
forest already runs `canopy: 0.95`, `rays: 0.62`, `columns: 0.85`, `dapple: 0.8`
over a green palette. Add drips at ~0.7, warm the top palette step toward the
gold of the reference, and that is the sunshower. A folder and one line — no
shader work at all. Good first proof of the sub-mood idea precisely because it
needs nothing built.

### 3. The rainbow

Nothing in the motif library does this; it is genuinely new. But it does **not**
break the theme-is-palette contract, because crystals already set the precedent:
the quartz minerals at viz.js:1355–1361 are hardcoded `vec3`s, not palette
entries — a material is allowed its own colour. A rainbow is a material with its
own colour. Build it that way and it is consistent with the engine as it stands.

Shape: distance from an off-screen centre, banded; spectral sweep across the
band's width; additive and faint; masked to the upper field. Image 5 shows it
reading strongest against dark cloud, which is worth preserving — it should want
a dark sky behind it, which is what makes it a *rain* element rather than a
decoration.

**How to conjure it — the two triggers, and they can share one motif.**

The slow weather follower from §1 hands the good trigger over for free: a
rainbow is what a *passing* storm looks like. A weather value that is high and
now **falling** means the storm has spent itself. Fade the rainbow in on that
falling edge and the gesture becomes: play hard, then ease off, and a rainbow
arrives. Earned rather than switched on, and it costs nothing extra once the
follower exists.

The other trigger is a `rain-rainbow` sub-mood button, for summoning it on
demand from the control panel.

These are not alternatives — same motif, two ways in. Suggested order: build the
motif first and drive it from a plain theme weight so it can be seen and tuned
at all, then add the falling-edge trigger, which depends on §1 landing first.

### Feel

| | |
|---|---|
| **Quiet is** | Drizzle. Grey, even, low — and no lightning at all, since bolts are gated on real attacks. |
| **The music is** | Rainfall thickening over seconds rather than beats, with the weight of weather that has to gather. Lightning on genuine attacks only. And, on the far side of a passage that has spent itself, a rainbow. |

### Changes

**Data**
- Main rain `theme.json`: nothing yet. The responsiveness work is engine-side.
- New folder `rain-sunshower/` — forest's params and motifs plus `drips ~0.7`,
  palette warmed at the top. Data-only.
- New folder `rain-rainbow/` — once the motif exists.
- One `index.json` line per folder. Nothing else.

**Engine** (`portal/js/viz.js`, `portal/js/features.js`)
1. Slow "weather" follower on rms in `features.js`, reading pre-normalisation,
   plus the uniform to carry it. Drives drips density; leave lightning fast.
2. Rainbow motif in `viz.js`, its own colour, masked to the upper field.
3. Falling-edge trigger on the weather follower — after 1 and 2.

Steps 1 and 2 are independent and can land in either order; 3 needs both.

## sunshine

**Reference.** Four images, all the same subject: sun breaking through cumulus,
shafts radiating from the break, gold against blue. The owner: *"I really think
sunshine is already an amazing mood as implemented … what I sent here is pretty
much already conveyed super well."*

No correction is being asked for. The question is only whether it can be made
more dynamic, and the owner is unsure it needs to be:

> *"It might be nice to find a way to make it more dynamic, but I'm not sure what
> could accomplish that within our means … I'm not sure if that's enough to bring
> it in line with the responsiveness of, say, rain. Maybe it doesn't need to be."*

### Do not touch mRays

Sunshine is already the most responsive mood in the build, and the rays are why.
`mRays` answers the room on **three** timescales at once:

- **Onsets** displace the sampling point, so the beams leap to a new arrangement
  and settle back as the kick decays — a displacement by a decaying envelope,
  explicitly never a change of drift rate (viz.js:153–159).
- **Pitch**, via the centroid smoothed over about a second, leans the whole fan.
  The comment's own words: *"a sway, not a jitter"*.
- **Loudness** sharpens the shafts rather than just brightening them —
  `pow(s, 3.4 - drive * 1.5)`, so quiet is diffuse light and loud is defined
  beams — and also extends their reach and lifts their brightness (viz.js:179–180).

That is more per-frame response than rain has. Whatever makes sunshine feel less
dynamic, it is not the rays, and they should be left exactly as they are.

### The actual gap: the clouds move but never change

```
float body = smoothstep(0.52 - drive * 0.1, 0.78, cl);   // viz.js:895
```

Coverage shifts its threshold by **0.1** across the entire loudness range,
against a smoothstep 0.26 wide. In practice the cloud deck is a fixed amount of
cloud. Sunshine's `travel: 0.42, travelX: 0.2` means it does drift — but drifting
is not gathering. The deck slides; it never thickens or opens.

That matters more here than anywhere else, because the engine has already
decided that occlusion is sunshine's whole business:

> *"Sunshine is open sky … What occludes an open sky is its own weather, and that
> is applied to the rays in main() from the clouds motif instead."* (viz.js:170–173)

And the coupling is already wired: `rays *= 1.0 - cloud * 0.8` cuts the shafts
where cloud stands in front of them, and `rays += cloudRim * 0.35` makes them
blaze where they slip past an edge (viz.js:1072–1073).

**So the burst-through-a-gap in all four references is already built. It just
never fires**, because the gap never opens or closes on anything the player does.

### Recommendation: sunshine's dynamism is rain's slow follower, not a new motif

Drive cloud coverage from the slow weather envelope proposed in rain §1, with a
range far wider than the present 0.1. Then the deck gathers and parts over
seconds; the sun is progressively lost and found; the rim blazes as an edge
slides off it. Every mechanism for that already exists — only the signal driving
coverage is missing, and rain needs that signal built anyway.

One piece of engine work, two moods, and no new motif in a mood the owner is
happy with. This is the cheapest real dynamism available anywhere in the build.

### It should NOT match rain's responsiveness — they are different dramas

The owner's *"maybe it doesn't need to be"* is right, and worth stating plainly
so a later session does not try to close the gap:

- **Rain's drama is quantity.** Drizzle to storm is more of the same thing.
- **Sunshine's drama is occlusion.** Same sun throughout, hidden and revealed.

Making sunshine fluctuate in *amount* would be making it into rain. What it wants
is the timing of the reveal, not a volume knob. Slow gathering, sudden opening.

### Bird flocks — the owner's instinct is right, and here is the engine reason

Raised and largely self-answered: *"finnicky little details that wouldn't work
well with our style as established, and end up repetitive … Certainly the way
flocks move could be super interesting."*

Both halves of that are correct, and they separate cleanly.

**Individual birds: no.** Every motif in this engine is a *field* evaluated per
fragment. Discrete objects are the expensive exception, and crystals are the
proof — the enumerate-don't-search rewrite (viz.js:548–556) exists because *four*
objects cost too much. Many small birds is that problem multiplied, and a hashed
sprite recurring is exactly the repetition the owner predicts.

**Flock motion: genuinely interesting, and idiomatic.** A murmuration is not a
set of dots; it is a density that shifts, folds and turns. As a density field it
is precisely what this engine is good at, and cheap. The half the owner found
interesting is the half that fits.

**But not in sunshine.** All four references are sky and light, and the gap here
is in the light's *timing*, not its contents. A murmuration reads dusk or autumn
and would arrive as a guest in a mood that is already working. If flocks get
built, build them where they are the subject — and the sub-mood mechanism from
rain gives them a home without disturbing anything established.

### Feel

| | |
|---|---|
| **Quiet is** | Diffuse light, shafts soft-edged and short, the deck holding. |
| **The music is** | Already: beams sharpening, the fan leaping on attacks and swaying with pitch. Missing: the deck gathering and parting, so the sun is lost and found rather than merely brighter. |

### Changes

**Data** — none. The coverage range is a shader constant, not a theme param, and
sunshine's palette and motif weights are right.

**Engine** (`portal/js/viz.js`)
1. Drive `mClouds` coverage from the slow weather follower (rain §1) instead of
   raw `drive`, and widen the range well past 0.1. This is the whole change.
2. Leave `mRays` alone.

Not doing: bird flocks in sunshine, and any attempt to give it rain's kind of
responsiveness.

## night

*Awaiting reference.*

## ocean

*Awaiting reference.*

## forest

*Awaiting reference.*

## ice

*Awaiting reference.*
