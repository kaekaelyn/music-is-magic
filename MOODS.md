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

All eight moods have references and notes. What follows is the order the *work*
wants to happen in, which is not the order the references arrived in.

## Where to start

Three findings cut across several moods. Doing them in this order means later
work is judged against a build that is already correct, rather than being tuned
to compensate for something still wrong underneath.

**1. Measure the centroid before repairing anything that depends on it.**
Add a `pitch` row to the broadcast HUD, play for thirty seconds, read it. The
centroid gates night's aurora brightness *and* its colour, leans the ray fan in
sunshine and forest, drives ice's facets, tints the storm, and feeds every
theme's `shiftCentroid`. If it reads wrong, several moods are quietly
miscalibrated and any tuning done first is tuning done against a fault. This is
the cheapest measurement in the project. See **night**.

**2. Build the slow weather follower once; it serves two moods.**
Rain needs it to go from drizzle to storm without becoming fickle. Sunshine
needs the same signal to make its cloud deck gather and part — which is the only
thing standing between it and the drama in its own references, since the
sun-through-a-gap coupling is already wired. One piece of engine work, two
moods, no new motif in either. See **rain §1** and **sunshine**.

**3. Take the palette-only wins immediately.**
Two moods are held back by a single colour each, needing no engine work at all:
ocean's foam cannot reach white because its top step is mint, and night has no
warm tone for its reference's gold. Both are one edit, both are safe, and ocean's
may raise apparent foam coverage on its own. See **ocean** and **night**.

After those: the mood-private engine work — cave's passage width and cluster
count, ice's frost presence, mountain's `skyMask` gating and haze, forest's wisp
path. None of them disturb another mood, so they can happen in any order and be
judged independently.

Two things are explicitly **not** on the list: bird flocks in sunshine, and
giving sunshine rain's kind of responsiveness. Both are argued against in place.

## Implemented 2026-08-02 — none of it yet verified by eye

The owner reported three shape failures — cave "warped or bent", rain's
lightning "bent/curved… branches not attached", mountain "lumpy and pokey
instead of craggy triangle-ish juts" — and all three shared one cause: the
engine had only smooth noise, and rock, lightning and crystal are angular
materials. A linear-interpolation twin (`lnoise`, viz.js) now exists; angular
things sample it, weather keeps the smooth one.

- **mountain** — ridge profile folds `lnoise`, blended by nearness (far range
  stays soft: distance rounds); the quadratic sharpen that bent straight
  flanks into parabolas is removed. Clouds on at 0.32, gated by `skyMask`;
  colour haze keyed on `ridgeLayer`.
- **rain** — bolt path is piecewise-linear at two scales (`boltPath`); the
  fork now leaves from the channel's own x at a hashed branch height, offset
  zero at the branch. Attached by construction.
- **cave** — crystals grow in the **unwarped** tunnel frame (straight spears
  in a crooked passage; rock keeps its slump); lattice warp halved; bore
  1.55 → 1.15; sides 11 → 9; clusters 4 → 5. Perf: cave 1.31× the cheapest
  mood (suite budget intact).
- **ice** — frost has its own composite channel; the 0.45-through-snow
  ceiling is gone, filaments reach near-white.
- **ocean** — `c4` mint → near-white; foam can finally be white water.
- **night** — palette warmed at top (gold reaches stars and fog), ground
  leaned teal. Aurora untouched, per the palette-independence fix.
- **forest** — rays 0.62 → 0.78; motes: glint 0.16 pinned to the ray field
  (site nomination in the rays block); wisps carry a triangular zigzag over
  the orbit — corners, per the reference.

## Seventh pass — 2026-08-03, stills, limited testing, and a redirection

Nine notes. Three of them (ice, night, the forest seasons) are the third or
fourth visit to the same mood, and the pattern in why is worth naming before the
list: **each earlier fix was a smaller idea than the fault required.** Frost got
another generation when it needed to stop being a lattice. The aurora got its
gate moved when it needed to stop reading a live feature. The trunks got a
frequency knob when they were never trunks at all. Reaching for the smallest
change that could explain the complaint is usually right and was wrong three
times running here — when a mood comes back a third time, the thing to question
is the model, not the constants.

### The engine

- **Blinking through a mood change.** A blink was already impossible while the
  lid was down, but nothing pushed the schedule back, so one could land the
  instant it lifted — and often did, because 1.45s of not-blinking brings the
  due time closer. `MOOD_SETTLE` is 7.5s past the end of the lid, longer than a
  normal blink interval, so the first look at a new mood is uninterrupted. The
  owner's reasoning is the right one and is now in the code: nobody needs to
  blink straight after holding their eyes shut for a second and a half.

- **Re-selecting the mood already showing now restarts it.** It used to be a
  no-op (`if (token === currentToken) return`), which is correct for the relay
  and the poller — both hand the same name over several times a minute — but
  wrong for an operator pressing a button. The owner named the gesture while
  describing frost: "to clear it, I would have to press ice again from the
  control panel, or switch back to it after another mood." Those two now do the
  same thing. Note the trap this immediately created and the test caught: the
  restart must apply ONLY to the mood on screen, or it forces the lid onto kin
  transitions and rain-into-sunshower stops morphing in the open.

- **`syntheticFeatures`' centroid ran 0.24-0.60** — the middle of the register
  and nothing else. A stand-in that cannot visit a range cannot stand in for it,
  and every "is this motif too subtle or is it off?" question about the top of
  the keyboard was unanswerable under `mock:auto` for that reason. Two slow
  terms with incommensurable periods now take it to both ends.

- **Flock's shooting stars are gone**, per the owner: "the flock is interesting
  enough." A `meteors` param rather than dropping the stars, because the sky
  should keep its stars.

### The moods

- **ice — "a bunch of centipedes or fish bones".** The third rebuild, and the
  first one that changes the model. Every previous version was a periodic
  LATTICE of trunks with branches hung off it, and a lattice repeats: no amount
  of jittering the spacing, the lean or the length removes a period, and the eye
  finds a period faster than it finds anything else in a picture.

  It is now scattered nuclei, each growing its own crystal radially outward:
  jittered seeds, per-seed orientation, six arms of six different lengths, and
  its own start time and rate. Nothing about it is periodic and the crystals
  collide at every angle. The six-fold fold costs no trigonometry — the arm a
  point belongs to is whichever of three axes has the largest projection, and
  the sign says which end — so (along, across) in the arm's own frame comes out
  of six dot products, and the sheared branch lattice from the sixth pass then
  works inside it unchanged.

  **Growth is geometry now, not a threshold.** The old version swept a level set
  down through a static field, which fades a picture in — that is why it "forms
  quickly and then stays stable" however slowly the level moves. Here the front
  is a PATH LENGTH from the seed: an arm is drawn as far as the front has
  reached, a branch does not exist until the front passes its root and then
  extends from that moment, a sub-branch waits for its branch. So it grows
  outward, forks as it goes, and feathers at the ends, in the order a crystal
  actually does.

  **Minutes, not seconds**, and the arithmetic rather than a feel: the flow
  clock runs at roughly 0.2/s under moderate playing, seeds nucleate over the
  first two minutes, and the earliest are near their final size at three to
  four. It saturates rather than creeping forever. Clearing it is the mood
  restart above.

- **night — still bouncing.** The sixth pass's two gates were still reading a
  live feature, so the curtain tracked the register note for note: "it sort
  of... bounced? And then disappeared entirely, only to reappear (and fade in
  and out) later." Three attempts at this have now failed the same way, and the
  common factor is not where the threshold sat, it is that a threshold was the
  answer at all.

  An aurora is a STATE. It takes time to rise and it outlasts what woke it. So
  the register no longer sets the curtain's brightness — it charges an envelope
  (2.2s up, 26s down, CPU-side beside the other smoothers) and the envelope sets
  the brightness. One gate, at the top of the register where the owner has
  always said it belongs, and nothing in the shader reads the centroid directly.
  The curtain's own structure moved too: the folds and rays are anchored to
  height inside the curtain rather than to the frame's vertical, so the sheet
  hangs and shears as one body instead of sliding across a fixed pattern.

