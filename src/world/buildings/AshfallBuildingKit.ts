import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import type { GameAssetLoader } from '../../assets/AssetLoader';
import type { BuildingVisualDefinition } from '../LevelDefinition';

export type AshfallWallMaterial =
  'concrete-deco' | 'brick-stucco' | 'corrugated-teal' | 'window-deco';

export type AshfallBuildingProfile = 'flat' | 'stepped' | 'setback' | 'tower';

export interface AshfallBuildingVariant {
  readonly id: string;
  readonly displayName: string;
  readonly footprint: readonly [width: number, depth: number];
  readonly height: number;
  readonly wallMaterial: AshfallWallMaterial;
  readonly profile: AshfallBuildingProfile;
  /** World metres represented by one texture repeat. */
  readonly uvMetersPerRepeat: number;
}

export const ashfallBuildingTextureIds = {
  concreteDeco: 'environment.ashfall-building.concrete-deco',
  brickStucco: 'environment.ashfall-building.brick-stucco',
  corrugatedTeal: 'environment.ashfall-building.corrugated-teal',
  windowDeco: 'environment.ashfall-building.window-deco',
  roofMembrane: 'environment.ashfall-building.roof-membrane',
} as const;

export const ashfallBuildingAssets = {
  [ashfallBuildingTextureIds.concreteDeco]: generatedTexture(
    'concrete-deco.generated.jpg',
    'Ashfall weathered concrete deco facade',
    'concrete-deco',
  ),
  [ashfallBuildingTextureIds.brickStucco]: generatedTexture(
    'brick-stucco.generated.jpg',
    'Ashfall weathered brick and stucco facade',
    'brick-stucco',
  ),
  [ashfallBuildingTextureIds.corrugatedTeal]: generatedTexture(
    'corrugated-teal.generated.jpg',
    'Ashfall weathered corrugated teal facade',
    'corrugated-teal',
  ),
  [ashfallBuildingTextureIds.windowDeco]: generatedTexture(
    'window-deco.generated.jpg',
    'Ashfall weathered smoked-window deco facade',
    'window-deco',
  ),
  [ashfallBuildingTextureIds.roofMembrane]: generatedTexture(
    'roof-membrane.generated.jpg',
    'Ashfall weathered industrial roof membrane',
    'roof-membrane',
  ),
} as const;

/**
 * Blank, reusable massing kit. Names describe Ashfall uses, not authored
 * interiors: every entry is an opaque exterior shell with one box collider.
 */
export const ashfallBuildingVariants = [
  variant(
    'boardwalk-kiosk',
    'Boardwalk Kiosk',
    6,
    6,
    4.5,
    'concrete-deco',
    'flat',
  ),
  variant(
    'canal-workshop',
    'Canal Workshop',
    10,
    7,
    6,
    'corrugated-teal',
    'flat',
  ),
  variant('harbor-row', 'Harbor Row', 7, 12, 8, 'brick-stucco', 'stepped'),
  variant(
    'saltworks-narrow',
    'Saltworks Narrow',
    6,
    14,
    10,
    'corrugated-teal',
    'setback',
  ),
  variant('relay-square', 'Relay Square', 10, 10, 11, 'concrete-deco', 'tower'),
  variant(
    'foundry-long',
    'Foundry Long',
    16,
    8,
    9,
    'corrugated-teal',
    'stepped',
  ),
  variant('tidehouse', 'Tidehouse', 12, 10, 12, 'brick-stucco', 'setback'),
  variant(
    'breaker-block',
    'Breaker Block',
    14,
    12,
    14,
    'concrete-deco',
    'stepped',
  ),
  variant(
    'switchyard-hall',
    'Switchyard Hall',
    18,
    10,
    8,
    'corrugated-teal',
    'flat',
  ),
  variant('signal-loft', 'Signal Loft', 9, 9, 15, 'window-deco', 'tower'),
  variant('storm-vault', 'Storm Vault', 12, 12, 7, 'concrete-deco', 'flat'),
  variant('ash-market', 'Ash Market', 15, 11, 10, 'brick-stucco', 'stepped'),
  variant(
    'channel-house',
    'Channel House',
    8,
    15,
    13,
    'concrete-deco',
    'setback',
  ),
  variant(
    'drydock-office',
    'Drydock Office',
    13,
    9,
    16,
    'window-deco',
    'tower',
  ),
  variant('beacon-works', 'Beacon Works', 11, 11, 18, 'window-deco', 'tower'),
  variant(
    'freight-annex',
    'Freight Annex',
    17,
    9,
    11,
    'corrugated-teal',
    'setback',
  ),
  variant(
    'seawall-court',
    'Seawall Court',
    14,
    12,
    13,
    'brick-stucco',
    'stepped',
  ),
  variant(
    'atlantic-exchange',
    'Atlantic Exchange',
    18,
    15,
    18,
    'window-deco',
    'setback',
  ),
] as const satisfies readonly AshfallBuildingVariant[];

