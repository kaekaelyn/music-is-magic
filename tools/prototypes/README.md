# prototypes

Exploratory. **Nothing in here is part of either build.** `portal/index.html`
and `portal/broadcast.html` do not load any of it, and `npm test` does not
check it. It lives in the repo because a browser-viewable prototype is how the
owner judges a look before it is worth writing into `portal/js/viz.js`, and
because the session scratchpad it was built in does not survive the session.

## murmuration.html

A murmuration rendered as a **field**, with no individual birds. Standalone —
one HTML file, no build, no dependencies. Open it directly, or publish it as an
Artifact for phone viewing (see HANDOFF.md for the live URL and how to update
it in place rather than minting a new one).

The question it exists to answer has not been answered yet: whether this wants
to be its own mood (dusk sky, one flock, nothing else) or a motif that rides
over the existing ones. Do not merge it into `portal/` without asking.

### How it works, in one paragraph

The flock is a level set of a noise field. Each pixel is traced **backwards
through time** along a flow of vortices and crossed shear waves, and the noise
is read at the material coordinate that comes back — so deformation
*compounds*, which is what folds a body over itself rather than wobbling it.
Compounding strain shreds any texture eventually, so material has a lifetime
and five staggered generations hand over, weighted so one holds most of the
picture at a time. The boundary comes off the same traced coordinate as the
interior, so the outline folds with it instead of being a stencil the folding
happens inside.

## check-murmuration.mjs

```
cd tools && npm run proto
```

Compiles the shader headlessly (a GLSL error only shows as a blank stage in a
browser, which costs a round trip to discover), measures cost and the body's
extent over a turn cycle, and writes four stills to `shots/`. **Read the
stills** — they are the point of running it.

Two hard-won cautions about the instrument:

- **It cannot see a crossfade.** A dissolve between two configurations
  produces a perfectly ordinary frame-to-frame delta while looking badly wrong.
  The `change/s` figure catches lurches, not ghosting.
- **`fps` is only comparable after the adaptive resolution settles**, which is
  why the script waits six seconds before measuring and prints the resolution
  it settled at. Compare fps only at the same resolution.

Software rendering, so the absolute fps means nothing; only differences between
versions do, and only at equal resolution.
