# Eye asset plug (§5.3)

`manifest.json` ships here with no layers declared, which means the engine
renders its built-in procedural eye — that is the intended steady state until
real art exists. (An absent manifest behaves identically, but the file is
shipped so no visitor's browser 404s on every page load.)

To plug art in, copy the layers you have from `manifest.example.json` into
`manifest.json`, drop the files next to it, and reload. Partial drops are fine:
any layer you leave out keeps its procedural stand-in. No code changes, ever.

The eye is a carved plate with a lens-shaped aperture cut through it, and the
visualization lives **inside** the aperture. There is no eyeball to draw: no
sclera, no iris, no pupil. What you are authoring is stone and the hole in it.

Layers are composited in this order, with the field drawn into the aperture
between `plate` and `socket`:

`plate → [the field] → socket → lid-lower → lid-upper → glow (additive) → frame`

- `plate` — the stone face, with the aperture left transparent.
- `socket` — the carved rim and inner shadow, drawn over the field's edge.
- `lid-upper` / `lid-lower` — optional stone shutters, if you want the eye to
  open by parting rather than by widening.
- `glow` — additive light spill, faded in with the eye's glow.
- `frame` — surrounding ornament, over everything.

`aperture` declares the hole the field is clipped to, as fractions of the
square box (`w` half-width, `h` half-height, both ≤ 0.5). Get this wrong and
the field will show through your stone or hide behind it — it is the one
number that has to agree with the art.

Author every layer on the same square canvas (1024×1024 works well) so they
register against each other; the engine scales the whole square to fit the
screen. `travel` on a lid is the fraction of the square the lid slides when
the eye fully opens (upper slides up, lower slides down).

Run `node tools/validate-assets.mjs` after a drop. The engine ignores layers it
can't load rather than complaining, so a typo'd filename looks exactly like
"the art isn't done yet".
