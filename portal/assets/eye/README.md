# Eye asset plug (§5.3)

No `manifest.json` here means the engine renders its built-in procedural eye —
that is the intended steady state until real art exists.

To plug art in, copy `manifest.example.json` to `manifest.json`, drop the
layer files next to it, and reload. Partial drops are fine: any layer missing
from the manifest keeps its procedural stand-in. No code changes, ever.

Layers are composited in this order:
`sclera → iris → lid-lower → lid-upper → glow (additive) → frame`.

Author every layer on the same square canvas (1024×1024 works well) so they
register against each other; the engine scales the whole square to fit the
screen. `travel` on a lid is the fraction of the square the lid slides when
the eye fully opens (upper slides up, lower slides down).
