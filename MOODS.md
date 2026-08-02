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

**Reference.** Four images. (1) a deep teal-blue starfield with warm gold nebula
cloud and a shooting star. (2)–(4) auroras: green and violet curtains over
starfields, one with a magenta crown.

Owner's direction:

> *"I would genuinely love if we had more of the color palate in #1 in the Night
> mood."*
>
> *"Not sure if it's fixed now, but in the past it was really difficult to see the
> auroras. I'm not certain, but it might have more to do with the interpretation
> of the mic input than a problem with the visualization itself … it might affect
> a lot more than just Night."*

### Already built: the shooting star

Image 1's meteor exists. `mStars` throws one on a strong onset, and the streak
*travels* as the pulse decays — `(1 - strike)` is distance flown, so the flight
takes about a second for free. Position, steepness and direction are all hashed
from a slow clock so successive onsets rake the sky from different quarters, and
`strike²` keeps soft playing from spending them (viz.js:953–973). Nothing to do.

### The aurora visibility question — the known cause is already fixed

The owner's memory is of a real bug, and it was found and fixed. From the
composite, in the code's own words:

> *"Aurora colour is the motif's OWN, not the theme palette's — the same licence
> snow takes by being white. **A palette-tinted aurora over a blue sky is a
> slightly bluer blue, which is why it was so hard to see at all.**"*
> (viz.js:1374–1376)

The aurora now carries oxygen green, cyan and a red-violet crown of its own
(viz.js:1380–1382). So *that* cause is gone. If it is still hard to see, it is a
different mechanism — and there is a candidate.

### The remaining dependency: the aurora is gated on pitch

```
float wake = 0.1 + 0.9 * smoothstep(0.45, 0.62, pitch);   // viz.js:996
```

The curtain sits at **10% brightness** until the spectral centroid clears 0.45,
reaching full only past 0.62. On the project's own centroid scale
(`60 Hz → 8 kHz`, log, features.js:20–22) those are:

| `pitch` | frequency | aurora |
|---|---|---|
| 0.45 | **≈ 542 Hz** | still at 10% |
| 0.62 | **≈ 1246 Hz** | full |

Centroid also slides the curtain's *colour* along green→violet (viz.js:1383). So
a systematically low centroid gives a dim curtain stuck at green — which is
exactly "difficult to see", and it would look like a visualization problem while
being an input-interpretation problem. **The owner's instinct is well founded.**

### Why the centroid is room-dependent — two concrete causes

Both are in `features.js`, in the sum at lines 82–89.

1. **The sum runs past its own scale.** `for (let i = 1; i < this.bins; i++)`
   covers every bin to Nyquist — about 24 kHz at a 48 kHz rate — while the scale
   maps 60 Hz to 8 kHz. Everything above 8 kHz can only push the result off the
   top of the scale it is about to be measured on.

2. **The magnitudes are dB-scaled, with no noise gate.** `m = freq[i] / 255`
   comes from `getByteFrequencyData`, which maps roughly −100 dB…−30 dB onto
   0…255. A bin at −70 dB still contributes `m ≈ 0.43`. Near-silent bins
   therefore carry real weight in `num += i * m`, and the centroid becomes partly
   a measure of *how much of the spectrum sits above the room's noise floor*
   rather than where the musical energy is.

Together these make `pitch` a function of the room and the microphone as much as
of the playing. A quiet room with a close mic and a noisy room with a distant one
will not agree, and the aurora will differ between them for no visible reason.

**Which direction it errs cannot be determined from the code** — it depends on
the actual noise floor. Do not guess, and do not "fix" it blind.

### Measure it first: put pitch on the HUD

The broadcast HUD currently shows eye, mood, audio, control, render and frame
(broadcast.html:149–157) — no pitch. Adding one row is a few lines and turns an
unanswerable question into a thirty-second test: play normally, read the number.

- If it sits around 0.5–0.7 while playing, `wake` is behaving and the aurora
  problem is elsewhere.
- If it sits below 0.45, the aurora is at 10% for most of a performance and the
  gate is the bug — fix the centroid, not the motif.