- **forest-blooming — "hard shards", and gloomy.** Two separate faults.

  The shape was a lens closed at both ends by `sqrt(4s(1-s))`, which comes to a
  CUSP at each end; a cusped ellipse at that size is a shard. A blossom petal
  leaves the stem narrow, widens fast and finishes in a semicircular cap —
  `pow(s, 0.42)` for the widening and `sqrt(1 - s²)` for the cap, whose vertical
  tangent at the tip is what makes the end read as round. The edge is softer for
  petals than for leaves, because a blossom petal passes light and a dead leaf
  does not.

  The palette began at #0b1a0d and #2f3a22 — a near-black green and a dark
  olive — so four fifths of the field sat in shadow. A sunlit wood has light in
  its SHADOWS; the darkest thing in it is a lit green.

- **forest-autumn — "they just fall straight down. I was thinking gusty
  swirls."** Diagnosed exactly. Every version gave each mote a sway about its own
  seat: a bounded oscillation around a fixed x, so the net horizontal travel over
  a whole fall was zero. Tuning the swing cannot fix a displacement of zero.

  The cure is to stop moving the motes and move the AIR. Both lattice
  coordinates are warped before they are floored — the lane by a wind that
  varies with height, so a mote sweeps sideways as it descends and motes at
  different heights go different ways at once; the row by an updraft that varies
  with x, so a mote slows and hangs as it crosses a thermal. A mote's identity is
  its cell in the warped grid, so it is carried by the field rather than
  displaced within its cell, and the travel is unbounded at no extra cost.

  Both fields take the flow clock in their PHASE and never in their amplitude.
  An amplitude on a live feature is the retreat fault in its purest form.

- **forest-barren — "banded stripes… not quite unlike old VHS tape bands".**
  `mColumns` was `fbm(vec2(x, 4.7))` — a threshold on a ONE-DIMENSIONAL function
  of x. Every "trunk" was therefore a uniform vertical band running the full
  height of the frame with hard parallel edges and no top, bottom or middle.
  That is not a trunk that needs tuning, it is a stripe. A dark green wood hides
  it; barren picks the bands out in their own colour and it collapses.

  The owner's call — "maybe all forest trunks should be fixed and be done with
  it" — taken. Discrete trunks at hashed positions now, each with its own width,
  lean, sinuosity, taper, root flare and colour, in three depth layers with the
  far ones eaten from the canopy down by mist. The shading is a real normal:
  distance from the centreline over the half-width IS the cylinder's normal,
  where the old term differenced the noise field and could only say where an
  edge was. Bare branches where `bark` says the trunks are the subject, which is
  the structural half of the barren note from two passes ago.

- **cave — still detached, and not dramatic enough.** Depth ordering fixed which
  spear owns a pixel and the owner still read the clusters as detached, which is
  correct: ordering the crossings does not remove them. Six prisms radiating
  from one point cross near that point no matter which wins.

  Real quartz does not do that — spears rise out of a mass that has grown
  together at the root. There is a faceted MASSIF at each seat now, drawn nearer
  than any spear in its own cluster, so it swallows every join at once. Faceted
  rather than domed by using `lnoise` for the normal perturbation: it is
  piecewise linear, so its gradient is constant inside a cell and kinks at the
  boundaries, which is a crystal face for free.

  For "dark, dank cavern vs. crystal grotto": the register was worth about 3:1
  and is now better than 20:1, because it was asked to make a difference in KIND.
  Three levers instead of one — the lamp gain cubes the register, the nomination
  window widens with it (one seam guttering at the bottom of the keyboard, every
  cluster alight at the top), and the pool's light on the ROCK rides it too. That
  last one matters most: brightening the crystals alone gives a lit seam in an
  equally lit passage.

- **sunshower — "a kind of marbling… not even rainbowy or iridescent at all",
  plus a redirection.** Both previous attempts had the wrong physics, which is
  why neither could be tuned into the right picture. An arc is one fixed piece of
  geometry and can only get brighter and dimmer. Caustic filaments coloured by
  distance across each ridge give each thread its own independent colour, and a
  set of independently coloured threads is veined stone — marbling, exactly as
  reported.

  Interference is neither. Its structure is CONTOURS OF A THICKNESS FIELD and its
  colour is a periodic function of that thickness, and the pictures the owner
  sent are all one or the other of two subjects: a fringe following a cloud's
  outline, and an oil film on standing water. The film in the sky is the cloud's
  own density field, so the colour belongs to the cloud you can see; it lives in
  a band around the cloud's edge threshold, because that is where the layer is
  thin and the droplets are one size. The puddles are in the ground plane's own
  perspective. The spectrum REPEATS (three cosines a third of a turn apart)
  rather than sweeping once, which is what nests the bands, and it is pastel by
  construction rather than by being faded.

### What the renders caught, after the seventh pass was written

The pattern held for a third time: the faults the stills found were all failures
of the FIX rather than of the diagnosis.

- **ice came out as snowflakes.** The growth machinery worked exactly as
  designed and drew the wrong object: six arms of comparable length about a
  common centre is a snowflake DIAGRAM — six-fold, mirror-symmetric, repeated
  across the pane on a visible grid. Window frost is none of those things.

  Four symmetries had to go. A seed sends out two to four arms rather than six
  (the empty sectors are where the clear glass comes from); their reaches are
  squared, so a long arm is an event rather than the rule; the arms wander
  instead of running straight, with the displacement applied to the across
  coordinate before anything else uses it so the branches ride the curve; and
  the side goes into the branch-length hash, so an arm's two flanks stop being
  mirror images. The crystals are also fewer and larger, with arms long enough
  to run into their neighbours — the crossing is most of what a frosted pane
  looks like, and it cannot happen while a crystal fits inside its own cell.

  Separately: every filament was 0.8 to 3.3 pixels wide. That draws frost as
  wire, and frost is a deposit.

- **the mote wind was pitched too high to be wind.** Warping a lattice shears
  whatever is drawn in it, and the shear across one mote is the field's gradient
  times the mote's size. At a vertical wavenumber of 2.2 the lane displacement
  changed by about a fifth of a cell over a single leaf — most of its own width —
  so every one would have arrived as a smeared parallelogram. Halving the
  wavenumbers costs nothing: a gust is broad, which is what a gust IS.

- **`mColumns` put twenty trunks across the far layer**, which is a picket fence.

- **the iridescence inherited its gains from the filament field it replaced.** A
  filament field is nearly all zero; a fringe following a cloud's edge is a broad
  band near one. The same numbers ran to better than 2.0 additive and would have
  blown the cloud edge to white — losing the colour, which is the whole motif.

- **and then it was pulled back too far.** The first render showed ten spectral
  orders across each fringe, which is a topographic map; that part was a real
  fault, and the cure (three orders) stands. But the same pass also made the
  ramp chalky on the theory that cloud iridescence is white light with a little
  taken out of it. The owner's correction: *"the colors I showed you in the pics
  were quite boldly rainbowy. we don't have to make it fully realistic either.
  the music can determine the presence and boldness."*

  They are right on both counts, and the second half is the better design. What
  the pastel version was reaching for is a VARIABLE, not a constant: the ramp
  runs at full swing and `sat` washes it toward white. Boldness is light rather
  than geometry, so it can ride a live feature with none of the retreat that
  would make a moving thing slide backwards — which makes presence and boldness
  two separate questions asked of the room, and gives the motif somewhere to go.
  A rainbow that is always at full strength is the fixed-arc problem wearing a
  different costume.

#### The iridescence took four cuts, and each one exposed the next

Worth listing in order, because none of the four faults was visible until the
one before it was fixed — which is the usual shape of getting a motif's PHYSICS
right and its scale wrong.

1. **Ten orders across the fringe** — a topographic map of thin concentric
   rings. Cut to three, which is where a band is wide enough to read as colour
   while still going round the spectrum more than once.
2. **Then it was made chalky**, on a realism argument the owner overruled: the
   photographs are boldly rainbowy and this is not a simulation. The right
   answer was to make what the pastel version was reaching for a VARIABLE — a
   saturation term the room drives, so quiet leaves a pale sheen and a working
   phrase turns it to the reference colour.
3. **Then it drew as a stroke around each cloud** rather than bands through it.
   Gating on coverage confines the colour to one ramp-width, and that ramp is
   narrow by design — being narrow is what gives a cloud an edge.
