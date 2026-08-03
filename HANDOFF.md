# Handoff — 2026-08-03

Written at the end of a long session so the next one does not have to
rediscover any of it. Read `CLAUDE.md` first (branches — it matters), then
this, then `MOODS.md` when mood work starts.

---

## 0. Two things a fresh session will get wrong

**Your working branch is probably cut from the wrong base.** The repo's GitHub
*default branch* is `claude/discussion-next-steps-cshpet` — the frozen
website-only reference. A web session clones the default, so it starts on a
tree with no `broadcast.html`, no `MOODS.md`, no `murmuration.html`, and no
CLAUDE.md to say so. Check before you work:

```
git rev-parse HEAD
git rev-parse origin/claude/youtube-desktop-eye-streaming-go1do0
```

If they differ and you have no commits of your own, `git reset --hard` onto the
broadcast branch. Changing the GitHub default to the broadcast branch would fix
this permanently and does not touch the reference; it is the owner's call and
has been raised.

**A `main` briefly existed and is gone again** — deleted by the owner on
2026-08-03. It was one commit (`3a6e24f`, 2026-08-02, "Make main the trunk and
write it down"), branched off a point 26 commits behind the broadcast branch
and carrying a CLAUDE.md that the current one reverses; a pull from it would
have looked like the portal lost a day. Recorded because a session that finds
that commit in the reflog, or reads that older CLAUDE.md, should know it was
ruled against and not treat it as a trunk to restore. There is no `main` and
one is not wanted.

Note for a session that needs a branch deleted: the git relay refuses ref
deletions with a 403 even though ordinary pushes work. That is a guardrail, not
a broken credential — report it and let the owner do it.

## 1. Branches — read before running any git command

`CLAUDE.md` is the authority. The short version:

- **`claude/youtube-desktop-eye-streaming-go1do0`** — the broadcast build: the
  website *plus* `portal/broadcast.html`. **This is where work lands.**
- **`claude/discussion-next-steps-cshpet`** — website only, no
  `broadcast.html`. **A frozen reference copy. Do not advance it, ever.**
  `TESTING.md`'s "compare against the original website" step is the only thing
  that reference exists for, and fast-forwarding it silently destroys that
  check while the instructions keep claiming to work. This has already been
  done once by accident and had to be force-pushed back.
- Both names are hardcoded in `RUNNING.md` and `TESTING.md` clone commands.
  Renaming either means editing those files in the same commit.
- There is no `main` and one is not wanted.

A web session gets its own `claude/*` branch from the harness. That is scratch
space — land the work on the broadcast branch before the session ends so a
plain `git pull` picks it up.

---

## 2. The murmuration prototype

**Live artifact:** https://claude.ai/code/artifact/3cd9e2d3-4a53-426b-9a5c-e75673ee3afa

**Source:** `tools/prototypes/murmuration.html` (committed, so it survives the
session that made it). See `tools/prototypes/README.md` for what it is and how
the headless check works.

### Updating the artifact without minting a new URL

This matters. From a session that did not itself publish it, calling `Artifact`
with only a file path creates a **new** artifact at a **new** URL, and the
owner's link goes stale. Pass the existing URL:

```
Artifact(
  file_path: "tools/prototypes/murmuration.html",
  url: "https://claude.ai/code/artifact/3cd9e2d3-4a53-426b-9a5c-e75673ee3afa",
  favicon: "🐦",           # keep this stable — the owner finds the tab by it
  label: "v11-…"
)
```

`action: "list"` finds it again if the URL is ever lost. `WebFetch` on the URL
reads back what is currently published. Bump the `v…` in the page's eyebrow
each time; the owner refers to versions by that number.

### Where it stands

Ten rounds of the owner watching it and reporting, each of which found a real
structural fault. It is close. The last report was *"getting real close"*.

The faults are worth knowing because they rhyme, and the same mistakes are
available in `portal/js/viz.js`:

1. *Marbled, like suspended fluid* — animating a noise offset cross-fades
   between unrelated shapes. Advection carries structure.
2. *Blurry lens edges, birds half-exist* — the body's falloff was multiplied
   into the signed field **before** the level set was taken, so it dissolved
   the sheet instead of ending it. Also: fading and thinning are different.
   A flock's edge has *fewer* birds, each fully solid.
3. *Grows and shrinks rather than morphing* — only the outline lived in the
   flock's frame; the field was world-locked, making the body an aperture
   sliding over fixed wallpaper. Also, the body was wider than the frame, and
   you cannot see a thing *turn* if you never see its ends.
4. *Blunt and squared-off* — a grid inside the noise (a hash ending in
   `fract(p.x*p.y)` correlates in bands; octaves stacked without rotation) and
   specks that were thresholded value-noise rectangles.
5. *A flag with a pattern on it* — the trace stepped through the flow at a
   **single instant**. Deformation must accumulate along the trace, which means
   tracing backwards through *time*.
6. *The outline never changes* — the boundary was a rigid oval the folding
   happened inside. It now comes off the same traced coordinate as the
   interior. A uniform shear had to become crossed shear *waves* too: a uniform
   shear is a linear map and can only turn an oval into a longer oval.
7. *Stutters into a different shape* — the startle set its value to full in one
   frame, and it sits inside the body frame, so a strike remapped the whole
   texture and boundary instantaneously.
8. *Crossfading between disparate configurations* — two generations half a
   lifetime apart meant every handover blended a fresh arrangement with a
   shredded one, all over the flock at once.
9. *Way too fast* — slow the single clock, not the flow. Halving the flow would
   halve the strain per lifetime, so the lifetime would have to double to keep
   the same folding, and that doubles the tracing. Slowing the clock is free
   and preserves the look exactly.
10. *Too dramatically stretchy too quickly* — strain compounds, so a modest
    shear amplitude was drawing a circle out to ~6× its length per lifetime.

### Open on it

- Residual "small amount of non-fluid jumping" the owner is not sure is
  separate from the stretchiness. Unconfirmed as of the last change.
- Seven generations instead of five would halve the handover gap again, but
  cost nearly 2× — the spatial phase stagger makes the skip-cheap-layers branch
  diverge between neighbouring pixels. Backed out.
- **ANSWERED, 2026-08-03: its own mood.** The owner: *"I always wanted it to be
  its own mood. it's way too costly to be a mere motif."* Ported into
  `portal/js/viz.js` as the `flock` motif plus a `moon`, and shipped as the
  `flock` theme — dusk sky, a few stars, a moon. (It was called `murmuration`
  until the owner named it: *"Should be called 'flock.'"*) The prototype stays
  in `tools/prototypes/` as the place to iterate on the look cheaply; the engine
  copy is the one that ships.

### Porting notes, for whoever touches it next

- **It keeps its own noise primitives**, under `fk*` names. The prototype's
  fourth fault was a hash ending in `fract(p.x * p.y)`, which correlates along
  both axes and draws a grid into everything built on it — and viz.js's shared
  `hash()` ends in exactly that. Worth knowing on its own account: the shared
  hash may be quietly banding other motifs.
- **`speed` is derived, not chosen.** The prototype ran one clock at
  `dt * agile * 0.40`, tuned at roughly agile 0.6; viz.js advances `u_t` at
  `dt * speed * 1.2`, so speed 0.20 reproduces it. Every rate in the flock is
  measured against that clock, so this number alone decides whether it looks
  like what was approved over ten rounds.
- **The gradient step must be `2.0 / u_res.y`,** not a constant. Ported as a
  fixed 0.004 it went sub-pixel in the portal's small aperture, the gradient
  became noise, and since both the band width and the sheet thickness derive
  from it the flock washed out to a smudge at one size while looking right at
  another.
- **Cost, measured** (`npm run perf`, software rendering — only the ratios
  mean anything). It was the dearest mood in the set at **1.53x** the cheapest,
  and the reason was not the trace but the GRADIENT: `fkField` was evaluated
  three times per fragment, twice of them purely to take a forward difference.
  It now uses `dFdx`/`dFdy`, which read the neighbouring fragments'
  already-computed values out of the quad, so two of the three traces are gone.

  **After: 1.13x, and it is no longer the dearest mood — cave is, at 1.39x.**
  The `fkNear` early-out still does the rest of the work; most of the frame is
  open sky and never traces at all. See the trap in §3 about derivatives and
  early returns.

  Two things moved the other way in the same measurement and are worth watching:
  forest-blooming went 1.25x -> 1.31x and forest-autumn 1.18x -> 1.30x, which is
  the petals rewrite (a per-mote rotation costs two transcendentals, and
  `mColumns` gained an fbm for its cylinder shading). Both are still well under
  cave. If the forest ever needs the budget back, the mote's rotation is the
  place to look — a cheaper turn than sin/cos would buy most of it.
- **Known limitation, not yet solved:** at the *website's* aperture (~180px
  tall) the flock is faint. The specks are sized in the body's frame, so below
  a certain resolution they fall under a pixel and the thinning threshold
  removes most of them. It reads correctly at broadcast resolution, which is
  where this mood is meant to live. Making the grain resolution-aware without
  changing the approved look is the open piece of work.