Do this **before** touching either the gate or the centroid. It is the cheapest
measurement in the project and it decides which of two different repairs is
correct.

### The owner is right that this is not only night

`u_centroid` also drives the aurora's colour band (viz.js:1383), the ray fan's
lean in `mRays` (sunshine, forest), `mFacets`' pitch (ice), the storm tint
(viz.js:1370), and every theme's `shiftCentroid` mapping. A centroid that reads
wrong is a quiet, global miscalibration — which is why it is worth measuring
properly rather than patching per-mood.

### A dead line, while in here

`mic.js:88` sets `analyser.smoothingTimeConstant = 0.75`, but
`FeatureExtractor`'s constructor sets it to `0.55` (features.js:31) and
`broadcast.js` builds the extractor *after* the mic starts (broadcast.js:201),
so 0.55 always wins. Not the bug, but it will mislead the next person to read it.
Pick one and delete the other.

### The palette ask — and why it is safe

Night's palette is `#030714 → #101d40 → #1c3468 → #4467af → #ecf3ff`: blue at
every step, with no warm tone anywhere. Image 1's gold is simply absent.

**Warming it cannot hurt the auroras**, because the aurora no longer takes its
colour from the palette — that was the fix quoted above. Palette changes reach
the field and the stars (`mStars` returns a scalar and is coloured in `main`),
which is exactly where image 1's warmth lives: gold stars and gold nebula cloud
against a deep teal ground.

Two moves, both data-only and cheap to iterate:
- **Warm the top.** Push `c4` off pure white toward a gold-white so stars and the
  brightest points carry image 1's warmth.
- **Teal the ground.** Image 1's dark is blue-*green*; night's `#101d40` and
  `#1c3468` are pure blue. A small green lean gives the teal without lightening.

Keep the aurora references in mind as a limit rather than a target: the palette
should not go so warm that a green curtain over it reads as a colour clash.

### Feel

| | |
|---|---|
| **Quiet is** | Fixed stars — they do not wander, deliberately; *"a sky where the stars wander is a screensaver"* — a faint band of more, and a low green whisper on the horizon. |
| **The music is** | Meteors on real onsets, raking from a different quarter each time. Bright, high playing wakes the curtain and throws violet up the sky; low dark playing leaves it a green wash. Two different questions asked of the same music. |

### Changes

**Data** (`portal/assets/themes/night/theme.json`)
- Palette: warm `c4` toward gold-white; lean `c1`/`c2` slightly green for teal.
  Iterate against image 1; stop before the aurora greens clash.

**Engine** — measurement first, then at most one repair
1. Add a `pitch` row to the broadcast HUD. Do this first.
2. Only if the reading is low: bound the centroid sum to the scale it is mapped
   onto (stop at 8 kHz, not Nyquist) and gate out bins near the noise floor.
   Re-measure. Expect this to shift several moods, not just night.
3. Resolve the duplicated `smoothingTimeConstant`.

Not doing: retuning `wake` to compensate for a centroid that has not been
measured. That would bake the miscalibration in and spread it further.

## ocean

**Reference.** Four images, no words with them. (1) surf close up: deep blue
above, a churning mass of white foam, turquoise showing through where light
passes. (2) aerial, parallel swell lines rolling in, dark blue deep water and
turquoise shallows, crests breaking along the line. (3) aerial texture, dark
teal streaked with white. (4) heavily aerated turquoise water, white throughout.

No verbal direction was given, so under the standing rule these are atmosphere
only. This section is deliberately short: the mood is close, and inventing work
from silent references is exactly what the rule exists to prevent.

### Already right

- **The palette's water is the references' water.** `#02101c → #043a57 →
  #0b6d85 → #39ac9b` is navy through to green-teal — the turquoise all four
  images share.
- **The sea travels as one body.** `travel: 0.9`, `travelY: 0.42`, and `mFoam`
  advects crest phase, bend and tear together in a single moving frame
  (viz.js:901–913) — image 2's ordered, rolling swell lines.