const variantsById = new Map(
  ashfallBuildingVariants.map((definition) => [definition.id, definition]),
);

export function getAshfallBuildingVariant(id: string): AshfallBuildingVariant {
  const definition = variantsById.get(id);
  if (!definition) throw new Error(`Unknown Ashfall building variant: ${id}`);
  return definition;
}

export function validateAshfallBuildingKit(): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  if (
    ashfallBuildingVariants.length < 15 ||
    ashfallBuildingVariants.length > 20
  )
    issues.push('kit must contain 15–20 variants');
  for (const definition of ashfallBuildingVariants) {
    if (ids.has(definition.id))
      issues.push(`duplicate variant ${definition.id}`);
    ids.add(definition.id);
    if (
      definition.footprint.some((value) => value <= 0) ||
      definition.height <= 0
    )
      issues.push(`${definition.id} has non-positive dimensions`);
    if (definition.uvMetersPerRepeat < 2 || definition.uvMetersPerRepeat > 8)
      issues.push(`${definition.id} UV density is outside the 2–8m policy`);
  }
  return issues;
}

export class AshfallBuildingRenderer {
  private readonly materials = new Map<string, Promise<MeshStandardMaterial>>();

  public constructor(
    private readonly assets: GameAssetLoader,
    private readonly resources: Set<BufferGeometry | Material>,
  ) {}

  public async create(visual: BuildingVisualDefinition): Promise<Group> {
    const definition = getAshfallBuildingVariant(visual.variantId);
    const group = new Group();
    group.name = `visual:${visual.id}`;
    group.userData.buildingVariantId = definition.id;
    group.userData.collisionFootprint = [...definition.footprint];
    group.userData.uvMetersPerRepeat = definition.uvMetersPerRepeat;
    const [wall, roof] = await Promise.all([
      this.wallMaterial(definition.wallMaterial),
      this.roofMaterial(),
    ]);
    for (const piece of massing(definition)) {
      const geometry = this.own(
        new BoxGeometry(piece.width, piece.height, piece.depth),
      );
      scaleUvs(
        geometry,
        Math.max(piece.width, piece.depth),
        piece.height,
        definition.uvMetersPerRepeat,
      );
      const mesh = new Mesh(geometry, wall);
      mesh.name = `building:${definition.id}:${piece.id}`;
      mesh.position.set(piece.x, piece.y + piece.height / 2, piece.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      const roofGeometry = this.own(
        new BoxGeometry(piece.width + 0.12, 0.14, piece.depth + 0.12),
      );
      scaleUvs(roofGeometry, piece.width, piece.depth, 4);
      const roofMesh = new Mesh(roofGeometry, roof);
      roofMesh.name = `building:${definition.id}:${piece.id}:roof`;
      roofMesh.position.set(piece.x, piece.y + piece.height + 0.07, piece.z);
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      group.add(roofMesh);
    }
    applyBuildingTransform(group, visual);
    return group;
  }

  private wallMaterial(id: AshfallWallMaterial): Promise<MeshStandardMaterial> {
    const textureId = {
      'concrete-deco': ashfallBuildingTextureIds.concreteDeco,
      'brick-stucco': ashfallBuildingTextureIds.brickStucco,
      'corrugated-teal': ashfallBuildingTextureIds.corrugatedTeal,
      'window-deco': ashfallBuildingTextureIds.windowDeco,
    }[id];
    return this.material(`wall:${id}`, textureId, 0.92);
  }

  private roofMaterial(): Promise<MeshStandardMaterial> {
    return this.material('roof', ashfallBuildingTextureIds.roofMembrane, 1);
  }

  private material(
    key: string,
    textureId: string,
    roughness: number,
  ): Promise<MeshStandardMaterial> {
    let pending = this.materials.get(key);
    if (!pending) {
      pending = this.assets.loadTexture(textureId).then((texture) => {
        configureTexture(texture);
        return this.own(
          new MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            roughness,
            metalness: key.includes('corrugated') ? 0.16 : 0.02,
          }),
        );
      });
      this.materials.set(key, pending);
    }
    return pending;
  }

  private own<Resource extends BufferGeometry | Material>(
    resource: Resource,
  ): Resource {
    this.resources.add(resource);
    return resource;
  }
}

