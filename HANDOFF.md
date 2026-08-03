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
- **The real question is still unanswered:** its own mood (dusk sky, one flock,
  nothing else) or a motif riding over existing moods? Do not decide alone.

---

## 3. The moods — expect a lot of feedback next

The owner has said they have a lot of mood feedback coming. Orientation:

### The standing rule, recorded at the top of `MOODS.md`

> "All the images I show you are just vague approximations of the atmosphere it
> should give off, unless there are obvious crossovers or I tell you something
> specific."

Take references as atmosphere, not as specification. When they say something
specific ("no stars, only crystals"; "the sky should look cold and thin"),
that part *is* specification.

### How the engine is shaped

- One fragment shader, `portal/js/viz.js`. Themes are **pure data**: palette,
  params, motif weights, feature mappings. 16 themes, 24 motifs.
- `portal/js/themes.js` carries a **built-in copy of every theme** so a failed
  `theme.json` fetch can never blank the site. Edit one, edit the other;
  `node tools/validate-assets.mjs` fails loudly when they drift and has caught
  it twice.
- **Sub-moods** are derived from names: `x-y` is a sub-mood of `x` when `x` is
  itself a theme (`familiesOf()`). `KIN` says which moods morph without the
  eye closing.
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
  it — the guard has since caught it twice more. Do not remove it.
- **`atan` wraps**, and the wrap is a visible seam. Sample angular things
  around a circle (on the direction vector), not by feeding `atan` to `fbm`.
- **Smooth what moves geometry; leave what moves light alone.** A 40 ms attack
  on a colour ramp is right; on a coordinate it is a twitch.
- Everything else that will bite: `PLAN.md` §14.5.

### Carried over, not done

- **Centroid rescale.** The owner reported the top of the piano reads ~2500 Hz,
  which is 0.76 on a scale that runs to 8 kHz — so the whole usable range is
  squashed into the top quarter, and that is the likeliest reason the aurora
  rarely fires. Two more readings are needed (mid-register and bass) before
  rescaling. **Do not move the aurora's `wake` gate first** — that would hide
  the miscalibration rather than fix it.
- **Sound testing** was deferred ("pretty late"). The `pitch` row in the HUD is
  built and waiting, and shows live values only — never the synthetic stand-in,
  or the sound-check would lie.
- Rough edges the owner has not seen yet: blooming wants *bursting* blossoms
  (petals only approximates it).

### The 2026-08-03 feedback round — what was done and what was not

Nine notes, all mechanism-level. See `MOODS.md` "Third pass" for the faults.
Done: volcano rebuilt on a new `cone` motif, frost made monotonic, forest motes
fixed (fall direction, seams, per-mote flutter), barren emptied, the mood
crossfade split into kin/cut and hidden behind a real hold, sunshower made a
shared sub-mood with the arc replaced by refracted patches, desert ripples made
per-layer, stars fenced to the sky, aurora given internal motion.

**Verified by render:** volcano (four passes — the flows lit the outline, then
closed into rings), and ice's frost across three scales. **Verified only by
test and by reasoning:** everything else.

**Ice is half done and should be judged as such.** The reported fault — "the
blotches thicken and shrink" — was a sine in the growth front and is gone: it
starts plain, only ever advances, and spreads slowly. The scale was retuned
against the references (0.55 was a few enormous ferns, 1.7 was dust, 1.05 is
filaments). But it still does not look like the references. It reads as angular
splinters, near enough to cracks in the glass, because in `frond()` the barbs
brighten the spine rather than protruding from it — a line of varying
brightness is not a feather. The barbs have to extend the level set
perpendicular to the spine. That is the next mechanism, and it is written into
the function. `npm test` is green at 85/85 but a still frame
proves little here; the frost and the motes in particular need eyes in motion.

**Not done, and deliberately:**

- **Cave.** The owner is happy with it and their note was a question, not an
  instruction ("I wonder if…"). But the overlap fault has a found mechanism:
  `mCrystals` accumulates spears with `if (v > best)` — a per-fragment max on
  BRIGHTNESS with no depth at all. Where two spears cross, the boundary between
  them follows the lighting rather than the geometry, so there is no silhouette
  edge of a near spear against a far one, and the eye reads flat decals stacked
  in a plane. That is "not really attached to the wall". The fix is to select by
  the spear's depth instead of its brightness — the cluster seat already knows
  its depth into the passage. Their proposed mitigation (light the crystals only
  on high-register playing, ambient drip for the low end) is a mood decision
  with an unresolved half, and was left for them.
- **Seeing the eye from the remote.** Asked for, not built: "it's hard to see my
  desktop from the piano in order to test responsiveness". `control.html` is a
  phone page that already talks to the relay; the cheap version is to render
  the same viz at a small size there, driven by features the broadcast pushes
  over the relay, rather than streaming pixels.
- Raised as veil-dance candidates, never chosen: aurora as its own mood, kelp,
  virga, incense.

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
