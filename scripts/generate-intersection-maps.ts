import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ashfallBuildingPlacements,
  testDistrict,
} from '../src/world/levels/testDistrict';
import { getAshfallBuildingVariant } from '../src/world/buildings/AshfallBuildingKit';
import {
  fixtureSpawns,
  intersectionApproachSpawns,
  intersectionCornerSpawns,
  intersectionLandmarks,
  intersectionLayout,
} from '../src/world/levels/intersectionLayout';

const output = resolve('docs/world');
await mkdir(output, { recursive: true });

const scale = 10;
const margin = 70;
const plot = intersectionLayout.footprint * scale;
const point = ([x, , z]: readonly number[]) => ({
  x: margin + (x + intersectionLayout.outerEdge) * scale,
  y: margin + (intersectionLayout.outerEdge - z) * scale,
});
const rect = (x: number, z: number, width: number, depth: number) => ({
  x: margin + (x - width / 2 + intersectionLayout.outerEdge) * scale,
  y: margin + (intersectionLayout.outerEdge - (z + depth / 2)) * scale,
  width: width * scale,
  height: depth * scale,
});

const spawnMarkers = [
  { id: 'spawn.player-default', position: intersectionLayout.defaultSpawn },
  ...intersectionApproachSpawns,
  ...intersectionCornerSpawns,
]
  .map(({ id, position }) => {
    const p = point(position);
    return `<g><circle cx="${p.x}" cy="${p.y}" r="6" class="spawn"/><text x="${p.x + 9}" y="${p.y - 8}">${id.replace('spawn.', '')}</text></g>`;
  })
  .join('\n');
const landmarkMarkers = intersectionLandmarks
  .map(({ name, position }) => {
    const p = point(position);
    return `<g><path d="M ${p.x} ${p.y - 7} l 7 14 h -14 z" class="landmark"/><text x="${p.x + 9}" y="${p.y + 4}">${name}</text></g>`;
  })
  .join('\n');