interface MassingPiece {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

function massing(definition: AshfallBuildingVariant): readonly MassingPiece[] {
  const [width, depth] = definition.footprint;
  const height = definition.height;
  if (definition.profile === 'flat')
    return [{ id: 'shell', x: 0, y: 0, z: 0, width, depth, height }];
  if (definition.profile === 'stepped') {
    const lower = height * 0.62;
    return [
      { id: 'lower', x: 0, y: 0, z: 0, width, depth, height: lower },
      {
        id: 'upper',
        x: width * 0.08,
        y: lower,
        z: depth * 0.06,
        width: width * 0.72,
        depth: depth * 0.7,
        height: height - lower,
      },
    ];
  }
  if (definition.profile === 'setback') {
    const lower = height * 0.48;
    const middle = height * 0.3;
    return [
      { id: 'lower', x: 0, y: 0, z: 0, width, depth, height: lower },
      {
        id: 'middle',
        x: -width * 0.06,
        y: lower,
        z: depth * 0.05,
        width: width * 0.78,
        depth: depth * 0.76,
        height: middle,
      },
      {
        id: 'upper',
        x: width * 0.08,
        y: lower + middle,
        z: 0,
        width: width * 0.52,
        depth: depth * 0.5,
        height: height - lower - middle,
      },
    ];
  }
  const podium = height * 0.3;
  return [
    { id: 'podium', x: 0, y: 0, z: 0, width, depth, height: podium },
    {
      id: 'tower',
      x: width * 0.08,
      y: podium,
      z: -depth * 0.04,
      width: width * 0.58,
      depth: depth * 0.62,
      height: height - podium,
    },
  ];
}

function generatedTexture(file: string, title: string, material: string) {
  return {
    type: 'texture' as const,
    url: `/assets/environment/ashfall-buildings/${file}`,
    attribution: {
      title,
      creator: 'OpenAI image generation for Vanta City',
      license: 'Project-generated original',
    },
    metadata: {
      generated: true,
      sourceResolution: '1254x1254',
      runtimeResolution: '512x512',
      material,
      runtimeNetwork: false,
    },
  };
}

function variant(
  id: string,
  displayName: string,
  width: number,
  depth: number,
  height: number,
  wallMaterial: AshfallWallMaterial,
  profile: AshfallBuildingProfile,
): AshfallBuildingVariant {
  return {
    id,
    displayName,
    footprint: [width, depth],
    height,
    wallMaterial,
    profile,
    uvMetersPerRepeat: wallMaterial === 'corrugated-teal' ? 3 : 4,
  };
}

function configureTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

function scaleUvs(
  geometry: BoxGeometry,
  horizontalMeters: number,
  verticalMeters: number,
  metersPerRepeat: number,
): void {
  const uv = geometry.getAttribute('uv');
  const repeatX = horizontalMeters / metersPerRepeat;
  const repeatY = verticalMeters / metersPerRepeat;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * repeatX, uv.getY(index) * repeatY);
  }
  uv.needsUpdate = true;
}

function applyBuildingTransform(
  group: Group,
  visual: BuildingVisualDefinition,
): void {
  group.position.set(...visual.position);
  if (visual.rotation) group.rotation.set(...visual.rotation);
  if (visual.scale) group.scale.set(...visual.scale);
}