- **Foam already answers the room, twice.** Loudness lowers the breaking line
  (`breakAt = 0.62 - drive * 0.13`) so more of the sea turns white, and it
  brightens what has broken (viz.js:923, 927).

### The one real gap: ocean's foam cannot be white

The compositor's intent is explicit:

```
// Foam is white water, not bright water — same rule as snow and rays.
col = mix(col, mix(u_c3, u_c4, 0.8), clamp(foam, 0.0, 1.0) * 0.75);
```
(viz.js:1348–1349)

Foam is drawn from `c3`/`c4`. For ocean those are `#39ac9b` and **`#c9f2e2`** — a
green-teal and a pale *mint*. So ocean's foam resolves to pale mint-green, and
white is not reachable no matter what the weight is.

Ocean is the only theme with this problem. Every other mood that draws a white
material ends its palette at something near white:

| theme | `c4` | white materials reachable |
|---|---|---|
| mountain | `#f4f9ff` | yes |
| night | `#ecf3ff` | yes |
| rain | `#e0e6ea` | yes |
| cave | `#d6e2f5` | yes |
| **ocean** | **`#c9f2e2`** | **no — mint** |

All four references show brilliant white foam against turquoise water. That is
about as clear an "obvious crossover" as the rule describes, and it is the one
thing the build cannot currently do.

**There is a second-order effect worth expecting.** Mint foam on turquoise water
is *low contrast*, so it reads as less foam than is actually being drawn.
Whitening `c4` should increase the *apparent* coverage without touching the foam
weight at all — which may turn out to be the whole of what these references are
asking for.

### Feel

| | |
|---|---|
| **Quiet is** | Turquoise water travelling in one direction, almost no white — quiet water carries almost no surf by design. |
| **The music is** | The breaking line dropping so more of the sea tears open into white, and the broken water brightening with it. |

### Changes

**Data** (`portal/assets/themes/ocean/theme.json`) — one edit
- `c4`: `#c9f2e2` → something near white with a green cast held only faintly
  (around `#eaf9f4`). Keep `c3` at `#39ac9b` so the *water* stays turquoise; it
  is only the top step that needs to stop being a colour.
- Re-judge foam weight and `breakAt` **after** this, not before. The contrast
  change may be sufficient on its own.

**Engine** — none proposed. No verbal direction was given, and the gap that
exists is a palette entry.

## forest