4. **Then, gated on the across-the-edge coordinate instead, it covered the whole
   sky.** A ramp-width is a distance in DENSITY, so where the field is flat it is
   hundreds of pixels wide; coverage saturates and cannot run away, the across
   coordinate cannot be stopped. The two sides of a fringe are different
   questions and need different gates: coverage outside (there is nothing to
   diffract in clear air), across inside (so the colour reaches into the cloud).

A fifth, smaller: the noise term outweighed the across term in the thickness, so
the bands followed the noise instead of running parallel to the cloud's edge —
which is precisely what makes iridescence read as belonging to the thing it is
on rather than being laid over it.

### What it cost

Measured against HEAD in the same container, `tools/perf.mjs`. The set is wider
than it was: cave and forest-blooming are each about 10% dearer for what they
gained, and ice — a completely new motif — went from 1.10x the cheapest mood to
1.22x.

Ice was briefly 1.60x, and the reason is worth keeping. The seeded construction
wants a 3x3 neighbourhood so crystals can overlap generously, and the early-outs
that appear to pay for it **do not**: a software rasteriser runs a dynamic loop
over a whole SIMD group, and lanes in neighbouring cells disagree about when to
leave, so the body executes under masking rather than being skipped. Nine
iterations means nine iterations. The four bracketing cells cost less than half
and bound the reach at 0.65 spacings — a cell outside that set has its centre at
least one spacing away and the jitter can carry its seed at most 0.35 back.

## Sixth pass — 2026-08-03, three notes from stills and limited testing

Three of the fifth pass's ten came back. Each one is a different way of getting
a fix wrong, and the three together are worth reading as a set: one stopped one
level short, one moved a gate outside the reachable range, and one answered a
complaint with a fence instead of with physics.

