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
import { cloneSectorOwnedTexture } from '../SectorTextureOwnership';

export type AshfallWallMaterial =
  | 'concrete-deco'
  | 'brick-stucco'
  | 'corrugated-teal'
  | 'window-deco'
  | 'ribbed-zinc'
  | 'ceramic-tile'
  | 'glass-block'
  | 'painted-shopfront';

export type AshfallBuildingProfile =
  'flat' | 'stepped' | 'setback' | 'tower' | 'sawtooth';

export type AshfallBuildingFrontage =
  | 'plain'
  | 'transit'
  | 'institutional'
  | 'service-bays'
  | 'shopfront'
  | 'residential'
  | 'corner-shop';

export interface AshfallBuildingEntrance {
  /** Horizontal offset from the local +Z frontage centre. */
  readonly offsetX: number;
  readonly width: number;
  readonly height: number;
}

export interface AshfallBuildingVariant {
  readonly id: string;
  readonly displayName: string;
  readonly footprint: readonly [width: number, depth: number];
  readonly height: number;
  readonly wallMaterial: AshfallWallMaterial;
  readonly frontageMaterial: AshfallWallMaterial;
  readonly profile: AshfallBuildingProfile;
  /** Every entrance is authored on local +Z before placement rotation. */
  readonly frontage: AshfallBuildingFrontage;
  readonly entrances: readonly AshfallBuildingEntrance[];
  readonly localFrontage: readonly [0, 0, 1];
  /** World metres represented by one texture repeat. */
  readonly uvMetersPerRepeat: number;
}

