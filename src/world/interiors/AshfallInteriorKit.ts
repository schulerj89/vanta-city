import type { StaticColliderDefinition } from '../../physics/StaticCollider';
import type {
  BoxVisualDefinition,
  CinematicAnchorDefinition,
  LampFixtureDefinition,
  NamedLocationDefinition,
  SpawnPointDefinition,
  Vector3Tuple,
} from '../LevelDefinition';
import { ashfallBuildingTextureIds } from '../buildings/AshfallBuildingKit';

export interface AshfallInteriorDefinition {
  readonly id: 'night-venue' | 'rook-home';
  readonly sectorId: string;
  readonly visuals: readonly BoxVisualDefinition[];
  readonly colliders: readonly StaticColliderDefinition[];
  readonly location: NamedLocationDefinition;
  readonly spawns: readonly SpawnPointDefinition[];
  readonly anchors: readonly CinematicAnchorDefinition[];
  readonly lamps: readonly LampFixtureDefinition[];
  readonly floorColliderId: string;
  readonly mapFootprintVisualId: string;
}

interface Piece {
  readonly id: string;
  readonly position: Vector3Tuple;
  readonly size: Vector3Tuple;
  readonly color: number;
  readonly textureAssetId?: string;
  readonly uvMetersPerRepeat?: number;
  readonly materialName?: string;
  readonly tags?: readonly string[];
}

export const ashfallNightVenueInterior = createNightVenue();
export const ashfallRookHomeInterior = createRookHome();
export const ashfallInteriors = [
  ashfallNightVenueInterior,
  ashfallRookHomeInterior,
] as const;

function createNightVenue(): AshfallInteriorDefinition {
  const prefix = 'interior-night-venue';
  const pieces: Piece[] = [
    surface(
      prefix,
      'floor',
      [56, 0.3, 27],
      [8.5, 0.2, 12],
      0xffffff,
      ashfallBuildingTextureIds.venueTerrazzo,
      ['walkable', 'pedestrian-interior'],
    ),
    wall(prefix, 'east-wall', [60.25, 2.2, 27], [0.3, 4, 12]),
    wall(prefix, 'north-wall', [56, 2.2, 33], [8.5, 4, 0.3]),
    wall(prefix, 'south-wall', [56, 2.2, 21], [8.5, 4, 0.3]),
    wall(prefix, 'west-wall-north', [51.75, 2.2, 30.75], [0.3, 4, 4.5]),
    wall(prefix, 'west-wall-south', [51.75, 2.2, 23.25], [0.3, 4, 4.5]),
    ceiling(prefix, [56, 4.15, 27], [8.5, 0.3, 12]),
    furniture(
      prefix,
      'service-bar',
      [58.75, 0.75, 27],
      [1.2, 1.1, 5],
      0x385f62,
      ashfallBuildingTextureIds.venueTerrazzo,
    ),
    furniture(prefix, 'booth', [54.2, 0.65, 31.1], [2.4, 0.9, 1.1], 0x7b4051),
    furniture(
      prefix,
      'low-table',
      [54.2, 0.45, 29.7],
      [1.1, 0.5, 0.8],
      0xb58a59,
    ),
    furniture(
      prefix,
      'stage',
      [56.8, 0.35, 22.2],
      [3.5, 0.5, 1.4],
      0x57394f,
      ashfallBuildingTextureIds.venueTerrazzo,
    ),
    visualOnly(
      prefix,
      'amber-fixture',
      [57.7, 3.2, 27],
      [0.35, 0.35, 0.35],
      0xffa451,
    ),
  ];
  return interior(
    prefix,
    'night-venue',
    'sector.world-004-east-north',
    pieces,
    {
      location: {
        id: 'location.ashfall.night-venue',
        kind: 'interaction',
        name: 'Nightglass Room',
        position: [54.4, 0.42, 27],
        tags: ['interior', 'night-venue', 'world-004'],
      },
      spawns: [],
      anchors: [
        {
          id: 'camera.ashfall.night-venue-wide',
          position: [52.8, 2.5, 27],
          lookAt: [57.4, 1.2, 27],
          fieldOfView: 56,
          tags: ['cinematic', 'generic', 'interior', 'night-venue'],
        },
        {
          id: 'camera.ashfall.night-venue-counter',
          position: [55.2, 2.25, 23.2],
          lookAt: [58.4, 1.25, 27],
          fieldOfView: 48,
          tags: ['cinematic', 'generic', 'interior', 'service'],
        },
      ],
      lamps: [
        {
          id: 'lamp.interior-night-venue',
          visualId: `v.${prefix}-amber-fixture`,
          position: [57.4, 3, 27],
          emissiveMaterialName: 'InteriorFixture',
        },
      ],
    },
  );
}

