# Ashfall generated streetscape textures

These seven original project assets were produced with the Codex built-in image-generation tool on 2026-07-17. Generated 1254×1254 PNG sources were resized to 512×512 JPEG at quality 82 for local runtime use. No external texture source or third-party license is involved, and the game performs no runtime network request for them.

| Runtime file                      | Generated source retained by Codex              | Intent                                              |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `concrete-deco.generated.jpg`     | `exec-4d7e5e7f-846d-4b3c-82d4-f4182de6ab13.png` | Three-bay concrete facade with teal deco scoring    |
| `brick-stucco.generated.jpg`      | `exec-e0d35a3c-513e-4f83-8e75-7f57c597e331.png` | Brick/stucco storefront bays, bulkheads, and fascia |
| `window-deco.generated.jpg`       | `exec-5a8cfdbd-c9b8-43d9-8f13-fb5b73bdc884.png` | Opaque office windows with vertical piers           |
| `corrugated-teal.generated.jpg`   | `exec-8b130b78-10d7-472e-88a6-427aee6f1662.png` | Corrugated service wall and concrete plinth         |
| `roof-membrane.generated.jpg`     | `exec-b2f849b6-09af-411e-9643-98ea4bdb6e7a.png` | Charcoal patched industrial roof membrane           |
| `sidewalk-concrete.generated.jpg` | `exec-02f69c63-b630-4a64-8f87-3d3d577a9349.png` | Scored pale concrete sidewalk slabs                 |
| `curb-aggregate.generated.jpg`    | `exec-6c0c77e9-1545-4fb9-a568-b876e51be461.png` | Warm-gray salt-weathered aggregate curb face        |

The final prompt set used the `stylized-concept` taxonomy and specified square, edge-to-edge seamless orthographic flat-albedo game textures with neutral shadowless diffuse lighting. Shared constraints prohibited copied photographs, real landmarks, readable text, signs, logos, trademarks, people, props, graffiti, watermarks, perspective, cast shadows, highlights, reflections, glow, and baked directional light.

Per-texture prompt intent:

- concrete: three regular facade bays, narrow piers, sealed dark teal windows, stepped parapet/cornice, faded geometric scoring, salt streaks, and repairs;
- storefront: regular brick piers, repaired sand stucco, sealed display windows on bulkheads, transoms, recessed-looking entry bay, and strong teal fascia/cornice;
- office: narrow vertical piers, paired opaque windows, concrete spandrels, streamline grooves, and stepped coping;
- service: vertical corrugated teal sheets, charcoal posts, sealed louvers, concrete plinth, and restrained fastener rust;
- roof: top-down bitumen rolls, seams, salt bleaching, fine aggregate, and restrained tar patches, with no equipment;
- sidewalk: top-down large scored concrete slabs, shell aggregate, salt bleaching, and hairline repairs, with no trip-hazard cracks or objects;
- curb: straight-on dense aggregate concrete with subtle salt wear, repaired chips, and lower-edge road darkening.

Architecture/preservation source links and the derived non-copying design principles are recorded in `docs/ashfall-building-kit.md`.

## BUILDINGS-002 procedural material extension

Four additional project-owned textures were generated locally on 2026-07-18 by the checked-in deterministic `scripts/generate-building-textures.mjs` program. The generator writes mathematical color/pattern fields at 512×512, converts them to JPEG quality 72 with macOS `sips`, and makes no network request. There is no external source image, model/provider request, author, retrieval URL, crop, or secret. Creator and rights holder: Vanta City project; license: original-project-owned. Source and runtime resolution are both 512×512. The patterns wrap on 32/48/64/128px periods that exactly divide 512px; no post-generation crop or seam repair is required.

| Runtime file                       | SHA-256                                                            |  Bytes | Intended material and review                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------ | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ribbed-zinc.procedural.jpg`       | `12d3128fe4e4cc1e8b14710b84de107d0c0aadf07206766dab386736268e9b13` | 75,098 | Muted zinc ribs, salt bloom, and restrained lower-edge rust; accepted for transit/service shells with no text, brand, perspective, or baked lighting. |
| `ceramic-tile.procedural.jpg`      | `fed1b8be96bbd2cd50f7bd67b53921b8fff58b50b41ca59c7f0fcb9f21b8fe7a` | 26,682 | Desaturated glazed grid with dark joints and per-tile tonal variation; accepted for civic/institutional bases.                                        |
| `glass-block.procedural.jpg`       | `e1ee7d0be134cb93dc106dac94e4a101a914e42a09d4b31bec5e94f35d4a214f` | 38,381 | Smoked blue-green block grid with abstract ripple; accepted as opaque entrance/window treatment, not a transparent interior.                          |
| `painted-shopfront.procedural.jpg` | `89c52be626dfcb4a371699c877079a005215b3e8ee4208f04df74f6799d643a9` | 33,643 | Charcoal display bays, oxidized teal bulkhead, warm painted fascia; accepted for unsigned 1997 commercial frontage.                                   |

The complete eleven-texture catalog is 817,716 bytes, below the 1,153,433-byte (1.1 MiB) BUILDINGS-002 aggregate limit. JPEG hashes and dimensions are enforced by `pnpm validate:buildings`. Re-running the generator is an intentional source-art operation; accepted runtime bytes remain hash-pinned because OS JPEG encoding can differ across platforms.
