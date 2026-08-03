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
  rescaling. **Do not move the aurora's `wake` gate first** — that would hide
  the miscalibration rather than fix it.
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

#### Open, in the order it probably wants doing

1. **DONE (fifth pass): ice's barbs now leave the spine, cave's crystals are
   resolved by depth.** Both are described in `MOODS.md` "Fifth pass". Neither
   has been seen by the owner yet.
   - Ice needed a second correction found only by rendering: three habits maxed
     together draw three lattices over each other, which is a triangular NET.
     A slow field now gives each region one habit to itself.
   - The owner's half-question about lighting the crystals from the register was
     answered in the fifth pass — *"Fuller crystal illumination might want to be
     tied to a higher range as well"* — and built. The ambient-drip half of that
     old idea was not raised again and was not built.
2. **The flock is faint at the website's aperture** (~180px tall). The specks
   are sized in the body's frame and fall under a pixel there. Correct at
   broadcast resolution. Making the grain resolution-aware without disturbing
   the look the owner approved over ten rounds is the work. (Untouched by the
   `dFdx` change, which altered the cost and not the picture.)
3. **Seeing the eye from the phone.** Asked for and not built: "it's hard to see
   my desktop from the piano in order to test responsiveness". `control.html`
   already talks to the relay; the cheap route is to render the same viz small
   there, driven by features the broadcast pushes over the relay, rather than
   streaming pixels.
4. **Centroid rescale** — still blocked on two more readings, and now it matters
   more than it did: the aurora's gate was moved to 0.54-0.76 in the fifth pass
   on the owner's instruction that it belongs to the high register, and that
   number is only right if the scale under it is. If the top of the piano really
   does read 0.76, the gate is the top third of the instrument, which is what
   was asked for. Take the bass and mid readings before touching it again.
5. **viz.js's shared `hash()` ends in `fract(p.x * p.y)`**, which correlates
   along both axes and draws a grid into whatever is built on it. That is the
   flock's fault #4, and the flock carries a fixed hash privately rather
   than disturb sixteen tuned moods. Worth investigating whether it is quietly
   banding other motifs — but it is a change that touches everything, so do it
   deliberately and re-render the whole set.
6. Blooming wants *bursting* blossoms; petals only approximates it. The fifth
   pass gave petals their own shape and flight but did not open a flower.
7. **Barren could go further.** The owner said *"there have to be more
   interesting ways to convey the idea of a barren, dry forest"*, and what was
   built answers the specific half of that (pale brown trunks among the white,
   varying trunk to trunk, shaded round). The open half is structural: bare
   branches overhead, or standing deadfall. Both want a motif.

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
