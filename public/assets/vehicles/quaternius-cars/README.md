# Quaternius Cars Bundle traffic subset

These repository-local GLBs come from Quaternius's **Cars Bundle**. The
authoritative [Poly Pizza bundle page](https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk)
states that the pack contains eight cars in GLB/FBX formats, is free for
personal and commercial use, names Quaternius as creator, and labels it Public
Domain (CC0). Quaternius's [original Cars Pack page](https://quaternius.com/packs/cars.html)
independently states eight models, commercial/personal use, and CC0.

Acquired 2026-07-19 through Poly Pizza's public GLB bundle endpoint. The
download response resolved to `FE5IWe6OMk-glb-1933643188.zip`: 310,873 bytes,
SHA-256 `fe45c914aa22f4509dd26ae8f74bb5af229f25b74fa42315728a55778e9fe05d`.
`unzip -t` passed. The live archive contains seven GLBs despite the page's
historic eight-model description. The separately listed Pickup Truck is that
eighth design; its current individual download exactly matches the already
committed GLB. The full official CC0 1.0 legal code is retained as
`LICENSE-CC0-1.0.txt` (SHA-256
`a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`).

## Source and integrity audit

| Local file          | Original archive/download name                        | Poly Pizza record                               | SHA-256                                                            |   Bytes | Triangles | Materials |       Textures |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ------: | --------: | --------: | -------------: |
| `pickup-truck.glb`  | `4e925a01-dbb8-4aab-848b-221306b835ea.glb` (`Pickup`) | [Pickup Truck](https://poly.pizza/m/qn4grQgHm8) | `9d6b2e33af0d37bf42b2e7af850949f4efd0ddbb9a88077812d152d8b4c1c3eb` | 273,012 |     6,432 |         3 | 1 embedded PNG |
| `sports-car.glb`    | `Sports Car.glb` (`SportsCar`)                        | [Sports Car](https://poly.pizza/m/OyqKvX9xNh)   | `2878182e9a17b809d45b0a184f51560eab755b2d7e3058bf02acbd5fcd0ca78b` | 171,300 |     3,066 |         7 |              0 |
| `sport-coupe.glb`   | `Sports Car-1mkmFkAz5v.glb` (`SportsCar2`)            | [Sports Car](https://poly.pizza/m/1mkmFkAz5v)   | `bbb1c718d2aaf5f4344e9fb2cd66d8332a998a515b09ddd4dfa14698d787124e` | 175,100 |     3,148 |         6 |              0 |
| `family-sedan.glb`  | `Car.glb` (`NormalCar1`)                              | [Car](https://poly.pizza/m/Cz6yDaUcM9)          | `bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462` | 164,752 |     2,954 |         6 |              0 |
| `taxi-sedan.glb`    | `Taxi.glb` (`Taxi`)                                   | [Taxi](https://poly.pizza/m/x43lOScTpN)         | `14b2f982f8a501565702ecb56f917c82e9abae914fa3f76d2f622a8670598af1` | 181,084 |     3,278 |         6 |              0 |
| `suv.glb`           | `SUV.glb` (`SUV`)                                     | [SUV](https://poly.pizza/m/xsMtZhBkxL)          | `1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6` | 181,608 |     3,294 |         6 |              0 |
| `compact-wagon.glb` | `Car-unqqkULtRU.glb` (`NormalCar2`)                   | [Car](https://poly.pizza/m/unqqkULtRU)          | `e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39` | 174,320 |     3,124 |         7 |              0 |

Every shipped file is binary glTF 2.0 with one embedded BIN chunk, no external
buffer/image URI, and no runtime network dependency. All archive-file hashes
match the corresponding individual Poly Pizza GLB downloads. The existing
Pickup Truck and Sports Car were deduplicated by exact SHA-256 rather than
reimported.

## Runtime presentation audit

All eight source designs author the front bumper along local `+Z`; the shared
normalizer rotates from the catalog axis, uniformly scales, centers X/Z, and
grounds the lowest point 0.02 m above the lane. Lengths stay near the 4.4 m
traffic contract but the naturally wide SUV, compact wagon, and sport coupe use
slightly shorter measured targets to remain at or below 2.05 m normalized width.

| Local file          | Source bounds W×H×L (m) | Normalized W×H×L (m) | Detector W×H×L (m) | Static sweep |
| ------------------- | ----------------------- | -------------------- | ------------------ | -----------: |
| `pickup-truck.glb`  | 2.312×1.848×5.180       | 1.964×1.570×4.400    | 1.8×1.0×7.0        |       0.75 m |
| `sports-car.glb`    | 1.805×1.155×3.969       | 2.001×1.281×4.400    | 1.8×1.0×7.0        |       0.75 m |
| `sport-coupe.glb`   | 1.872×1.203×3.927       | 2.049×1.317×4.300    | 1.8×1.0×7.0        |       0.75 m |
| `family-sedan.glb`  | 1.807×1.177×4.221       | 1.884×1.227×4.400    | 1.8×1.0×7.0        |       0.75 m |
| `taxi-sedan.glb`    | 1.807×1.310×4.221       | 1.884×1.366×4.400    | 1.8×1.0×7.0        |       0.75 m |
| `suv.glb`           | 2.111×1.528×4.209       | 2.047×1.481×4.080    | 1.8×1.1×7.2        |       0.75 m |
| `compact-wagon.glb` | 1.638×1.146×3.310       | 2.044×1.430×4.130    | 1.8×1.0×7.0        |       0.75 m |

## Deliberate exclusion

`Police Car.glb` (`Cop`, Poly Pizza ID `BwwnUrWGmV`) is a valid embedded GLB:
180,512 bytes, 3,232 triangles, 8 materials, 0 textures, SHA-256
`2ad6705f58bae2acf806eddb28acd9fc2ff6dc65a726575be5c180631b3132d0`,
source bounds 1.778×1.239×3.730 m, front `+Z`. It is not shipped or registered.
Presenting a marked police vehicle as ordinary civilian traffic would imply
emergency behavior that this task does not implement. Future police gameplay
must add that behavior explicitly before importing the audited source file.

## Adding another traffic car

Import only a license-verified, self-contained GLB. Add exactly one model entry
to `src/assets/catalog.ts` and one ordered definition to
`TrafficVehicleCatalog.ts`; record the immutable hash/count/bounds baseline in
`validate-traffic-assets.ts`; then review it in `pnpm lab:vehicles`. The catalog
remains the only model-selection authority. Keep the normal population cap at
eight and confirm that its deterministic slot allocation still gives every
runtime type at least one slot.