function createRookHome(): AshfallInteriorDefinition {
  const prefix = 'interior-rook-home';
  const pieces: Piece[] = [
    surface(
      prefix,
      'floor',
      [-42, 0.3, -27],
      [8.5, 0.2, 10],
      0xffffff,
      ashfallBuildingTextureIds.homeLinoleum,
      ['walkable', 'pedestrian-interior'],
    ),
    wall(prefix, 'west-wall', [-46.25, 2.2, -27], [0.3, 4, 10]),
    wall(prefix, 'north-wall', [-42, 2.2, -22], [8.5, 4, 0.3]),
    wall(prefix, 'south-wall', [-42, 2.2, -32], [8.5, 4, 0.3]),
    wall(prefix, 'east-wall-north', [-37.75, 2.2, -23.75], [0.3, 4, 2.5]),
    wall(prefix, 'east-wall-south', [-37.75, 2.2, -30.25], [0.3, 4, 3.5]),
    ceiling(prefix, [-42, 4.15, -27], [8.5, 0.3, 10]),
    furniture(prefix, 'bed', [-44.3, 0.65, -24.3], [2.4, 0.9, 3.1], 0x596b72),
    furniture(
      prefix,
      'kitchen-block',
      [-44.7, 0.85, -29.5],
      [1.8, 1.5, 3.4],
      0xa9a078,
      ashfallBuildingTextureIds.homeLinoleum,
    ),
    furniture(prefix, 'table', [-41.2, 0.65, -28.2], [1.5, 0.9, 1.2], 0x765c43),
    furniture(
      prefix,
      'bookcase',
      [-40.4, 1.2, -22.5],
      [2.2, 2.1, 0.6],
      0x624b38,
    ),
    visualOnly(
      prefix,
      'warm-fixture',
      [-41.5, 3.2, -27],
      [0.3, 0.3, 0.3],
      0xffd18a,
    ),
  ];
  return interior(prefix, 'rook-home', 'sector.world-004-west-south', pieces, {
    location: {
      id: 'location.ashfall.rook-home',
      kind: 'interaction',
      name: "Rook's Flat",
      position: [-39.2, 0.42, -26.5],
      tags: ['interior', 'home', 'world-004'],
    },
    spawns: [
      {
        id: 'spawn.player.home',
        kind: 'player',
        position: [-39.2, 0.42, -26.5],
        rotation: [0, -Math.PI / 2, 0],
        tags: ['safe', 'home', 'interior'],
      },
    ],
    anchors: [
      {
        id: 'camera.ashfall.rook-home-wide',
        position: [-38.8, 2.45, -26.8],
        lookAt: [-43, 1.15, -27],
        fieldOfView: 55,
        tags: ['cinematic', 'generic', 'interior', 'home'],
      },
      {
        id: 'camera.ashfall.rook-home-table',
        position: [-43.2, 2.2, -30],
        lookAt: [-41.2, 1.05, -28.2],
        fieldOfView: 47,
        tags: ['cinematic', 'generic', 'interior', 'table'],
      },
    ],
    lamps: [
      {
        id: 'lamp.interior-rook-home',
        visualId: `v.${prefix}-warm-fixture`,
        position: [-41.5, 3, -27],
        emissiveMaterialName: 'InteriorFixture',
      },
    ],
  });
}

function interior(
  prefix: string,
  id: AshfallInteriorDefinition['id'],
  sectorId: string,
  pieces: readonly Piece[],
  semantic: Pick<
    AshfallInteriorDefinition,
    'location' | 'spawns' | 'anchors' | 'lamps'
  >,
): AshfallInteriorDefinition {
  return {
    id,
    sectorId,
    visuals: pieces.map(toVisual),
    colliders: pieces
      .filter(({ tags }) => tags !== undefined)
      .map((piece) => ({
        id: `c.${piece.id}`,
        position: piece.position,
        size: piece.size,
        tags: piece.tags,
      })),
    ...semantic,
    floorColliderId: `c.${prefix}-floor`,
    mapFootprintVisualId: `v.${prefix}-floor`,
  };
}

function toVisual(piece: Piece): BoxVisualDefinition {
  return {
    id: `v.${piece.id}`,
    kind: 'box',
    position: piece.position,
    size: piece.size,
    color: piece.color,
    textureAssetId: piece.textureAssetId,
    uvMetersPerRepeat: piece.uvMetersPerRepeat,
    materialName: piece.materialName,
  };
}

function surface(
  prefix: string,
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  textureAssetId: string,
  tags: readonly string[],
): Piece {
  return {
    id: `${prefix}-${id}`,
    position,
    size,
    color,
    textureAssetId,
    uvMetersPerRepeat: 3,
    tags,
  };
}

function wall(
  prefix: string,
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
): Piece {
  return {
    id: `${prefix}-${id}`,
    position,
    size,
    color: 0x526064,
    textureAssetId: ashfallBuildingTextureIds.ribbedZinc,
    uvMetersPerRepeat: 3,
    tags: ['obstacle', 'camera', 'interior-shell'],
  };
}

function ceiling(
  prefix: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
): Piece {
  return {
    ...wall(prefix, 'ceiling', position, size),
    tags: ['obstacle', 'camera', 'interior-shell', 'roof'],
  };
}

function furniture(
  prefix: string,
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
  textureAssetId?: string,
): Piece {
  return {
    id: `${prefix}-${id}`,
    position,
    size,
    color,
    textureAssetId,
    uvMetersPerRepeat: textureAssetId ? 3 : undefined,
    tags: ['obstacle', 'camera', 'interior-furnishing'],
  };
}

function visualOnly(
  prefix: string,
  id: string,
  position: Vector3Tuple,
  size: Vector3Tuple,
  color: number,
): Piece {
  return {
    id: `${prefix}-${id}`,
    position,
    size,
    color,
    materialName: 'InteriorFixture',
  };
}
