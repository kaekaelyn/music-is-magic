# Eye asset plug (§5.3)

`manifest.json` ships here with no layers declared, which means the engine
renders its built-in procedural eye — that is the intended steady state until
real art exists. (An absent manifest behaves identically, but the file is
shipped so no visitor's browser 404s on every page load.)

To plug art in, copy the layers you have from `manifest.example.json` into
`manifest.json`, drop the files next to it, and reload. Partial drops are fine:
any layer you leave out keeps its procedural stand-in. No code changes, ever.

Layers are composited in this order:
`sclera → iris → lid-lower → lid-upper → glow (additive) → frame`.

Author every layer on the same square canvas (1024×1024 works well) so they
register against each other; the engine scales the whole square to fit the
screen. `travel` on a lid is the fraction of the square the lid slides when
the eye fully opens (upper slides up, lower slides down).

Run `node tools/validate-assets.mjs` after a drop. The engine ignores layers it
can't load rather than complaining, so a typo'd filename looks exactly like
"the art isn't done yet".
