# Quaternius civilian traffic vehicles

The two local GLBs are a deliberately small subset of Quaternius's Cars Pack.
The authoritative pack page identifies the eight-model pack as CC0 and free for
personal and commercial use: https://quaternius.com/packs/cars.html

| Local file         | Creator    | Individual source               | License | SHA-256                                                            |   Bytes | Triangles | Materials |         Textures |
| ------------------ | ---------- | ------------------------------- | ------- | ------------------------------------------------------------------ | ------: | --------: | --------: | ---------------: |
| `pickup-truck.glb` | Quaternius | https://poly.pizza/m/qn4grQgHm8 | CC0 1.0 | `9d6b2e33af0d37bf42b2e7af850949f4efd0ddbb9a88077812d152d8b4c1c3eb` | 273,012 |     6,432 |         3 | 1 embedded image |
| `sports-car.glb`   | Quaternius | https://poly.pizza/m/OyqKvX9xNh | CC0 1.0 | `2878182e9a17b809d45b0a184f51560eab755b2d7e3058bf02acbd5fcd0ca78b` | 171,300 |     3,066 |         7 |                0 |

The individual source pages also explicitly label each model Public Domain
(CC0). Files were downloaded on 2026-07-17 from the GLB download URLs exposed
by those pages. Triangle/material/texture counts were read from the GLB JSON
chunk. Runtime loading uses only these repository-local files.

## Runtime presentation audit

Both models author their front along local `+Z`. The data-driven traffic catalog
uniformly scales each to 4.40 m long, centers it laterally, places its lowest
point 0.02 m above the lane, and defines a 1.80 × 1.00 × 7.00 m forward detector.
The static-world sweep retains a 0.75 m radius so curb geometry remains outside
the traveled corridor.

| Local file         | Source bounds (W × H × L) | Normalized bounds (W × H × L) | Safe maximum (W × H) |
| ------------------ | ------------------------- | ----------------------------- | -------------------- |
| `pickup-truck.glb` | 2.31 × 1.85 × 5.18 m      | 1.96 × 1.57 × 4.40 m          | 2.05 × 1.70 m        |
| `sports-car.glb`   | 1.80 × 1.16 × 3.97 m      | 2.00 × 1.28 × 4.40 m          | 2.05 × 1.70 m        |

The recursive local audit found no other vehicle GLBs. No synthetic variants
were added because these two models are already materially distinct. Validation
fails when a local GLB, a manifest entry marked `civilian-traffic`, and the
runtime catalog stop matching one-to-one.