export const ashfallBuildingTextureIds = {
  concreteDeco: 'environment.ashfall-building.concrete-deco',
  brickStucco: 'environment.ashfall-building.brick-stucco',
  corrugatedTeal: 'environment.ashfall-building.corrugated-teal',
  windowDeco: 'environment.ashfall-building.window-deco',
  roofMembrane: 'environment.ashfall-building.roof-membrane',
  sidewalkConcrete: 'environment.ashfall-building.sidewalk-concrete',
  curbAggregate: 'environment.ashfall-building.curb-aggregate',
  ribbedZinc: 'environment.ashfall-building.ribbed-zinc',
  ceramicTile: 'environment.ashfall-building.ceramic-tile',
  glassBlock: 'environment.ashfall-building.glass-block',
  paintedShopfront: 'environment.ashfall-building.painted-shopfront',
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
  [ashfallBuildingTextureIds.sidewalkConcrete]: generatedTexture(
    'sidewalk-concrete.generated.jpg',
    'Ashfall salt-weathered scored concrete sidewalk',
    'sidewalk-concrete',
  ),
  [ashfallBuildingTextureIds.curbAggregate]: generatedTexture(
    'curb-aggregate.generated.jpg',
    'Ashfall salt-weathered aggregate curb',
    'curb-aggregate',
  ),
  [ashfallBuildingTextureIds.ribbedZinc]: proceduralTexture(
    'ribbed-zinc.procedural.jpg',
    'Ashfall salt-weathered ribbed zinc',
    'ribbed-zinc',
  ),
  [ashfallBuildingTextureIds.ceramicTile]: proceduralTexture(
    'ceramic-tile.procedural.jpg',
    'Ashfall glazed ceramic facade tile',
    'ceramic-tile',
  ),
  [ashfallBuildingTextureIds.glassBlock]: proceduralTexture(
    'glass-block.procedural.jpg',
    'Ashfall smoked glass block',
    'glass-block',
  ),
  [ashfallBuildingTextureIds.paintedShopfront]: proceduralTexture(
    'painted-shopfront.procedural.jpg',
    'Ashfall painted shopfront panels',
    'painted-shopfront',
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
  variant(
    'arrival-shed',
    'Arrival Shed',
    22,
    12,
    9,
    'ribbed-zinc',
    'sawtooth',
    {
      frontage: 'transit',
      frontageMaterial: 'glass-block',
      entrances: [
        entrance(-6.2, 2.6, 3.2),
        entrance(0, 3.2, 3.4),
        entrance(6.2, 2.6, 3.2),
      ],
    },
  ),
  variant(
    'ticket-arcade',
    'Ticket Arcade',
    14,
    8,
    7,
    'ceramic-tile',
    'stepped',
    {
      frontage: 'institutional',
      frontageMaterial: 'glass-block',
      entrances: [entrance(0, 2.4, 3)],
    },
  ),
  variant(
    'garage-six-bay',
    'Garage Six Bay',
    20,
    10,
    8,
    'corrugated-teal',
    'flat',
    {
      frontage: 'service-bays',
      frontageMaterial: 'ribbed-zinc',
      entrances: [
        entrance(-6.4, 3, 3.8),
        entrance(0, 3, 3.8),
        entrance(6.4, 3, 3.8),
      ],
    },
  ),
  variant('print-house', 'Print House', 16, 9, 10, 'brick-stucco', 'stepped', {
    frontage: 'shopfront',
    frontageMaterial: 'painted-shopfront',
    entrances: [entrance(-4.8, 2.2, 3), entrance(4.8, 2.2, 3)],
  }),
  variant(
    'boarding-court',
    'Boarding Court',
    12,
    16,
    15,
    'brick-stucco',
    'setback',
    {
      frontage: 'residential',
      frontageMaterial: 'ceramic-tile',
      entrances: [entrance(0, 2.4, 3.2)],
    },
  ),
  variant(
    'corner-chemist',
    'Corner Chemist',
    9,
    11,
    9,
    'ceramic-tile',
    'stepped',
    {
      frontage: 'corner-shop',
      frontageMaterial: 'painted-shopfront',
      entrances: [entrance(2.4, 2.1, 2.9)],
    },
  ),
  variant('cold-store', 'Cold Store', 20, 14, 12, 'ribbed-zinc', 'setback', {
    frontage: 'service-bays',
    frontageMaterial: 'glass-block',
    entrances: [entrance(-5.8, 3.4, 4), entrance(5.8, 3.4, 4)],
  }),
  variant(
    'municipal-annex',
    'Municipal Annex',
    16,
    12,
    16,
    'concrete-deco',
    'tower',
    {
      frontage: 'institutional',
      frontageMaterial: 'glass-block',
      entrances: [entrance(0, 2.6, 3.4)],
    },
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
  if (ashfallBuildingVariants.length !== 26)
    issues.push('kit must contain exactly 26 variants');
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
    if (definition.localFrontage.join(',') !== '0,0,1')
      issues.push(`${definition.id} frontage must face local +Z`);
    for (const entrance of definition.entrances) {
      if (entrance.width < 1.8 || entrance.height <= 0)
        issues.push(`${definition.id} has an unusable entrance`);
      if (
        Math.abs(entrance.offsetX) + entrance.width / 2 >
        definition.footprint[0] / 2
      )
        issues.push(`${definition.id} entrance extends beyond its frontage`);
    }
  }
  return issues;
}

export class AshfallBuildingRenderer {
  private readonly materials = new Map<string, Promise<MeshStandardMaterial>>();

  public constructor(
    private readonly assets: GameAssetLoader,
    private readonly resources: Set<BufferGeometry | Material>,
    private readonly ownedTextures: Set<Texture>,
  ) {}

  public async create(visual: BuildingVisualDefinition): Promise<Group> {
    const definition = getAshfallBuildingVariant(visual.variantId);
    const group = new Group();
    group.name = `visual:${visual.id}`;
    group.userData.buildingVariantId = definition.id;
    group.userData.collisionFootprint = [...definition.footprint];
    group.userData.uvMetersPerRepeat = definition.uvMetersPerRepeat;
    group.userData.localFrontage = [...definition.localFrontage];
    group.userData.entrances = definition.entrances.map((entry) => ({
      ...entry,
    }));
    const [wall, frontage, roof] = await Promise.all([
      this.wallMaterial(definition.wallMaterial),
      this.wallMaterial(definition.frontageMaterial),
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
      mesh.userData.ashfallLod = 'shell';
      group.add(mesh);

      if (
        piece.id === 'shell' ||
        piece.id === 'lower' ||
        piece.id === 'podium'
      ) {
        const corniceGeometry = this.own(
          new BoxGeometry(piece.width, 0.18, piece.depth),
        );
        scaleUvs(
          corniceGeometry,
          piece.width,
          0.18,
          definition.uvMetersPerRepeat,
        );
        const cornice = new Mesh(corniceGeometry, wall);
        cornice.name = `building:${definition.id}:${piece.id}:cornice`;
        cornice.position.set(piece.x, piece.y + piece.height - 0.18, piece.z);
        cornice.castShadow = true;
        cornice.receiveShadow = true;
        cornice.userData.ashfallLod = 'far-detail';
        group.add(cornice);
      }

      const roofGeometry = this.own(
        new BoxGeometry(piece.width, 0.14, piece.depth),
      );
      scaleUvs(roofGeometry, piece.width, piece.depth, 4);
      const roofMesh = new Mesh(roofGeometry, roof);
      roofMesh.name = `building:${definition.id}:${piece.id}:roof`;
      roofMesh.position.set(piece.x, piece.y + piece.height - 0.07, piece.z);
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      roofMesh.userData.ashfallLod = 'far-detail';
      group.add(roofMesh);
    }
    this.addFrontage(group, definition, frontage);
    applyBuildingTransform(group, visual);
    return group;
  }

  private addFrontage(
    group: Group,
    definition: AshfallBuildingVariant,
    material: MeshStandardMaterial,
  ): void {
    const [width, depth] = definition.footprint;
    const bandHeight = Math.min(1.05, definition.height * 0.14);
    const band = new Mesh(
      this.own(new BoxGeometry(width * 0.9, bandHeight, 0.12)),
      material,
    );
    band.name = `building:${definition.id}:frontage-band:cornice`;
    band.position.set(
      0,
      Math.min(definition.height * 0.55, 4.6),
      depth / 2 - 0.07,
    );
    band.castShadow = true;
    band.receiveShadow = true;
    band.userData.ashfallLod = 'near-detail';
    group.add(band);

    for (const [index, entry] of definition.entrances.entries()) {
      const geometry = this.own(
        new BoxGeometry(entry.width, entry.height, 0.14),
      );
      scaleUvs(
        geometry,
        entry.width,
        entry.height,
        definition.uvMetersPerRepeat,
      );
      const bay = new Mesh(geometry, material);
      bay.name = `building:${definition.id}:entrance-${index}:cornice`;
      bay.position.set(entry.offsetX, entry.height / 2, depth / 2 - 0.08);
      bay.castShadow = true;
      bay.receiveShadow = true;
      bay.userData.ashfallLod = 'near-detail';
      bay.userData.entrance = true;
      bay.userData.localFrontage = [0, 0, 1];
      group.add(bay);
    }
  }

  private wallMaterial(id: AshfallWallMaterial): Promise<MeshStandardMaterial> {
    const textureId = {
      'concrete-deco': ashfallBuildingTextureIds.concreteDeco,
      'brick-stucco': ashfallBuildingTextureIds.brickStucco,
      'corrugated-teal': ashfallBuildingTextureIds.corrugatedTeal,
      'window-deco': ashfallBuildingTextureIds.windowDeco,
      'ribbed-zinc': ashfallBuildingTextureIds.ribbedZinc,
      'ceramic-tile': ashfallBuildingTextureIds.ceramicTile,
      'glass-block': ashfallBuildingTextureIds.glassBlock,
      'painted-shopfront': ashfallBuildingTextureIds.paintedShopfront,
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
      pending = this.assets.loadTexture(textureId).then((sourceTexture) => {
        const texture = cloneSectorOwnedTexture(sourceTexture);
        configureAshfallTexture(texture);
        this.ownedTextures.add(texture);
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
  if (definition.profile === 'sawtooth') {
    const shellHeight = height * 0.72;
    const monitorWidth = width / 4;
    return [
      { id: 'shell', x: 0, y: 0, z: 0, width, depth, height: shellHeight },
      ...[-1.5, -0.5, 0.5, 1.5].map((step, index) => ({
        id: `monitor-${index}`,
        x: step * monitorWidth,
        y: shellHeight,
        z: -depth * 0.08,
        width: monitorWidth * 0.82,
        depth: depth * 0.72,
        height: height - shellHeight,
      })),
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

function proceduralTexture(file: string, title: string, material: string) {
  return {
    type: 'texture' as const,
    url: `/assets/environment/ashfall-buildings/${file}`,
    attribution: {
      title,
      creator: 'Vanta City deterministic texture generator',
      license: 'Project-generated original',
    },
    metadata: {
      generated: true,
      procedural: true,
      sourceResolution: '512x512',
      runtimeResolution: '512x512',
      material,
      runtimeNetwork: false,
    },
  };
}

interface VariantOptions {
  readonly frontage?: AshfallBuildingFrontage;
  readonly frontageMaterial?: AshfallWallMaterial;
  readonly entrances?: readonly AshfallBuildingEntrance[];
}

function variant(
  id: string,
  displayName: string,
  width: number,
  depth: number,
  height: number,
  wallMaterial: AshfallWallMaterial,
  profile: AshfallBuildingProfile,
  options: VariantOptions = {},
): AshfallBuildingVariant {
  return {
    id,
    displayName,
    footprint: [width, depth],
    height,
    wallMaterial,
    frontageMaterial: options.frontageMaterial ?? wallMaterial,
    profile,
    frontage: options.frontage ?? 'plain',
    entrances: options.entrances ?? [
      entrance(0, 2, Math.min(3, height * 0.45)),
    ],
    localFrontage: [0, 0, 1],
    uvMetersPerRepeat: wallMaterial === 'corrugated-teal' ? 3 : 4,
  };
}

function entrance(
  offsetX: number,
  width: number,
  height: number,
): AshfallBuildingEntrance {
  return { offsetX, width, height };
}

export function configureAshfallTexture(texture: Texture): void {
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