---

## 3. The moods

Four rounds of feedback have landed and a fifth is coming — the owner has been
testing on their own machine. The open list is at the end of this section;
everything before it is orientation you will want first.

### The standing rule, recorded at the top of `MOODS.md`

> "All the images I show you are just vague approximations of the atmosphere it
> should give off, unless there are obvious crossovers or I tell you something
> specific."

Take references as atmosphere, not as specification. When they say something
specific ("no stars, only crystals"; "the sky should look cold and thin"),
that part *is* specification.

### How the engine is shaped

- One fragment shader, `portal/js/viz.js`. Themes are **pure data**: palette,
  params, motif weights, feature mappings. 17 themes, 27 motifs.
- `portal/js/themes.js` carries a **built-in copy of every theme** so a failed
  `theme.json` fetch can never blank the site. Edit one, edit the other;
  `node tools/validate-assets.mjs` fails loudly when they drift and has caught
  it twice.
- **Sub-moods** are derived from names: `x-y` is a sub-mood of `x` when `x` is
  itself a theme (`familiesOf()`). One exception, declared in `SHARED_CHILDREN`
  because a name encodes a tree and cannot say it: sunshower belongs to BOTH
  rain and sunshine, so it has a button under each. Anything that walks the
  families must cope with one mood owning two buttons — `moodButtons` in
  broadcast.js and control.html are name→[button] maps for that reason.
  `KIN` says which moods morph without the eye closing.