**Reference status — read this before assuming one exists.** No dedicated forest
image set was supplied. The observations below come from two places: the
sunshower image in the *rain* batch (a sunlit garden under trees, which is
forest's material seen in another mood), and reading the build. One further
image was supplied specifically for wisps, with the owner's caveat:

> *"It is not accurate to the feel or color scheme of the forest mood itself, but
> you might get an idea of the zigzagging orbs I'm trying to conjure up."*

That image is a misty wood with glowing orbs in yellow, blue and orange. Per the
owner's own words it is **motion reference only** — not colour, not atmosphere.

### What was noticed earlier

- **Forest is the mood the sunshower is made of.** It already runs `canopy: 0.95`,
  `rays: 0.62`, `columns: 0.85`, `dapple: 0.8` over a green palette, which is why
  `rain-sunshower` comes out data-only (see rain §2). Forest is the donor.
- **Forest is where the shared engine gets tested honestly.** `mRays` carries a
  fix for an `atan` seam with the note that *"Sunshine's own rays mostly
  disguised it; forest's fainter ones did not, which is where it was spotted"*
  (viz.js:148–151). Its fainter light exposes what sunshine's brightness hides —
  worth remembering when changing anything shared.
- **The depth cue is already built and is two-part.** `mColumns` runs two stands
  at different distances passing at different rates, *"parallax is what makes it
  a walk among the trees rather than a texture scrolling by"*, while the rays stay
  anchored to the sky as the other half (viz.js:183–188). Trunk edges are hard on
  purpose: *"a trunk is an object in front of the mist"*.
- **Canopy breaks the beams properly.** Under `canopy`, shafts are cut by two
  scales sampled in the travel frame, one lagging the other, so the pattern
  reorganises rather than sliding past as a rigid stencil (viz.js:174–177).

None of this needs changing. If forest gets its own reference set later, start
from the fact that it is already carrying more machinery than any other mood.

### The wisp ask: zigzag, not orbit

Current motion, one line:

```
vec2 c = g + 0.5 + 0.34 * vec2(sin(t * (0.21 + h.x * 0.19) + h.y * 6.28),
                               cos(t * (0.17 + h.y * 0.21) + h.x * 6.28));
```
(viz.js:861–862)

Sine against cosine at slightly different rates is a **smooth ellipse** — a
closed, cornerless orbit with a period somewhere around 16–37 seconds per wisp.
The header calls them *"a few slow lights wandering between the trunks"*, and that
is exactly what they do. Wandering is not zigzagging. **A sine has no corners,
and a zigzag is nothing but corners.** That is the whole gap.

**Cheapest route: add a triangle term.** A triangle wave
(`2.0 * abs(fract(x) - 0.5)`) is a zigzag by construction. Keep the slow ellipse
as the overall wander — it is what seats the wisp in the forest — and add a
faster, smaller triangle component on top so the path acquires kinks. Two scales,
one lagging, is the same trick the canopy already uses.

**If that reads too regular: dart-and-hold.** Quantise time into segments
(`floor(t * rate)` with a per-wisp rate), hash a fresh heading per segment, and
ease sharply between them. That gives dart–pause–dart, which is closer to what
the word "conjure" implies. Bigger change; try the triangle first and only
escalate if it looks like a wobble rather than a dart.

**Optional, and idiomatic:** wisps already flare with treble
(`clamp(u_sparkle, …)` at the call site, viz.js:1286) — *"high sparkling playing
excites the little lights, where the bass end belongs to the mist and the warp"*.
Letting treble drive the **dart rate** as well as the brightness would make
excited lights move erratically, not merely glow harder. Natural extension, but
add it after the motion itself reads right.

### What must survive the change

These are all load-bearing, each fixing a specific past failure:

- **Per-wisp periods stay distinct.** *"Wisps that breathe together read as a
  light rig; the whole illusion is that each one is a separate body."* A shared
  zigzag clock would undo this — hash the dart phase per cell.
- **They stay rare.** `on = step(1.0 - 0.2 * w, …)` lights roughly an eighth of
  cells at forest's weight. An earlier pass lit a third and *"they ran together
  into exactly the green cloud this motif was added to fix."*
- **They stay off the trunks' pace.** The `flow * 0.32` offset seats them
  mid-distance *"so they read as creatures drifting among the trees rather than
  furniture bolted to them."*
- **They stay soft.** *"Phosphorescent, not sparkly … foxfire on wet wood, not
  glitter."* A hard core read as a lens flare. Faster motion must not tempt a
  brighter centre.

### Not the colours

The reference's yellow/blue/orange orbs are explicitly excluded by the owner.
Worth knowing that the engine **already** gives each wisp its own colour — cold
green through a rarer blue-cyan, plus a warm gold on about one in seven
(viz.js:876–879) — so the reference's variety is not a missing feature. Leave
this alone; only the path changes.

### Feel

| | |
|---|---|
| **Quiet is** | Mist, hard-edged trunks passing at two depths, broken shafts overhead, and a few lights hanging almost still between the trees. |
| **The music is** | Bass in the mist and the warp; treble in the wisps — high sparkling playing excites them. With the change: excitement that reads as *darting*, not just brightening. |

### Changes

**Data** — none. Wisp weight, rarity and colour are all right.

**Engine** (`portal/js/viz.js`, `mWisps`)
1. Add a per-wisp triangle-wave term to the orbit so the path has corners.
   Keep the ellipse underneath as the wander.
2. Only if too smooth: replace with hashed per-segment headings for dart-and-hold.
3. Optional, afterwards: let treble drive dart rate as well as brightness.

Forest is the mood where faint shared changes show up first, so check sunshine
after touching anything here — and vice versa, since both run `mRays`.

## ice

*Awaiting reference.*
