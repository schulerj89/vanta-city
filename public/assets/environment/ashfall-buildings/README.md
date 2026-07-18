# Ashfall generated building textures

These five textures are original project assets generated with the Codex built-in image-generation tool on 2026-07-17. They were resized from the generated 1254×1254 PNG outputs to 512×512 JPEG at quality 82 for local runtime use. No external texture source or third-party license is involved, and the game performs no runtime network request for them.

| Runtime file                    | Generated source retained by Codex              | Intent                                            |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `concrete-deco.generated.jpg`   | `exec-5de483bf-accf-4caf-a078-8a305be688f4.png` | Ash-gray concrete with faded teal deco scoring    |
| `brick-stucco.generated.jpg`    | `exec-a5e4b8b6-4224-47c6-b919-709b34d20265.png` | Patched brick, sand stucco, and teal bands        |
| `corrugated-teal.generated.jpg` | `exec-117302c9-7448-462d-bc0e-4e1e16cd3366.png` | Oxidized blue-green corrugated metal              |
| `window-deco.generated.jpg`     | `exec-8d35642a-755f-4f00-a219-d691969b0ff6.png` | Opaque smoked windows in weathered teal deco bays |
| `roof-membrane.generated.jpg`   | `exec-a3676afa-1882-4e1c-8bc5-d30884d71cd8.png` | Charcoal patched industrial roof membrane         |

All prompts specified a square tileable orthographic flat-albedo game texture, continuous edges, neutral diffuse lighting, no text/logos/objects, and no real-city landmark imitation. The three opaque facade prompts prohibited windows and doors. The window prompt required clearly readable but opaque/sealed dark panes with no visible interiors, glow, reflections, or open holes. The roof prompt prohibited equipment, vents, puddles, and perspective. The complete material and palette constraints are recorded in `docs/ashfall-building-kit.md` and the generating task history.
