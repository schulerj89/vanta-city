import { readFile } from 'node:fs/promises';
import { ashfallTrafficLanes } from '../src/traffic/TrafficSimulation';
import { ashfallBuildingAssets } from '../src/world/buildings/AshfallBuildingKit';
import { ashfallInteriors } from '../src/world/interiors/AshfallInteriorKit';
import {
  world004BoundarySegments,
  world004BuildingPlacements,
  world004JunctionPlan,
  world004Roads,
} from '../src/world/levels/junctionGrowth';
import { testDistrict } from '../src/world/levels/testDistrict';
import { validateLevelDefinition } from '../src/world/LevelDefinition';
import { defaultAdaptiveSectorStreamingConfig } from '../src/world/AdaptiveSectorStreamingPolicy';

interface World004PlanDocument {
  readonly target: {
    readonly linearGrowthPercent: number;
    readonly boundsMetres: Record<'minX' | 'maxX' | 'minZ' | 'maxZ', number>;
    readonly widthMetres: number;
    readonly depthMetres: number;
    readonly playableAreaSquareMetres: number;
    readonly buildingCount: number;
    readonly sectorCount: number;
  };
  readonly addedBuildingIds: readonly string[];
  readonly addedSectors: readonly string[];
  readonly textureFamilies: readonly { readonly assetId: string }[];
  readonly interiors: readonly { readonly locationId: string }[];
}

const plan = JSON.parse(
  await readFile('docs/world/plans/world-004-four-side-interiors.json', 'utf8'),
) as World004PlanDocument;

validateLevelDefinition(testDistrict.definition);
const runtime = world004JunctionPlan;
assertEqual(plan.target.boundsMetres, runtime.bounds, 'plan/runtime bounds');
assertEqual(
  testDistrict.definition.mapPresentation.bounds,
  runtime.bounds,
  'map/runtime bounds',
);
assert(plan.target.linearGrowthPercent === 25, 'linear growth must be 25%');
assert(plan.target.widthMetres === 109.375, 'width must be 109.375m');
assert(plan.target.depthMetres === 87.5, 'depth must be 87.5m');
assert(
  plan.target.playableAreaSquareMetres === 9570.3125,
  'area must be 9,570.3125m²',
);
assert(plan.target.buildingCount === 37, 'building count must be 37');
assert(plan.target.sectorCount === 22, 'sector count must be 22');
assert(world004BuildingPlacements.length === 12, 'expected 12 new buildings');
assert(plan.addedBuildingIds.length === 12, 'plan must name 12 buildings');
assert(plan.addedSectors.length === 8, 'plan must name 8 sectors');
assert(ashfallInteriors.length === 2, 'expected two interiors');

const assets = ashfallBuildingAssets as Record<
  string,
  {
    readonly url: string;
    readonly metadata: { readonly runtimeNetwork: boolean };
  }
>;
for (const family of plan.textureFamilies) {
  const descriptor = assets[family.assetId];
  assert(descriptor !== undefined, `missing texture ${family.assetId}`);
  assert(
    descriptor.url.startsWith('/assets/environment/ashfall-buildings/'),
    `${family.assetId} must be local`,
  );
  assert(
    descriptor.metadata.runtimeNetwork === false,
    `${family.assetId} network`,
  );
}

const ownerCounts = new Map<string, number>();
for (const sector of testDistrict.definition.streaming.sectors) {
  for (const id of sector.entryIds) {
    ownerCounts.set(id, (ownerCounts.get(id) ?? 0) + 1);
  }
}
for (const interior of ashfallInteriors) {
  assert(
    plan.interiors.some(
      ({ locationId }) => locationId === interior.location.id,
    ),
    `plan missing ${interior.location.id}`,
  );
  for (const id of [
    ...interior.visuals.map(({ id }) => id),
    ...interior.colliders.map(({ id }) => id),
  ]) {
    assert(ownerCounts.get(id) === 1, `${id} must have one sector owner`);
  }
}

const sectors = new Map<
  string,
  (typeof testDistrict.definition.streaming.sectors)[number]
>(
  testDistrict.definition.streaming.sectors.map((sector) => [
    sector.id,
    sector,
  ]),
);
for (const entry of [...world004BoundarySegments, ...world004Roads]) {
  for (const id of [entry.visual.id, entry.collider.id]) {
    assert(ownerCounts.get(id) === 1, `${id} must have one sector owner`);
    assert(
      sectors.get(entry.sectorId)?.entryIds.includes(id) === true,
      `${id} must be owned by ${entry.sectorId}`,
    );
  }
  const owner = sectors.get(entry.sectorId);
  assert(owner !== undefined, `missing owner ${entry.sectorId}`);
  const [x, , z] = entry.visual.position;
  const [width, , depth] = entry.visual.size;
  for (const corner of [
    [x - width / 2, z - depth / 2],
    [x - width / 2, z + depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
  ] as const) {
    const distance = Math.hypot(
      corner[0] - owner.center[0],
      corner[1] - owner.center[1],
    );
    assert(
      distance <= defaultAdaptiveSectorStreamingConfig.hardNearRadius,
      `${entry.visual.id} extent is ${distance.toFixed(3)}m from ${entry.sectorId}`,
    );
  }
}

const laneByApproach = new Map(
  ashfallTrafficLanes.map((lane) => [lane.approach, lane]),
);
assert(laneByApproach.get('north')?.startZ === 40.75, 'north lane endpoint');
assert(laneByApproach.get('south')?.startZ === -40.75, 'south lane endpoint');
assert(laneByApproach.get('west')?.startX === -44.6875, 'west lane endpoint');
assert(laneByApproach.get('east')?.startX === 58.6875, 'east lane endpoint');

console.log(
  'Validated WORLD-004: 109.375m × 87.5m, 9,570.3125m², 37 buildings, 22 sectors, 2 interiors, 2 local texture families.',
);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`WORLD-004 validation failed: ${message}`);
}

function assertEqual(left: unknown, right: unknown, label: string): void {
  assert(JSON.stringify(left) === JSON.stringify(right), `${label} mismatch`);
}