- **ice: "continuous lines with arrowheads all down them in a predictable
  pattern".** The frond had exactly two generations — a spine and one rank of
  barbs — and both were regular: fixed pitch, fixed lean, so every barb on every
  spine was a congruent triangle at even spacing. That is the arrowheads, named
  precisely. A dendrite is *recursive*; two levels is a fishbone.

  It has three generations now (trunk, branch, sub-branch), all built from the
  same sheared lattice — a branch leaving its parent at 60° travels 0.58 along
  for every 1 across, so `u - s * lean` finds the branch a point belongs to with
  one subtraction and no search, and the pair (distance out, distance to the
  centreline) is the child's own frame. The same eight lines therefore do all
  three levels. And the three regular things are fields now: **spacing** (the
  along-coordinate is warped by noise *before* it is floored, which changes how
  many branches there are rather than merely where they sit), **lean** (a slow
  function of position, so branch angle drifts along a trunk and differs between
  ferns — this is what kills the congruent arrowheads), and **length**
  (per-branch, so the fern's silhouette is ragged).

  Two things beyond the recursion. Nucleation now reaches *zero*, so a trunk is a
  run of separate ferns rather than a line crossing the pane — it was
  `0.55 + 0.45 * nuc`, which never bottoms out, so every trunk cleared any
  threshold that showed a barb. And there is **granular rime**: the references
  are half fine frozen fog with ferns standing out of it into clear glass, and
  drawing only the dendrites gives a diagram of frost rather than a pane of it.

  Paid for by skipping fronds whose habit region is not selected — most of the
  pane, for two of the three axes. About 1.3 evaluations per fragment instead of
  a flat 3.

- **night: the aurora will not appear at all.** The fifth pass moved the gate to
  `smoothstep(0.54, 0.76, centroid)` with no floor. The synthetic stand-in's
  centroid never leaves 0.24–0.60, so under `mock:auto` the aurora peaked at a
  fifth of itself for two seconds in every forty-eight — and the owner's read
  ("definitely not going to show up with real playing") is the same arithmetic
  applied to the instrument.

  The deeper fault is that a *single* gate cannot say what was asked for. "Night
  should be a night sky theme with the aurora as a bonus" is two statements —
  what is usually there, and what is occasionally there — and both attempts at
  one gate missed in opposite directions. There are two gates now: `glow`
  (0.30–0.46) lights the hem alone, a low green arc present through ordinary
  playing; `wake` (0.44–0.68) raises the curtain, climbing the sky with the
  folds, the rays and the violet crown. The body's ceiling rides `wake`, so at
  low register the aurora is confined to just above the horizon by geometry
  rather than by dimming.

- **desert: foreground-only ripples make the perspective *worse*.** The fifth
  pass fenced the ripples to the near dune because the pattern crossed layers.
  That was the wrong fix for the right complaint: the fault was never *which*
  layer carried the combing, it was that the pattern was drawn in SCREEN space —
  `sin(uv.x * 0.55 + uv.y * 2.5)`, a fixed angle at a fixed frequency, with no
  foreshortening anywhere in it. A flat pattern cannot belong to a receding
  surface, and a flat pattern that stops dead at a line is a sticker.

  `mRipples` works on a ground plane now. Each layer's own crest is the horizon
  for the face beneath it; `z = 1/(crestY - uv.y)` is the perspective divide, so
  even spacing on the sand crowds toward the crest and opens out at our feet, and
  `gx = uv.x * z` gives the lines a vanishing point. One ground pitch for all
  three layers, because ripples are the same size on the sand wherever the sand
  is — three pitches was the engine drawing the perspective by hand, badly.

  The layer fence is *gone*, and did not need replacing. A far range is only ever
  visible in a thin band above the nearer one's crest, so its `dep` is small, its
  `z` is large, and its ripples are beyond resolving — the anti-aliasing term
  (screen frequency `PITCH * z²` measured against the actual pixel pitch) removes
  them by itself. Distance takes the ribbing out because it is far away, not
  because a `step()` says so, and that one expression is the aliasing guard and
  the aerial perspective at once.

### What the renders caught, after the sixth pass was written

Three again, and the shape repeats: all three are failures of the fix rather
than of the diagnosis.

- **ice came out as bare scratches, twice over.** Two separate calibration
  faults, both invisible in the code and obvious in a still. The nucleation
  field varied over 2.4 q against a 2.1 q aperture, so a "fern" was longer than
  the picture and the gaps between ferns fell off the edge of the frame — the
  trunks read as continuous lines again, which is the complaint the recursion
  existed to answer. And the generations' heights were spread too far apart, so
  the growth front hit the floor of its ramp while the branches were a fifth of
  the way out. The rule, now written down twice because it has now been got
  wrong twice: **a child generation's ceiling sits JUST under its parent's
  floor, not well under it.** Growth was also too slow to photograph — a
  six-second render showed a mood that only becomes itself after a minute.
- **the desert's ripples became a contour map.** Anchoring the perspective on
  the exact silhouette makes the pattern's iso-lines offsets of that silhouette,
  so every ripple traced the dune's outline. A horizon is a straight line; the
  sand in front of it does not know what shape the crest above it is. The
  horizon is mostly the layer's mean height now, with a quarter of the local
  height kept so the plane still tilts with the dune.
- **the rime was coarse white salt.** 12 px grain through a hard growth front
  reads as debris on the lens. Rime is a fog of crystals too small to have
  shapes, so the grain has to sit at the edge of resolution.

`tools/field.mjs` gained `--centroid` in the same pass, and it should have had
it from the start: the register was pinned at 0.45, so every render of a
pitch-gated motif photographed one of the two things that motif does. Night's
two gates are only checkable with it (0.45 gives the hem arc, 0.78 the curtain).

## Fifth pass — 2026-08-03, ten notes watched on the owner's own machine

The rule held for a fifth time: every impression named a mechanism, and in no
case was the answer a constant. Recorded by what was actually wrong.

- **motes still slide backwards, and they always will.** `mEmbers` had
  `t * sp * (1.0 + drive * 0.9)` — a clock MULTIPLIED by a live feature, so the
  product shrinks when the room quietens and every spark on screen retreats down
  its own path. This is the fourth motif to ship with that exact line (snow,
  forest motes, embers, and `mFlame`'s advection and wave, both found while
  fixing the embers). The owner: *"This issue is one that's been addressed
  multiple times with other effects, but when there are new motes, it comes back
  again."* They are right that it will keep coming back: multiplying the clock
  is the obvious way to make a mote answer the music and it looks correct in a
  still. **The lawful form is a SUM of monotonic clocks — `t * a + flow * b`.**
  - Population has the same shape of fault. Lowering a spawn threshold by an
    onset envelope pops motes into existence in mid-air and pops them out again
    as it decays. It is also unnecessary: motes are born at a fixed spacing in
    the CLIMB, so a faster climb births more of them per second by itself.
- **fire's belly was below the frame.** The seat was dropped to -0.62 to hide
  the base and overshot to -0.78, and the aperture's floor is uv.y = -0.5
  whatever its aspect — so the whole lower third, which is where the drop shape
  is, was off screen and what showed was the straight run to the tip. -0.62
  keeps the base and its fade off frame and puts roughly seven eighths of the
  flame in shot.
- **volcano's lava had all its speed on `u_flow`,** whose rate swings fourteen
  times between silence and a loud room, so the flows crawled and surged with
  every phrase — the "jumping/stuttering". `u_flow` is the right clock for
  DIRECTION and the wrong one to hang all the SPEED on; the steady clock carries
  most of it now.
- **and it ran in sticks down a smooth cone,** because the only roughness
  available to it was the cone's PROFILE crag: one number per column, identical
  all the way down. A flow needs relief that varies with depth as well as
  across, or every channel bends the same way at every height. The fan also
  stretched each stream as it spread them; multiplying the frequency back up by
  the run keeps a stream its own width and lets new ones appear between —
  distributaries. And the fine generation now PINCHES the channel instead of
  shading it: forking is geometry, not brightness.
- **petals and leaves were one round blob in two palettes.** The claim that the
  compositor's per-mote tint was enough to make one motif serve both was true of
  the colour and false of everything the eye uses. New `leaf` param (0 blossom,
  1 leaves) drives shape, density AND flight — and it is a param rather than a
  second motif precisely because blooming and autumn are kin, so the passage
  between them morphs blossom into leaves in the open.
  - The flight is the half that reads from across a room. A petal is light and
    moved by its OWN flutter (incoherent, private phase); a leaf is heavy and
    moved by the AIR, so leaves share one gust and answer it at their own lags.
    Coherent motion, incoherently answered. Everything in lockstep is a curtain.
- **barren was monochrome and that was the whole of it.** New `bark` param gives
  the trunks their own material — bleached bone through pale dusty brown,
  varying trunk to trunk — and `mColumns` now hands out a cylinder shading term,
  because a mask alone is a flat cut-out however it is coloured.
- **frost could not be seen because the arithmetic said so.** `reach = 1 -
  exp(-grow * 0.08)` against a threshold starting ABOVE the field's ceiling is
  about a hundred seconds of loud playing before anything appears. No render
  harness run ever showed it either.
  - And it thinned back, because `front -= strike * 0.07` moves the growth front
    out on an onset and lets it return as the envelope decays. **Anything driven
    by an envelope directly has a retreat built into it.** The crackle is kept by
    putting the onset into the travel CLOCK instead (`flowAcc` takes a pulse
    term now), which cannot run backwards — and every mood that rides that clock
    gains a surge on a struck chord for free.
  - The barbs finally leave the spine. The old `frond` multiplied a barb field
    INTO a spine field, and a multiply can only modulate the value along the
    spine's own level set — a line of varying brightness, never a shoot standing
    off it. That is the "angular splinters" reading, twice. Barbs now have their
    own geometry, maxed rather than multiplied, and the returned value is a
    HEIGHT arranged so a descending threshold lights nuclei, runs along spines,
    then sprouts and extends barbs. Growth, not a fade-in.
- **the aurora was a fixed correction of a fixed fault.** It was hard to find
  once because it drew from the palette (a green veil over a blue sky is a
  bluer blue), and TWO cures were applied: its own colours, and a gate opened to
  a floor of 0.3 under a 0.32–0.58 ramp. The colour fix was the one that was
  needed. With a floor of 0.3 the curtain is simply on, and the synthetic
  stand-in's centroid never leaves 0.24–0.60 so the ramp is mostly cleared too.
  Gate is 0.54–0.76 with no floor: night is a night SKY with an aurora as a
  bonus. The stars carry the mood instead — two depths, real scintillation with
  a per-star modulation depth, temperature colour, spikes on the brightest.
- **the rainbow failed twice on the same axis.** The arc was one fixed circle,
  so gating could only change its brightness. The patches that replaced it fixed
  the fixedness and kept the primitive a BLOB — three soft ellipses and a lattice
  of round dots, which is "iridescent hail" and "rainbow confetti curtain". A
  circle has no direction, length or edge, so however it moves it cannot read as
  light. Light arrives in filaments: the crests of a domain-warped ridged field,
  with the spectrum running across each one by its signed distance from the fold.
  Drop glints are streaks sheared by the rain's own slant, not beads.
- **desert's ripples were never fenced by `skyMask`.** Giving the motif a
  per-layer patch was half the cure and read as none of it, because nothing kept
  the result off the sky above a dune's dip. Same omission `mStars` had. Now
  fenced, and — the owner's call — confined to the near range, so the boundary
  IS the front dune's crest line.
- **cave's crystals had no depth.** `if (v > best)` is a per-fragment max on
  BRIGHTNESS, so where two spears crossed the join followed the lighting and
  wandered as the lamp swung. Nearest-covering-spear wins now, whether or not it
  is the brightest, and that cut is the silhouette. (The druzy bed is kept OUT of
  the depth test: it is a faint halo over the whole cluster, and in the test a
  near cluster's invisible crust would black out a bright spear behind it.)
- **the flock cost three traces per fragment to draw one,** purely to obtain a
  forward difference for its gradient. `dFdx`/`dFdy` read the neighbouring
  fragments' already-computed values out of the quad instead. Measured: **1.53x
  the cheapest mood before, 1.13x after**, and it is no longer the dearest —
  cave is. Note the trap: a hardware derivative in non-uniform control flow reads
  a register the early-returning lane never wrote, so the early-out had to become
  an initialise-then-gate.

### What the renders caught, after the fifth pass was written

Seven faults that only appeared once each mood was photographed. Recorded
separately because they are all failures of the FIRST attempt at a fix rather
than of the thing being fixed, and that is a distinct and repeating shape.

- **fire**: raising the seat put the white heart in frame. `core` was reached
  over the bottom quarter of the flame's height, which was off screen before and
  became the bottom fifth of the PICTURE after — the belly arrived as a blown
  lump. A gesture keyed to a coordinate has to move when the coordinate does.
- **volcano**: the crater pool took the white-hot step across its whole surface
  and the mountain wore a pale band, which is icing on a cake. The heat rides
  the churn now, so a pool is orange with hotter cracks in it.
- **ice, twice**. Three habits maxed together draw three lattices over each
  other, which is a triangular NET, not frost — a slow field gives each region
  one habit. And barbs valued well under spines leave the growth front hitting
  the floor of its ramp while the barbs are a sixth of the way out, which draws
  bare spines: straight scratches on glass. A barb's value has to sit JUST under
  its spine's.
- **sunshower**: the filament is brightest at its centre and the spectrum was
  sampled by distance FROM that centre, so the brightest part of every filament
  was the middle of the spectrum and the whole web came out green — glowing
  lichen over the sky. Split light is white where it is dense and coloured at
  its edges. The patch gate then had to be tuned twice, because the first
  correction took nearly all of it away.
- **cave**: with the depth test in place the nearest spear owns its pixels
  outright, so an ambient of 0.02 on an unlit face means the face is simply
  absent — clusters read as folded paper, bright rims around holes. Depth
  ordering needs something to order: the prism wants a diffuse body.
- **the leaves**: the tumble multiplies the aspect, so a 2.9:1 leaf at a tumble
  floor of 0.30 spends much of its time near ten to one. That is a needle.
- **barren**: the bark colour was invisible because `mColumns` puts about four
  masses across the aperture — a "trunk" a third of the frame wide. It passes as
  a dim vertical mass in a wood full of mist and reads as a WALL the moment
  anything picks it out in its own colour. The frequency rides `bark` now, so
  only the mood whose subject is the trunks gets more of them.

## Fourth pass — 2026-08-03, three notes from stills

- **volcano's crater** — "a big scoop out of it… which makes perfect sense IF
  we fill it". The scoop *was sky*: lowering the profile across the crater does
  not carve a basin, because the silhouette is filled below its own line, so
  everything the dip removes becomes sky and no lava painted below the dip can
  reach it. Deepening it (the first attempt) made the bite bigger. A crater
  full to the brim has almost no notch in its skyline — the profile is nearly
  flat now and what says "crater" is that the summit is molten. The pool
  overflows at the lip, which is what joins it to the rivulets.
  - Two bugs on the way: the overflow keyed on descent-from-the-rim, which is
    negative everywhere in the sky above the summit, so it painted a column of
    lava straight up into the night; and the sky fence was applied before the
    pool was added, so it fenced only the flows.
- **fire's profile** — `(1-h)(1-0.55h)` falls away from the seat from the first
  step, so the widest part of the flame is the part below the frame and
  everything visible is the straight run to the tip: a cone. Two exponents
  blended by height give a belly low and a point high. They trade off — at
  0.70/2.20 the belly arrived but the tip pinched out four fifths of the way up
  and the fire came out stubby. A drop is full at the bottom *and* reaches.
- **the moon** — pushed out to the corner to keep it clear of the flock, it
  landed where the aperture is narrowest and was barely in shot. Moved down and
  left: still clear of the body's usual seat, still crossed now and then, and
  actually visible through the eye.
- **mSmoke's source could not be a constant.** Anchored to suit fire, volcano's
  plume was drawn down the cone's FACE as a dark rectangular block on the rock.
  Two moods, two fires, two completely different heights — the caller supplies
  it now. The `js/` shared-code hazard applies to motifs, not just files.

## Third pass — 2026-08-03, nine notes watched in motion

The owner's rule held again: every "it looks like…" named a mechanism, and in
no case was the answer a constant. Recorded by what was actually wrong, because
the faults keep rhyming.

- **volcano** — was `ridge` (three parallax ranges) under mountain's *daylight*
  sky, with lava sampled as `uv.y - t*0.1`: a coordinate that carries a feature
  toward larger uv.y as the clock advances, so the streams ran uphill. New
  `cone` motif: one truncated cone, straight flanks, cratered summit, night sky
  lit from the vent. Flows are drawn in the cone's frame, so downhill is a
  property of the coordinate rather than a sign to keep getting right.
  - Three sub-faults found only by rendering: cooling keyed on
    depth-below-the-local-skyline lit the **outline** (on a steep flank, the
    local skyline *is* the silhouette edge); the crag term derived as
    `down - descent` carried the cone's whole gross shape and went degenerate
    along the edge; and the channel field varied faster down-slope than across
    it, so at a narrowing threshold its crests closed into **rings**. Ridged
    crests run where the field varies least — the rule `frond()` already works
    by.
- **ice** — `reach = 0.5 + 0.5 * sin(grow…)`. A sine: crazed over, then
  uncrazed. That is the whole of "blotchy, and the blotches thicken and
  shrink", and it also meant the mood never started plain. Frost accretes now.
  **This reverses the old "silence lets it clear" intent, deliberately.**
- **forest motes** — three faults at once: fall was `t * (0.7 + drive*0.7)`, a
  clock *multiplied* by loudness (the snow's fault exactly — it slides back up
  when the room quietens); each mote was drawn from `fract()` of a single cell,
  so anything crossing a boundary was cut, which is the seams; and the sway was
  `sin(y)`, a function of height alone, so a layer swung in unison.
- **barren** — `petals: 0.12` never reaches zero. Barren is bare.
- **transitions** — one constant served two changes. Kin: nothing closes, slow
  is the point. Cut: the crossfade is to be *hidden*, and 71% of it played with
  the eye fully open, which never fully shut anyway (`depth: 0.94`).
- **sunshower** — was a top-level mood because families are derived from names
  and a name encodes a tree. It has two parents; `SHARED_CHILDREN` says so.
- **the rainbow** — an arc is one circle at one centre: gating it can only
  change its brightness, never make it play. Replaced by drifting patches of
  separated spectrum. Dispersion *across* each patch is what reads as
  refraction rather than coloured fog.
- **desert ripples** — a pure function of `uv`, so one comb across all three
  dune layers. Same fault the crag map had on mountain, same cure.
- **stars** — never fenced by `skyMask`, so they lay on the sand. `night` has
  no silhouette, which is why it was never noticed.
- **aurora** — hem, folds and rays all scrolled along x at 0.05/0.08/0.07, and
  two sampled `fbm` with a *constant* second argument. A fixed shape sliding
  rigidly. Rates now differ, folds run against the hem, and every field drifts
  in its second axis so the structure reforms instead of being carried.

## Second pass — the owner's shape notes, and the reference backlog

Judged against screenshots this time (`npm run shots`), not reasoning.

- **mock instrument** — the HUD gains two sliders and a strike. An animated
  stand-in cannot answer "is this too subtle" because you cannot aim it; the
  register slider IS the centroid, so a motif gated on pitch can now be walked
  through its whole range deliberately. `m` toggles, `s` strikes.
- **aurora** — was invisible for three compounding reasons: a wake floor of
  0.1, a hem crushed into the top sliver of the aperture, and no internal
  structure at all. Now has rays, a burning hem, a low anchor. Night's `base`
  drops 0.66 → 0.3 so there is a dark sky for it to be bright against.
- **mountain** — silhouette made opaque (it mixed at 0.88, which was the
  "glassy edges you can see the drifts through"); the sky is painted as its own
  material, pale at the horizon and cold blue above; snow moved from the crest
  band to an altitude line, since the crest band is a constant offset and drew
  a uniform white stroke along every ridge.
- **cave** — one lamp for rock and quartz alike (two lights was most of "pasted
  together"); spears drawn in screen space, since a straight line in the
  tunnel's polar frame is a spiral on screen; clusters lean out of their own
  wall; a druzy bed at the contact; light pools on the rock AROUND the
  crystals; dark by default; drips removed.
- **frost** — spines with barbs multiplied into them, three generations deep,
  on `lnoise`. The old version maxed three smooth stretched ridges, which is
  why it read as "water moving beneath the ice" — streaks with nothing hanging
  off them.
- **ocean / night palettes**, **forest motes and wisp zigzag** — as specced in
  the first pass.
- **sub-moods** — one, `sunshower`, kin to BOTH rain and sunshine rather than
  a child of either. A first cut built it out of forest (which owned shafts and
  canopy already) and split the rainbow into a second sub-mood; both were
  wrong. Building it from the parts made it green — a wood in the rain rather
  than weather lit from behind — and the bow belongs inside the sunshower, not
  beside it. There are no trees in it now; it is deep blue cloud, gold backlit
  rain, and sun between them.

  **Kinship** (`themes.js`) governs transitions: moving between kin morphs in
  the open and keeps the travel clock running, so rain reaches sunshine through
  sunshower without the lid ever dropping. Unrelated moods still close the eye,
  because that is a different place and the cut wants hiding.

  The **rainbow** is a new motif carrying its own spectrum. Deliberately not
  meteorological: an earlier cut gated it on a storm passing, which made it a
  rare solemn event. It plays instead — breathing, flinching on onsets, and
  breaking into drifting fragments, so it is sometimes a full arc and sometimes
  two suggestions of one.

**Perf:** cave is now 1.54× the cheapest mood (was 1.31×) — the light pool is
evaluated for every cluster before the bounding early-out, by necessity, or the
halo would be clipped to the crystal's own extent. Measured under software
rendering, so treat it as a ceiling rather than a real frame cost.

**Guard added:** the validator now rejects a backtick inside the shader source.
Two separate debugging rounds were lost to one in a comment ending the template
literal; it is a total, silent failure with a misleading error.

- **weather follower** — a second loudness clock at tens of seconds, rising
  over ~6s and falling over ~20s, since weather gathers faster than it
  disperses. It lives in the viz-side motion smoother rather than in
  `features.js`, so it needed one uniform and no change to extraction. Rain's
  rainfall density and sunshine's cloud coverage both ride it; brightness still
  answers the phrase. Sunshine's coverage range went from 0.1 to 0.44, which is
  the difference between a deck that drifts and one that opens and closes.

  It reads the **auto-gained** rms, so it tracks dynamics relative to recent
  playing rather than absolutely. That is deliberate: an absolute mapping needs
  the centroid-scale calibration first, and a follower keyed on a room nobody
  has measured would be confidently wrong. Relative still gives the
  drizzle-to-storm arc within a performance.

Still open: centroid rescale (awaiting the mid-register and bass readings —
the top of the piano measured 2500 Hz, which is one endpoint of three).

**First look checklist:** mountain silhouette straight-flanked? cave crystals
straight? bolts jagged with attached forks? frost dominant when grown? foam
white? Every mood — `?mock=live&theme=<name>` cycles them without sound.

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

### The ridgeline profile — diagnosed and changed (unverified)

The owner reported mountains still looking wrong after the relief pass, and drew
the difference: **"No"** was a near-flat baseline with thin needles standing on
it; **"Yes"** was a continuous rise and fall of broad peaks and deep valleys.

Cause found in `mRidge`'s third octave. The line multiplied the profile by
`0.7 + 0.52 * fine * fine`, and squaring a ridged fold — which is roughly
uniform over 0..1 — piles its distribution up near zero. Measured over the
range, that multiplier sat **below 0.8 across 44% of the ridgeline**, with a
median of 0.83, reaching its top only in the last decile. That is not a shoulder
being broken up; it is a profile pinned to a floor with occasional spikes let
through, which is the "No" drawing precisely.

Changed to `0.64 + 0.48 * fine` — unsquared, so the octave varies the shoulders
instead of flattening them and the big triangular fold underneath survives as
the shape. Constants rebalanced to hold the **mean multiplier where it was**
(0.873 → 0.880), because the standing instruction has never been about height:
*"adjust the lower end, don't exaggerate the upper"*. Below 0.8× drops from 44%
to 19%; the median rises to 0.96; the top decile comes *down* slightly.

**Not yet seen running.** If it still reads as spiky, the next knob is the
additive `fine * fine * 0.07` on the same line — narrow by the same mechanism,
already reduced once from 0.16, and left alone here so this change stays
attributable. If it now reads as too smooth or too rolling, raise 0.48 before
touching anything else.

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

### First real measurement — the scale is calibrated too high

With the HUD readout in place, the owner reported: *"The very highest pitch on
the piano gets to about 2500."*

On the current scale that is **0.76**:

```
log2(2500 / 60) / log2(8000 / 60) = 5.381 / 7.059 = 0.762
```

So `CENTROID_HI_HZ = 8000` is roughly an octave and a half above anything the
instrument can actually drive the centroid to. **The top quarter of the range is
unreachable**, and every consumer of `centroid` is working inside the bottom
three-quarters, biased low — the aurora's `wake`, the ray fan's lean, `mFacets`,
the storm tint, and every theme's `shiftCentroid`.

For the aurora specifically: full brightness needs 0.62, which is **1246 Hz** —
near the last octave of the keyboard. That is why ordinary playing leaves the
curtain dim and stuck at green, and it corroborates the owner's original report
from memory.

**Still needed before recalibrating:** a mid-register reading and a bass
reading. One endpoint does not define a scale, and `CENTROID_LO_HZ` is as
untested as the top. With three points the bounds can be set to span what the
instrument genuinely occupies, and only then should the aurora's `wake`
thresholds be re-sited — against measurements, not by feel.

Do not move `wake` first. Re-siting a gate to compensate for a mis-scaled input
bakes the miscalibration into a second place.

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

**Reference.** Three images, all of the same subject: **shafts of light coming
down through a canopy.** (1) dense jungle, hanging vines, hard god-rays with
motes suspended in them. (2) lush green jungle, sun bursting through at the top,
shafts radiating into ferns. (3) temperate wood, warm gold shafts angled through
mist, dark trunks in silhouette.

A separate image was supplied for wisps, with the owner's caveat:

> *"It is not accurate to the feel or color scheme of the forest mood itself, but
> you might get an idea of the zigzagging orbs I'm trying to conjure up."*

That one is **motion reference only** — not colour, not atmosphere. Note also
that wisps do not appear in the three forest references at all; they are
forest's own invention, and their absence here is not an argument against them.

### Already right — and forest carries the most machinery of any mood

- **Canopy breaks the beams properly.** Under `canopy: 0.95`, shafts are cut by
  two scales sampled in the travel frame, one lagging the other, so the pattern
  *reorganises* rather than sliding past as a rigid stencil (viz.js:174–177).
  That is what images 1 and 3 are doing at their edges.
- **The depth cue is built, and is two-part.** `mColumns` runs two stands at
  different distances passing at different rates — *"parallax is what makes it a
  walk among the trees rather than a texture scrolling by"* — while the rays stay
  anchored to the sky as the other half (viz.js:183–188). Trunk edges are hard on
  purpose: *"a trunk is an object in front of the mist"*. Image 1's hanging vines
  and image 3's silhouetted trunks are both this motif.
- **Forest is the mood the sunshower is made of** — the donor for
  `rain-sunshower`, which is why that sub-mood comes out data-only (rain §2).
- **Forest is where shared code gets tested honestly.** `mRays` carries an `atan`
  seam fix noting *"Sunshine's own rays mostly disguised it; forest's fainter
  ones did not, which is where it was spotted"* (viz.js:148–151). Its fainter
  light exposes what sunshine's brightness hides — check forest after touching
  anything shared.

### What the references argue for

**1. The shafts are the subject here, and forest's are set as an accent.**
Forest runs `rays: 0.62` against sunshine's `0.95`. Fainter is a deliberate
choice — a forest floor is dim — and it is also what makes forest useful as the
honest test of shared ray code, so this is a real trade rather than a free win.
But all three references make the beams the hero of the frame, not a highlight in
it. Worth raising `rays` and re-checking the seam behaviour afterwards.

**2. The motes in the beams are missing, and they are why the beams read as
volumetric.** Forest has `glint: 0` — no ambient glints at all, where cave runs
0.3 and ice 0.35. Images 1 and 3 both show particles suspended *in* the light,
and that suspension is most of what makes a shaft look like a solid volume of
air rather than a bright stripe.

Scattering glints across the whole frame is **not** the right fix. What the
references show is motes *inside the shafts*, so the term wants gating by the ray
field — bright where `rays` is strong, absent elsewhere. That is a small change
and it is the highest-value thing these three images ask for.

**Watch the collision with wisps.** The engine deliberately separates the two:
*"A glint is a surface catching light for an instant; a wisp is a small body that
drifts, hangs, and fades"* (viz.js:840–842). Forest would be the only mood
running both. That is probably fine — motes are small, fast and inside the
beams; wisps are large, slow and between the trunks — but it is the one thing to
look at critically once both are on screen, since the wisp motif was added
specifically to fix a green-cloud problem that more small lights could revive.

**3. The warm light in image 3 is already reachable.** Forest's palette tops out
at `#eef7d4`, a pale warm cream, so the golden shafts of the temperate reference
are available without a palette change. Images 1 and 2 are greener and whiter;
the palette spans both. Nothing to do.

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

**Data** (`portal/assets/themes/forest/theme.json`)
- `motifs.rays`: `0.62` → higher, so the shafts are the subject the references
  make them. Re-check the `atan` seam afterwards; forest is where it shows.
- Palette unchanged — `#eef7d4` already carries image 3's warm gold.
- Wisp weight, rarity and colour unchanged; all three are right.

**Engine** (`portal/js/viz.js`)
1. **Motes in the shafts** — a glint-like term gated by the ray field, so
   particles hang inside the beams and nowhere else. Highest-value item from the
   three references, and what makes a shaft read as a volume of air.
2. **Wisp path** — add a per-wisp triangle-wave term to the orbit so it has
   corners; keep the ellipse underneath as the wander.
3. Only if that reads as a wobble: hashed per-segment headings for dart-and-hold.
4. Optional, afterwards: let treble drive dart rate as well as brightness.

Judge (1) and (2) together once both are in — forest would be the only mood
running motes and wisps at once, and the wisp motif exists to fix a green-cloud
failure that more small lights could bring back.

Forest is the mood where faint shared changes show up first, so check sunshine
after touching anything here — and vice versa, since both run `mRays`.

## ice

**Reference.** Five images. (1) blue ice in polygonal cells with white seams and
trapped bubbles. (2) a radial impact fracture. (3) fine white branching cracks
webbed over dark ice. (4) and (5) dendritic frost ferns on glass — feathery,
branching, granular.

Owner's direction: *"3, 4, and 5 give a good idea of what I'm trying to gesture
at with the frost layer."*

### The shape is already exactly this

`mFrost` (viz.js:509–536) is not approximate about it. It samples noise stretched
hard along **three fixed axes 60° apart** and takes the strongest, because
stretched noise gives needles along its long axis and three needle directions
read as ice's hexagonal habit — six-fold anisotropy with no trig. Then:

> *"A second, finer generation branching off the first — dendrites have
> dendrites, and it is the branching that says frost rather than cracks."*
> (viz.js:517–518)

The threshold is deliberately tight because *"frost has hard edges, and a soft one
is what made this read as foam"*, and the growth front rides high on purpose —
a max of three ridged noises sits near 1 almost everywhere, so *"only the top
slice is filaments"*, otherwise the ice reads as a white sheet with ink blots.

It also already grows the way the references imply: patches run on their own
phase so the field crazes here while it clears there, and an onset shoves every
front outward at once — the crackle (viz.js:522–524).

**Conceptually nothing is missing.** Do not redesign this motif.

### The gap is presence, not shape

Frost has no composite line of its own. It borrows snow's:

```
snow = max(snow, frost * 0.45);   // viz.js:1310
```

and snow is then blended at `0.88` (viz.js:1347). So frost's maximum reach is
about **0.45 × 0.88 ≈ 0.40** — it can never be more than roughly forty percent of
the way to the pale step, however hard it grows.

In images 4 and 5 the frost is *the subject*: near-white, dominant, covering most
of the frame. The current ceiling makes that unreachable. This is the same class
of problem as ocean's mint foam — the shape is right and the compositor caps how
present it can be — and it is the one lever worth pulling first.

Two ways, in order of preference:
1. **Give frost its own composite line** rather than routing it through snow.
   Snow's blend was tuned for lying snow on mountain rock, which is a different
   material at a different coverage; frost has been inheriting a ceiling that was
   never chosen for it.
2. **Or simply raise the 0.45**, which is one number and quick to judge, but
   leaves frost coupled to a channel it does not really belong to.

**Then, and only then, revisit the fine generation.** `v * 0.84 + fine * fine * 0.22`
weights the sub-dendrites at roughly a quarter of the primary needles, while
images 4 and 5 are mostly fine structure. Raise `fine`'s share *after* presence is
fixed — at the current ceiling it is impossible to judge whether the branching is
too sparse or merely too faint.

### Image 3 is cracks, not frost — and that is fine

Physically image 3 is a fracture web, and the motif's own comment draws exactly
that line: branching is *"what says frost rather than cracks"*. The owner
nonetheless grouped it with the two frost images, so the shared quality is what
counts, and it is consistent across all three: **fine bright branching filaments
over a dark ground, at high contrast.**

Recorded so a later session does not "correct" the grouping. The contrast is the
point — all three references keep substantial dark area, and the filaments read
because of it. That is another argument for fixing presence before anything else:
raising coverage without raising contrast would move ice away from these images,
not toward them.

### Ice owns this machinery

`facets` is above zero **only** in ice, and the frost block sits inside
`if (W_facets > 0.0)`. So the frost composite, its ceiling and the fine-generation
weight are all ice-private in practice — nothing here can disturb another mood,
even though `snow` itself is shared with mountain.

### Feel

| | |
|---|---|
| **Quiet is** | A held field, frost crazing over in one place while it clears in another, on its own slow phase. |
| **The music is** | Every growth front shoved outward at once on an onset — the crackle — and struck shards going toward white in a single step, *"lightning inside the ice, not a warmer shade of the ramp"* (viz.js:1350–1351). |

### Changes

**Data** (`portal/assets/themes/ice/theme.json`) — none proposed. The palette
already runs `#04101c` to `#f2fbff`, so the dark ground and the near-white
filament the references need are both available.

**Engine** (`portal/js/viz.js`) — ice-private
1. Give frost its own composite line instead of borrowing snow's, or raise the
   `0.45`. Presence first; everything else is unjudgeable until this is done.
2. Afterwards, reconsider `fine * fine * 0.22` against images 4 and 5.
3. Do not touch the axes, the threshold tightness, or the high front — each fixes
   a named past failure (foam, white sheet with ink blots).


---

# New moods — 2026-08-02

Six moods and six motifs, from the owner's brief. None yet judged by their eye;
all judged against screenshots.

## fire

*"not raging wildfire… small crackling fire in the dark with rising embers and
smoke. sacred and intimate."*

Sacred and intimate is a statement about **scale** before it is one about
colour, so the constraint that matters is how little of the frame it takes.
`base: 0.16` — the shared field contributes almost nothing and what lights the
surroundings is the fire itself. Three new motifs: `flame` advects noise
downward through a tapering lobe (which is what makes it climb) and erodes its
own edge with the same field at a second scale, so the tip tears into tongues
while the seat stays whole; `embers` are three sparse layers whose lanes bend
as they rise and which die as they climb; `smoke` widens, thins and sways.
Loudness feeds the flame's reach, an onset makes it leap and throws a burst of
sparks. A few stars — a fire in the dark is usually outdoors, and the sky being
there is what makes the dark read as large rather than enclosed.

## volcano

Its own mood, per the owner, not a child of mountain or fire: it shares a
silhouette with one and a palette with the other and resembles neither.
`lava` is a ridged field stretched vertically and scrolled down, so it runs in
channels rather than pooling, with a finer generation splitting them into
rivulets. The crust between stays dark — what you see is glow coming *up*
through cracks. **Masked to the rock** where a silhouette exists, or it pools
in a band across the bottom of the frame with the mountain floating above it.
An onset drops the threshold: the gush is the eruption.

## desert / night-desert

**Dunes are ridgelines that are not angular** — but the noise was only half of
it. `angular` first scaled the `lnoise` blend alone, which softened the flanks
and left every crest a sharp point: the owner's "too peaky rather than the
dunes I was imagining". The fold itself was the culprit. `1 - abs(2n-1)` has a
crease at its apex however smooth the input is; squaring instead of taking the
modulus makes the same fold a parabola, a crest with a continuous tangent
through the top, which is what a wind-built pile of sand has and rock does not.
`angular` now chooses between the two folds, drops the relief, and mutes the
subsidiary spurs — so one silhouette is either a range or a dune field, and at
`angular: 1` the expression reduces exactly to what mountain had before. Blowing sand off a crest is spindrift, which is why `snow` is on in a
desert: that motif means "what the wind tears off the top" and never cared what
the material was. `ripples` combs the near sand with ridges that bend with the
ground rather than the frame.

`night-desert` is not a recolour: stars carry the sky, the ripples take a hard
cold specular instead of a diffuse glare, and the field sits far lower.

## forest — blooming / autumn / barren

One new motif, `petals`, serves two of them. Each petal tumbles — its width
pulses as it turns edge-on and back, which is the entire difference between a
petal and a raindrop — and carries a per-petal hash that the compositor spends
on the palette's upper steps. So **blossom and dead leaves are the same motif**,
and which one it is depends only on what colours the theme puts up there.

`barren` needed no motif at all. Dropping the canopy changes how the light
works by itself: the shafts arrive unbroken and weak instead of dappled and
shifting, and the trunks carry the frame alone.

All three are kin to `forest` **and to each other** — autumn to barren is the
most natural passage in the set, and a season turning should not shut the eye.

## Perf

Cave remains dearest at 1.51× the cheapest mood; everything else is within
1.33×. Absolute frame times roughly doubled across the board with the six new
motifs compiled in, which is a software-rendering artifact of a larger shader
rather than per-mood cost — the branches are uniform-gated. Worth re-checking
on real hardware.

## Known rough edges

- The blooming reference asks for blossoms *bursting*, not only falling.
  Petals approximates this with an onset-driven burst; actual opening flowers
  would be a second motif.
- Volcano's lava reads best on the lower slope; a summit vent would want its
  own term.

## Eighth pass — 2026-08-03, extended testing on the owner's machine

Fourteen notes. The through-line this time is **motion read as the wrong
object**: in four separate moods the geometry was defensible and the way it
moved named something else entirely. A hue ramp at constant luminance is a
thermal camera. A body frame scaled by an onset is a zoom lens. A lattice warped
by a shared field is a sheet of glass with leaves painted on it. A cone with a
flat top is a mesa. None of those were tuning errors, and none of them would
have been found by looking at a still with the sound off.

### Forest

- **Blossom appeared when crossfading autumn to barren, in both directions.**
  Whole flowers were gated on `step(leaf, 0.35)`, and autumn sets `leaf = 1`
  while barren leaves it at 0 — so the crossfade between two moods that have no
  flowers in them swept the gate on the way past, while `petals` was still
  fading out. **A gate fires on the PATH between two themes, not on their
  endpoints.** Now on its own `flower` parameter, which is 0 at both ends of
  every edge in the family.
- **"They move more or less as a unit, like they're attached to a transparent
  plane. (They probably are.)"** They were. The wind was a function of `uv`
  warping the lattice, so every mote in a region got the same push at the same
  instant, and warping the sheet can never move one leaf differently from its
  neighbour. The shared field is halved and each mote gained its own orbit —
  sine against cosine, in quadrature, so it traces a loop rather than shuttling
  along a diagonal — with hashed phase and rates. The spin and the edge-on
  squash now ride that orbit's phase, because attitude and path are one motion.
- **The full flowers came out cartoonish.** The owner's call, and right: a
  five-lobed rosette fifteen pixels across is a symbol of a flower however well
  it moves, and a symbol among abstractions breaks the spell. `flower: 0`
  everywhere; the shape stays in the engine behind the parameter.
- **"The coppery light is kind of a lazy way to convey the colors of autumn."**
  Also right, and the reason it is lazy is that it is false: an October wood is
  lit by a thin grey-green daylight and all the copper is hanging on a branch.
  The palette is now the light — cool, olive, low — and the leaves carry their
  own oxblood-to-gold ramp off the palette entirely, the way fire and the aurora
  already do.
- **The wisps had gone missing.** Not faint — absent. Counting the gate:
  `step(1.0 - 0.2 * w, hash)` lit TWO cells of the thirty-five on screen in
  forest and ONE in blooming, and each also breathes down to a fifth of its
  brightness and drifts out of frame. Density to 0.30, breath floor up.

### Night

- **"Those straight lines aren't so straight anymore. Something is warping
  them."** The ray coordinate was displaced by two sinusoids OF HEIGHT,
  amplitude 0.13 against a ray spacing of 1/9.5 — so every ray was pushed
  sideways by more than a whole ray-width along its own length, a full cycle
  inside the curtain. **A shear linear in height maps straight lines to straight
  lines; a shear sinusoidal in height bends every one into an S.** The lean is
  linear now and the HEM does the snaking.

### Cave

- **"They illuminate so fast that there's always a sense they appear and
  disappear."** They did appear and disappear: outside its window a cluster was
  not dim, it was `continue`d — the geometry blinked in with the light. A
  crystal is a solid; it is there in the dark. `pres = 0.16 + 0.84 * env` keeps
  a silhouette standing and `env` now scales the lighting only.
- **"The bases look like another crystal spear pointed straight at the
  camera."** A compact convex lump at the root of a spray of prisms reads as one
  more prism. The massif gained a sparse spiky term on its radius and is
  flattened against the wall — three times wider than deep, because a bed
  spreads over the surface it nucleated on.
- **"Register is not affecting crystal illumination in any obvious way."** This
  one was arithmetic, not taste — see the centroid note below.
- Sparkles: hashed segments along each prism, re-rolled twice a second, with the
  threshold dropping as the register rises. "One face lights up dimly... and
  then with the high register, lots of sparkles."

### The centroid, at last

The rescale that has been open for three passes, and it was blocking four gates
at once. The scale was 60–8000 Hz — seven octaves — and a piano's spectral
centroid lives in a small part of it, because the fundamental dominates and the
fundamentals stop at 4186 Hz. Measured: low playing landed near 0.25, and the
brightest playing anyone could manage reached about 0.72. **The top third of the
scale was unreachable by construction**, so `pitch³` in the cave lamp delivered
a third of its range at full effort. Now 120–4000 Hz.

### Sunshower

- **"It makes it look like we're very high up above the world... I'm thinking
  fluffier, less stratospheric."** The perspective divide was `1/(above + 0.16)`
  — better than six to one over the height of the sky, which is the view from an
  aeroplane, and it stretched everything flat and stacked it toward the horizon.
  0.40 gives about three to one. Plus a domain warp for cauliflower edges and a
  coverage band half as wide, because a fluffy cloud has an EDGE.
- **"A sort of 'thermal vision' look... I want pretty, striking rainbow light,
  not spy goggles."** The tell was never the boldness — they asked for bold
  twice. It is that **a cosine hue wheel at constant saturation and constant
  luminance is the definition of a false-colour palette**: the picture carries
  its information purely as hue, which is how a thermal camera draws and how
  nothing in the sky looks. Saturation now varies along the sweep (pale-vivid-
  pale, so the cloud shows through), the ramp is lifted toward white and scaled
  by its own peak channel so bands differ in brightness, and the orders came
  down from about three sweeps to one. The cloud under it was also barely lit,
  which is the other half: **a shape made entirely of hue is a thermal blob by
  construction**, so the deck got its own light to be bands ON.
- The iridescent puddles were drawn against `gY = -0.24` while main and the
  drips had moved to `-0.38` — a second copy of a constant that did not get
  updated. That put a band of iridescent patches hanging in the AIR between the
  skyline and the ground, which is most of what the owner saw as clouds sitting
  on the ground. They were not clouds.

### Fire

- **"There is a definite seam on the flame."** Nothing was drawing a line. The
  silhouette was `smoothstep(wid, .., abs(p.x - lean))` — exactly symmetric
  about the axis — and the erosion field over it was near-symmetric too, so
  everything on the left happened on the right at the same height. **The seam is
  where the two mirrored halves meet.** Two independent tear functions now.
- **"The darkness 'bites chunks' out of the flame rather than the flame dancing
  in the darkness."** Precisely what multiplying a body by a thresholded noise
  field does: it punches holes THROUGH the interior. Fire tears at its edges and
  stays lit in the middle, so the noise moves the boundary and the inside is
  left alone (it varies in brightness now, not in existence).

### Volcano

- **"It shouldn't just look like a chunk is off the top."** Third time this has
  been raised, and the previous two fixes both went after the crater when the
  fault was the SILHOUETTE: the profile held its summit height flat across the
  whole of `|x| < 0.28`, a plateau more than a quarter of the frame wide. That
  is a mesa, and a mesa with a dark middle reads as a bite whatever is painted
  in it. It comes to a point now, per the owner's own steer — "Arenal here has a
  bit more of a peak" — and the flanks were pulled in from 1.02 to 0.86 so the
  mountain has sky either side of it ("too much receding").
- **"It's as if the crags are oozing down along with the lava."** The cone was
  filled with a flat 0.04 and had no texture at all, so the only structure
  anywhere on it was the lava, which scrolls — and the dark shapes BETWEEN the
  streams were not rock, they were the gaps between moving things. **With no
  fixed feature on the mountain the eye had nothing to hold and read the whole
  surface as flowing.** Static lit relief on the rock fixes it.
- **"It just doesn't have that 'ooh, aah!' factor."** A dozen channels rim to
  base is a curtain of orange and reads as melting. Their own specification:
  "even in photos where there are just a few, it's breathtaking." Channel
  frequency roughly halved, plus the glow over the vent that every one of the
  reference photographs has and this had none.

### Desert and flock

- **"It needs to look hotter."** Nothing in it was hot: warm sand under a warm
  sky is a beach in April. Heat is a property of the AIR — the far ground swims
  and the horizon bleaches — and neither can be said with a palette. Also the
  near dune was rendered nearly black by an aerial-perspective rule that is
  right for a mountain range at nightfall and backwards for sunlit sand.
- **"Sometimes it does seem to shrink and throb."** The clench scaled the whole
  body frame by up to 34% on an onset, and the frame carries the outline AND the
  grain — so every beat resized the flock. **That is a camera moving toward the
  birds, and a zoom is the one motion in this mood with no bird in it.** The
  startle moved into density: the silhouette holds and the mass packs and darkens.