const light = point(intersectionLayout.trafficLight);
const interaction = point(intersectionLayout.signalController);
const roadHorizontal = rect(0, 0, 56, 12);
const roadVertical = rect(0, 0, 12, 56);
const buildingRects = ashfallBuildingPlacements
  .map(({ visual }) => {
    const definition = getAshfallBuildingVariant(visual.variantId);
    const bounds = rect(
      visual.position[0],
      visual.position[2],
      definition.footprint[0],
      definition.footprint[1],
    );
    return `<rect data-variant="${definition.id}" x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"/>`;
  })
  .join('\n    ');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="720" viewBox="0 0 760 720" role="img" aria-labelledby="title desc">
  <title id="title">Ashfall Junction construction map</title>
  <desc id="desc">Top-down map of the four-way intersection, collision boundaries, traffic light, landmarks, and player spawns.</desc>
  <style>
    text { font: 12px ui-monospace, monospace; fill: #e9eef0; paint-order: stroke; stroke: #172025; stroke-width: 3px; stroke-linejoin: round; }
    .road { fill: #293036; stroke: #59646a; stroke-width: 2; }
    .sidewalk { fill: #8b8d89; stroke: #c1bcaf; stroke-width: 2; }
    .building { fill: #704941; stroke: #d09a77; stroke-width: 2; }
    .boundary { fill: none; stroke: #ff5a57; stroke-width: 8; }
    .spawn { fill: #44ef91; stroke: #102d20; stroke-width: 2; }
    .landmark { fill: #ffe270; stroke: #493f12; stroke-width: 2; }
    .collision { fill: none; stroke: #ff9b61; stroke-width: 2; stroke-dasharray: 8 5; }
  </style>
  <rect width="760" height="720" fill="#172025"/>
  <text id="map-data" x="70" y="32">layout: footprint=${intersectionLayout.footprint};road=${intersectionLayout.roadWidth};sidewalk=${intersectionLayout.sidewalkWidth};edge=${intersectionLayout.outerEdge}</text>
  <rect x="${margin}" y="${margin}" width="${plot}" height="${plot}" fill="#596167"/>
  <rect class="sidewalk" x="${rect(-17, 17, 22, 22).x}" y="${rect(-17, 17, 22, 22).y}" width="220" height="220"/>
  <rect class="sidewalk" x="${rect(17, 17, 22, 22).x}" y="${rect(17, 17, 22, 22).y}" width="220" height="220"/>
  <rect class="sidewalk" x="${rect(-17, -17, 22, 22).x}" y="${rect(-17, -17, 22, 22).y}" width="220" height="220"/>
  <rect class="sidewalk" x="${rect(17, -17, 22, 22).x}" y="${rect(17, -17, 22, 22).y}" width="220" height="220"/>
  <rect class="road" x="${roadHorizontal.x}" y="${roadHorizontal.y}" width="${roadHorizontal.width}" height="${roadHorizontal.height}"/>
  <rect class="road" x="${roadVertical.x}" y="${roadVertical.y}" width="${roadVertical.width}" height="${roadVertical.height}"/>
  <rect x="${rect(0, 0, 8, 8).x}" y="${rect(0, 0, 8, 8).y}" width="80" height="80" fill="none" stroke="#f1e5bc" stroke-width="8" stroke-dasharray="12 7"/>
  <g class="building">
    ${buildingRects}
  </g>
  <rect class="boundary" x="${margin + 5}" y="${margin + 5}" width="${plot - 10}" height="${plot - 10}"/>
  <rect class="collision" x="${rect(0, 0, 12, 12).x}" y="${rect(0, 0, 12, 12).y}" width="120" height="120"/>
  ${spawnMarkers}
  ${landmarkMarkers}
  <g><rect x="${light.x - 6}" y="${light.y - 6}" width="12" height="12" fill="#ff453a"/><text x="${light.x + 10}" y="${light.y + 17}">traffic light</text></g>
  <g><rect x="${interaction.x - 5}" y="${interaction.y - 5}" width="10" height="10" fill="#48dbe0"/><text x="${interaction.x + 9}" y="${interaction.y + 4}">signal controller</text></g>
  <g transform="translate(665 75)"><path d="M 0 45 L 18 0 L 36 45 L 18 34 Z" fill="#f2f3f3"/><text x="13" y="62" font-size="18">N</text></g>
  <g transform="translate(70 655)">
    <text x="0" y="0">LEGEND</text><circle cx="20" cy="25" r="6" class="spawn"/><text x="35" y="29">player spawn</text>
    <path d="M 170 18 l 7 14 h -14 z" class="landmark"/><text x="185" y="29">landmark</text>
    <rect x="305" y="18" width="18" height="12" fill="#ff453a"/><text x="332" y="29">traffic light</text>
    <line x1="465" y1="24" x2="500" y2="24" class="boundary"/><text x="512" y="29">solid boundary collision</text>
    <text x="0" y="52">Road 12m (2 x 3m lanes + margins) · sidewalks/corners rise 0.20m · map scale 10px/m</text>
  </g>
</svg>`;

const level = testDistrict.definition;
const ascii = `ASHFALL JUNCTION — AUTHORITATIVE CONSTRUCTION MAP
Generated from src/world/levels/intersectionLayout.ts and testDistrict.ts.

                         NORTH (+Z)
             +---------------B---------------+
             | NW BUILDING   |   NE BUILDING |
             |      o NW     | N spawn o     |
             |               |       T! S[]  |
 WEST (-X) ==B===============+===============B== EAST (+X)
             |      CROSSWALK / ORIGIN       |
             |               |               |
             | SW BUILDING   |   SE BUILDING |
             |      o SW     | SE o          |
             +---------------B---------------+
                         SOUTH (-Z)

Legend: B solid visible boundary/collision; o player spawn; T traffic light;
S[] signal-controller interactable; + road center; == east/west road.

CONSTRUCTION RECIPE
- Origin: ${intersectionLayout.origin.join(', ')} at the crossing center; +X east, +Z north, +Y up.
- Footprint: ${intersectionLayout.footprint}m x ${intersectionLayout.footprint}m; outer collision edge ±${intersectionLayout.outerEdge}m X/Z.
- Roads: two 56m x ${intersectionLayout.roadWidth}m asphalt slabs, top Y=0; ${intersectionLayout.laneWidth}m nominal lane width.
- Sidewalk corners: four 22m squares, top Y=${intersectionLayout.curbHeight}m; the ${intersectionLayout.curbHeight}m curb step is authoritative collision.
- Crosswalk: ${intersectionLayout.crosswalkSize}m x ${intersectionLayout.crosswalkSize}m imported visual at origin; no duplicate collider because the road is authoritative.
- Corner buildings: ${ashfallBuildingPlacements
  .map(({ visual }) => {
    const definition = getAshfallBuildingVariant(visual.variantId);
    return `${visual.id} ${definition.id} at [${visual.position.join(',')}] ${definition.footprint[0]}x${definition.height}x${definition.footprint[1]}`;
  })
  .join(
    '; ',
  )}. All use conservative obstacle/camera collision with stable c.ruin-* diagnostic IDs.
- Traffic light: ${intersectionLayout.trafficLight.join(', ')}, rotation Y=PI; collision pole [0.55,4.7,0.55] centered at [8.25,2.55,8.25].
- Signal controller: ${intersectionLayout.signalController.join(', ')}, visual/collider size [0.8,1.3,0.8], location interaction.signal-controller.
- Asset logical IDs: ${Object.keys(testDistrict.assets).join(', ')}.
- Player spawns: ${level.spawns
  .filter(({ kind }) => kind === 'player')
  .map(
    ({ id, position, rotation }) =>
      `${id}=[${position.join(',')}], yaw=${rotation?.[1] ?? 0}`,
  )
  .join('; ')}.
- Development-only NPC fixture markers: ${fixtureSpawns.map(({ id, position, yaw }) => `${id}=[${position.join(',')}], yaw=${yaw}`).join('; ')}. Runtime NPC creation requires ?npcFixtures=1; sparring requires ?sparringFixture=1.
- Location zone: zone.ashfall-junction, center [0,3,0], size [56,10,56]. Landmark radius resolves before the zone; priority then distance then logical ID break ties.
- Triggers: center [0,1.5,0] size [12,3,12]; signal corner [9,1.5,9] size [6,3,6].
- Boundary: four 1m-thick, 1.3m-high visible guard walls centered at X/Z ±27.5.
- Replace a corner shell by choosing another validated Ashfall variant in testDistrict.ts while retaining or deliberately revising its paired c.ruin-* authored collision and minimap reference. Keep runtime texture URLs in the level asset manifest, not runtime systems.
`;

await Promise.all([
  writeFile(resolve(output, 'ashfall-junction-map.svg'), svg),
  writeFile(resolve(output, 'ashfall-junction-map.txt'), ascii),
]);