- `lnoise` is the linear-interpolation twin of `noise()`. Straight segments
  meeting at corners. Every angular material uses it — rock, lightning, frost.
  Smooth `noise()` is for weather. Three separate "bent/lumpy" complaints all
  turned out to be this one primitive.

### Working on a mood

```
cd tools && npm run shots -- --themes mountain    # then READ the png
cd tools && npm test                              # validate + both smokes
```

Judge from the render, not from the source. But note `PLAN.md` §14.5: a still
frame proves little now that motifs answer `u_rms` — most recent changes are
invisible without motion or synthetic features.

The broadcast HUD has a **mock panel** (`m`) with level and register sliders
plus a strike, so a motif that only wakes under particular playing can be aimed
at deliberately instead of waited for. Moods are `1`–`9`, sub-moods
`Shift+1`–`9`.

### Traps that have already cost time

- **A backtick anywhere inside the `VERT`/`FRAG` template literals** closes the
  string early and breaks the module with a misleading JS syntax error. Cost
  two debugging rounds before `tools/validate-assets.mjs` gained a guard for
  it — the guard has since caught it **three** times more, the last of them
  from a comment quoting a new param name in prose. Do not remove it.
- **A clock MULTIPLIED by a live feature is the single most repeated bug in
  this engine.** `t * (a + drive * b)` rescales the phase already elapsed, so
  the picture slides backwards whenever the room quietens. It has now shipped
  in five places (snow, forest motes, embers, the flame's advection, the
  flame's travelling wave) and the owner has caught every one. It keeps
  returning because it is the obvious way to make something answer the music
  and it is invisible in a still. **The lawful form is a SUM of monotonic
  clocks: `t * a + flow * b`.** Grep any new motif for `t * (` before shipping.
- **Anything driven by an onset envelope has a retreat built into it.** If the
  envelope moves a threshold or a position, the thing moves out and then comes
  back as the envelope decays. `mFrost` did this and the owner read it as the
  frost swelling and thinning. `flowAcc` takes a pulse term now, so an onset
  can be spent as a surge of the travel CLOCK, which cannot run backwards.
- **A hardware derivative (`dFdx`/`dFdy`) in non-uniform control flow is
  undefined,** and here that means a bright seam along an early-out's own
  boundary: the lane that returned early never wrote the register the
  difference reads. `mFlock` initialises its value in every lane, takes the
  derivative unconditionally, and gates afterwards.
- **A live feature is not a state, and a threshold cannot turn one into the
  other.** The aurora was gated three times — wide open, then too high, then
  split in two — and every version tracked the register note for note, which the
  owner reads as bouncing. What it wanted was an ENVELOPE: fast attack, very slow
  release, integrated CPU-side beside the other smoothers, so the register
  charges the thing and the charge decides what is drawn. Reach for this whenever
  a motif should "linger" or "come on and stay on"; a threshold on a smoothed
  feature is still a threshold.
- **A periodic structure reads as a repeating motif, and jitter does not save
  it.** Three passes at frost built a lattice of ferns with the spacing, lean and
  length all randomised, and the owner named the result every time (a comb, then
  arrowheads, then centipedes). A grid has a period; the eye finds a period
  before it finds anything else. If the real thing nucleates at scattered points
  — frost, crystals, cracks, lichen — enumerate seeds and grow outward from them.
- **When a mood comes back a THIRD time, question the model, not the constants.**
  The seventh pass fixed three of these, and in every case the earlier fix had
  been the smallest change that could explain the complaint: another generation
  of branching where the lattice itself was wrong, a moved gate where reading the
  feature at all was wrong, a frequency knob where the trunks were never trunks.
  The smallest sufficient change is usually right, and it is exactly wrong here.
- **Early-outs in a fragment loop do not save what they look like they save.**
  The renderer runs a dynamic loop over a whole SIMD group, and lanes that
  disagree about when to leave execute the body under masking. Nine iterations
  with a cheap reject cost nine iterations. Shrink the worst case (a smaller
  neighbourhood, a cheaper body) rather than adding another guard.
- **A gate is only a gate if the feature can reach it.** The aurora was moved
  to `smoothstep(0.54, 0.76, centroid)` on the owner's own instruction that it
  belongs to the high register — and the synthetic stand-in's centroid never
  leaves 0.24–0.60, so under `mock:auto` it was simply off. Before narrowing any
  range, check what the driving feature actually spans: `features.js`
  `syntheticFeatures` for the stand-in, and the HUD's pitch row for live audio.
- **Two-sided asks need two gates.** "X should be a Y theme with Z as a bonus"
  is a statement about what is usually there AND what is occasionally there. One
  threshold can only choose between them, so tuning it oscillates: the aurora
  was too present, then absent, then too present, over three passes. Split it —
  a low gate for the modest permanent form, a high one for the event.
- **A pattern lying on a receding surface needs the perspective IN the pattern.**
  A fixed screen-space frequency reads as a sticker no matter how it is masked,
  and no amount of fencing it to one layer fixes that — `mRipples` was fenced to
  the near dune and came back *worse*. Divide: `z = 1/(horizonY - uv.y)` for
  depth, `uv.x * z` for across. The screen frequency then falls out as
  `pitch * z²`, and measuring that against the pixel pitch is the anti-aliasing
  guard and the aerial perspective in one expression.
- **`atan` wraps**, and the wrap is a visible seam. Sample angular things
  around a circle (on the direction vector), not by feeding `atan` to `fbm`.
- **Smooth what moves geometry; leave what moves light alone.** A 40 ms attack
  on a colour ramp is right; on a coordinate it is a twitch.
- **A motif shared by two moods cannot hardcode where its subject is.**
  `mSmoke`'s source height was a constant; retuned to suit fire, volcano's
  plume was drawn down the cone's FACE as a dark rectangular block on the rock.
  The caller passes it now. CLAUDE.md's warning that `js/` is shared by both
  builds applies just as hard to a motif shared by two moods.
- **`smoothstep(a, a, x)` with equal edges is a divide by zero,** and it
  returns coverage rather than nothing. `mFlame`'s width went to exactly 0
  above the flame's reach, and the garbage that came back got textured by the
  erosion and drew torn flame-coloured tongues along the top of the frame.
  Keep any width that feeds a smoothstep strictly positive.
- **Fence motifs LAST, after every contribution is summed.** The lava block
  applied its "never above the skyline" mask before the crater pool was added,
  so it fenced the flows only and the pool painted wherever its own terms were
  non-zero. Ordering, not masking, was the bug.
- **`skyMask` is not automatic.** `mStars` was never fenced by it, so stars lay
  on the sand in desert-night. Any motif that belongs to the sky needs the
  fence written in, and moods with no silhouette leave `skyMask` at 0 and are
  unaffected — which is why night never showed the fault.
- Everything else that will bite: `PLAN.md` §14.5.

### Detail on two carried-over items

Both appear in the open list below; the background is here so the list stays
readable.

- **Centroid rescale.** The owner reported the top of the piano reads ~2500 Hz,
  which is 0.76 on a scale that runs to 8 kHz — so the whole usable range is
  squashed into the top quarter, and that is the likeliest reason the aurora
  rarely fires. Two more readings are needed (mid-register and bass) before
  rescaling.

  This note used to say *"do not move the aurora's gate first — that would hide
  the miscalibration rather than fix it"*, and the sixth pass moved it anyway.
  Deliberately, and the reasoning matters: a gate placed outside what the
  feature can reach is not a mood waiting on a calibration, it is a motif that
  never draws, and the owner had by then reported it twice. The gates are inside
  the reachable range now (0.30–0.46 and 0.44–0.68). **They are placed against
  the scale as it currently is, so rescaling the centroid WILL move them** —
  when the readings arrive, retune night's two gates in the same commit, and
  check `mCrystals`' lamp and the `band` term in main while you are there.
- **Sound testing** was deferred ("pretty late"). The `pitch` row in the HUD is
  built and waiting, and shows live values only — never the synthetic stand-in,
  or the sound-check would lie.

### 2026-08-03 — four rounds of feedback, and what is still open

Twelve notes across four rounds, all mechanism-level. `MOODS.md` "Third pass"
and "Fourth pass" record the faults; the commit messages carry the reasoning.

**Done and verified by render:** volcano (rebuilt on a new `cone` motif, then
four more passes — the flows lit the outline, then closed into rings, then the
crater turned out to be sky, then the overflow painted a column into the night);
fire (seated below the frame, a travelling wave instead of a rigid lean, lit
smoke, a drop-shaped body); the murmuration as its own mood.

**Done, verified only by test and by reasoning:** frost made monotonic; forest
motes (fall direction, seams, per-mote flutter); barren emptied; the mood
crossfade split into kin/cut and hidden behind a real hold; sunshower made a
shared sub-mood with its arc replaced by refracted patches; desert ripples made
per-layer; stars fenced to the sky; the aurora given internal motion.

**The owner has now tested on their own machine and has a list.** Expect it, and
expect it to be good — every single "it looks like…" so far has named a real
structural fault. Read §4 before answering any of it.

#### 2026-08-03, fifth pass — the owner's own machine

Ten notes, all mechanism-level, all landed. `MOODS.md` "Fifth pass" records the
faults; the commit message carries the reasoning. Summary of what changed:

- fire and volcano: embers made monotonic (and the flame's advection and wave
  with them); the flame's seat raised so its belly is in shot; the lava given
  2D surface relief so it meanders and forks, a crust so it reads gooey, and
  most of its speed moved off `u_flow` so it stops surging with the phrase
- the forest seasons: a `leaf` param, so petals and leaves differ in shape,
  density AND flight — petals flutter privately, leaves share a gust
- barren: a `bark` param and a cylinder-shading term on `mColumns`
- ice: frost's growth made fast enough to see, its strike-driven retreat
  removed, its barbs made to leave the spine, and its three habits made to
  own regions rather than overlay each other
- night: the aurora gated to the top of the register, the stars rebuilt
- sunshower: the rainbow rebuilt out of caustic filaments; palette bluer/golder
- the murmuration mood renamed `flock`, and its gradient moved to `dFdx`/`dFdy`
- cave: crystals resolved by DEPTH, and lit harder in the high register
- desert: ripples fenced by `skyMask` and confined to the near range

**Not verified by the owner's eye.** Every mood that changed was rendered
(`npm run field`) and the renders caught SEVEN faults in the first cut of these
fixes — all of them failures of the fix rather than of the diagnosis, which is
a shape worth expecting. They are listed in `MOODS.md` under "What the renders
caught". Everything is verified by render and by test; nothing is verified by
the owner — see §4 on what that distinction is worth here.

`tools/field.mjs` gained a `--fps` flag in the same pass. Several moods only
become themselves after a while (frost growing, the cave's lamp swinging), and
reaching 30s of mood at 60fps is 1800 full-size draws on a renderer with no GPU
— minutes per mood. Every clock in the engine integrates dt properly, so
`--fps 15` lands in the same state for a quarter of the work. That is the
difference between two render iterations in a session and eight.

#### 2026-08-03, sixth pass — three of the ten came back

The owner watched stills and did limited testing. `MOODS.md` "Sixth pass"
records the faults in full; the short version:

- **ice** — the frond had two generations and both were regular, which is a
  fishbone, not a dendrite. Three generations now (trunk / branch / sub-branch),
  built from one sheared lattice applied three times, with spacing, lean and
  length all made into fields. Nucleation reaches zero so trunks break into
  separate ferns, and there is granular rime for the ferns to stand out of.
  Paid for by skipping fronds whose habit region is not selected.
- **night** — the fifth pass's gate sat outside the reachable centroid range, so
  the aurora never drew at all. Two gates now: a low one for a hem arc that is
  usually there, a high one for the curtain that climbs the sky.
- **desert** — the fifth pass answered "the ripples cross layers" with a fence.
  Wrong fix: the pattern was drawn in screen space with no foreshortening in it,
  and fencing a flat pattern to one layer makes it a sticker. `mRipples` works
  on each layer's own ground plane now, and the layer fence is gone because
  distance removes the far ranges' ribbing by itself.

The three faults are worth reading together: one fix stopped a level short, one
moved a gate out of reach, and one answered a complaint with a fence instead of
with physics.

The renders then caught three faults in these fixes — ice twice over, and the
desert's new perspective turning the near dune into a contour map. They are in
`MOODS.md` under "What the renders caught, after the sixth pass was written",
and the shape is now reliable enough to plan around: **expect the first cut of
any fix to be wrong in a way only a still will show, and budget a render round
for it.** `--fps 15` is what makes that affordable.

`tools/field.mjs` gained `--centroid` here. It was pinned at 0.45, so every
render of a pitch-gated motif only ever photographed one of the two things that
motif does — night's aurora is unjudgeable without it. Cost on the mood set is
unchanged or better: ice 1.10x → 1.08x and desert 1.08x → 1.05x, because
skipping unselected habit regions more than paid for the third generation.

#### 2026-08-03, seventh pass — nine notes, and one redirection

`MOODS.md` "Seventh pass" carries the reasoning. What changed:

- **the engine** — no blink for 7.5s after a mood lid; re-selecting the mood
  already showing restarts it (which is how the frost is cleared); the synthetic
  stand-in's centroid now reaches both ends of the register; flock lost its
  shooting stars behind a new `meteors` param.
- **ice** — rebuilt a third time, and the first time the MODEL changed: scattered
  nuclei each growing a crystal radially outward, no lattice anywhere, with the
  growth front measured as a path length along the crystal. Saturates over
  several minutes rather than seconds.
- **night** — the register charges an envelope (2.2s up, 26s down) and the
  envelope draws the curtain. Nothing in the shader reads the centroid.
- **the forest seasons** — the air moves instead of the motes: both lattice
  coordinates are warped by a wind field, so petals and leaves travel and swirl
  rather than swinging about a fixed x. Petal outline rebuilt (it was a cusped
  lens, which is a shard); blooming's palette lifted out of shadow; whole
  blossoms among the fall.
- **forest-barren** — `mColumns` is discrete trunks now rather than a threshold
  on a 1-D noise field, which is what the "VHS bands" were. Bare branches at high
  `bark`.
- **cave** — a faceted massif at each cluster's root swallows the spear
  crossings; the register's range went from about 3:1 to better than 20:1 across
  three levers, including the light on the ROCK.
- **sunshower** — the rainbow is thin-film iridescence now: a fringe on the
  cloud's own edge and an oil film on the puddles, with a REPEATING spectrum.

**Not verified by the owner's eye, and only partly by render** — the container
this was built in is degraded (see the note below), so fewer stills were taken
than the pattern warrants. Expect first-cut faults; the last two passes found
seven and three respectively, all of them failures of the fix rather than of the
diagnosis.

**The test suite is flaky in a loaded container, and it is not this branch.**
Measured, three runs each: HEAD failed `npm run smoke` 3/3; this work passed 2/3.
The failures are `waitForFunction` timeouts that move around between runs. If you
see one, run the three suites separately (`node validate-assets.mjs`,
`npm run smoke`, `npm run smoke:broadcast`) before believing it, and check HEAD
in the same conditions before believing it is yours.

`tools/shader-errors.mjs` was added in this pass and will save you an hour. When
the shader fails to compile, `npm test` says only "FAIL viz renderer selected
(none) — none"; this prints the actual GLSL log, with line numbers.

#### Open, in the order it probably wants doing

1. **The flock is faint at the website's aperture** (~180px tall). The specks
   are sized in the body's frame and fall under a pixel there. Correct at
   broadcast resolution. Making the grain resolution-aware without disturbing
   the look the owner approved over ten rounds is the work. (Untouched by the
   `dFdx` change, which altered the cost and not the picture.)
2. **Seeing the eye from the phone.** Asked for and not built: "it's hard to see
   my desktop from the piano in order to test responsiveness". `control.html`
   already talks to the relay; the cheap route is to render the same viz small
   there, driven by features the broadcast pushes over the relay, rather than
   streaming pixels.
3. **Centroid rescale — DONE, and it needs watching on real playing.** The scale
   was 60-8000 Hz against a piano that occupies roughly 120-4000, so the top
   third was unreachable and every gate placed by measuring observed values was
   calibrated to a range that did not exist. That is why "register is not
   affecting crystal illumination in any obvious way". Now 120-4000. The four
   dependent gates (the aurora's wake envelope at 0.66-0.86, `mCrystals`' lamp
   gain and nomination window, the cave pool's rock light, main's aurora `band`)
   were left where they are ON PURPOSE: they were placed to be reachable-but-
   demanding against the old scale, and they are now reachable-and-demanding
   against a correct one. If the owner reports the aurora arriving too easily,
   that is the first place to look, and the fix is to raise those four rather
   than to touch the scale again.
4. **viz.js's shared `hash()` ends in `fract(p.x * p.y)`**, which correlates
   along both axes and draws a grid into whatever is built on it. That is the
   flock's fault #4, and the flock carries a fixed hash privately rather
   than disturb sixteen tuned moods. Worth investigating whether it is quietly
   banding other motifs — but it is a change that touches everything, so do it
   deliberately and re-render the whole set.
5. **Fire and volcano got their pass (eighth) and volcano is the one to re-check
   first.** Fire's two faults were both structural and both fixed (a mirrored
   silhouette making a seam; a coverage mask punching holes in the interior).
   Volcano was rebuilt around a peak instead of a mesa, static relief on the
   rock, fewer channels and a glow over the vent — but that is four changes to
   one mood in a single pass, which is exactly the situation where the render
   usually finds that one of them overshot. Look at it before anything else.
6. **Blossoms fall but nothing BURSTS — and the falling-flower route is now
   closed.** The seventh pass put whole five-lobed flowers among the petals; the
   owner's verdict on seeing them move was "very obvious that they don't tumble
   and float like they actually would... a very cartoonish effect", and they are
   off (`flower: 0`, shape still in the engine). Which leaves the original ask
   unanswered and points at the only route left: "flowers bursting" reads as
   blossom opening ON THE TREE — a cluster in the canopy that pops and then
   sheds. A site system (the rays block already nominates sites), never another
   falling mote.
7. **Standing deadfall, for barren.** Bare branches landed in `mColumns`; a
   fallen or leaning trunk did not, and it is the other half of what makes a
   dead wood read as dead rather than as a wood in winter.

#### 2026-08-03, eighth pass — fourteen notes from extended testing

`MOODS.md` "Eighth pass" carries the reasoning. The through-line: **motion read
as the wrong object.** In four moods the geometry was defensible and the way it
moved named something else — a hue ramp at constant luminance is a thermal
camera, a body frame scaled by an onset is a zoom lens, a lattice warped by a
shared field is a sheet of glass with leaves painted on it, and a cone with a
flat top is a mesa. None would have been found from a still.

What landed: the flower gate moved off `leaf` onto its own parameter (a gate
fires on the PATH between two themes); per-mote orbits in quadrature so motes
stop travelling as one plane; whole flowers off; autumn's copper moved from the
light to the leaves; the wisp density raised after counting that TWO of
thirty-five cells were lit; the aurora's ray shear made linear; the centroid
rescaled to 120-4000 Hz; cave crystals given a presence floor, a flattened spiky
base and register-scaled sparkles; sunshower's cloud perspective softened from
six-to-one to three-to-one, with billows and a lit deck; the iridescence given
varying saturation and brightness; fire's mirrored silhouette split into two
independent tear functions and its interior erosion moved to the outline;
volcano rebuilt around a peak with static rock relief, fewer channels and a vent
glow; desert given heat; the flock's clench moved from geometry into density.

**Two things to check first, because they are the least verified:**

1. **Volcano took four changes in one pass** — profile, rock texture, channel
   count, vent glow. That is exactly the shape of a change where one of them
   overshoots and the render finds it. The peak profile in particular changes
   the silhouette of the whole mood.
2. **The centroid rescale moved the ground under four gates at once** and they
   were deliberately left where they sit (see the open list). The aurora is the
   one to watch: it was tuned to be demanding against a scale whose top third
   was unreachable, and the top third is now reachable.

**Still unverified by the owner, and worth saying plainly:** everything in this
pass was checked by shader compile, `npm test`, `perf.mjs` and field renders.
The renders catch structure; they cannot catch how something moves, and eight
passes of history say that is where this owner's notes come from.

**A test-suite trap, so the next session does not lose an hour to it.** The
website smoke check "source returning mid-drowse resumes communing" is racy on a
loaded machine and its failure mode is ABSORBING, so raising the timeout does
not help. The eye drowses, and if the harness takes longer than `drowseMs`
(3000 in fast mode) to hand the observed state back to the test, the eye seals
and then re-stirs to `open` — a state from which `communing` is unreachable
without a gesture. The trail on a failing run reads
`451ms drowsing -> 4800ms sealed -> 5992ms stirring -> 8655ms open`. If you see
that, it is the machine, not the code: re-run. Confirmed by checking that node's
own timers were drifting only 23ms, i.e. the browser process was the slow one.

---

## 4. How this owner works, and what it is worth

They judge by eye, in motion, and they are unusually good at it. Every single
"it looks a bit like…" in this session turned out to name a real structural
fault, several of which no measurement caught. *"Crossfading between disparate
configurations"* was a literally accurate description of a two-generation blend
they could not see the source of.

So: when they describe an impression, look for the mechanism that would produce
exactly that impression. Do not treat it as a request to nudge a constant.

They are not always in a position to test, and they say so. Believe them, and
do not gate work on their verification when it can be built and verified
another way — but do not claim something is confirmed when only you have seen
it. Say which is which.

Screenshots you take with `npm run shots` and the prototype checker **are**
visible to them in the transcript. Use that.
