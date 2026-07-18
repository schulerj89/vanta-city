import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  Box3,
  Quaternion,
  Vector3,
  type AnimationClip,
  type BufferGeometry,
  type KeyframeTrack,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { assetManifest } from '../../src/assets/catalog';
import type { AssetManifest } from '../../src/assets/AssetCatalog';
import type { CharacterDefinition } from '../../src/characters/CharacterDefinition';
import { characterDefinitionEntries } from '../../src/characters/characters';
import { npcCharacterDefinitions } from '../../src/npcs/npcs';
import { NodeCharacterAssetInspector } from '../character-validation/NodeCharacterAssetInspector';

interface AuditTarget {
  readonly participantId: string;
  readonly characterId: string;
  readonly role: string;
}

const targets: readonly AuditTarget[] = [
  { participantId: 'casual', characterId: 'casual', role: 'Rook / player' },
  { participantId: 'mack', characterId: 'npc-worker', role: 'Mack Bell' },
  { participantId: 'nox', characterId: 'npc-hoodie', role: 'Nox Arlen' },
  { participantId: 'raze', characterId: 'npc-punk', role: 'Raze Calder' },
  {
    participantId: 'pedestrian-casual',
    characterId: 'pedestrian-casual',
    role: 'Ambient pedestrian / potential scene extra',
  },
  {
    participantId: 'pedestrian-street',
    characterId: 'pedestrian-street',
    role: 'Ambient pedestrian / potential scene extra',
  },
  {
    participantId: 'pedestrian-tank-top',
    characterId: 'pedestrian-tank-top',
    role: 'Ambient pedestrian / potential scene extra',
  },
  {
    participantId: 'pedestrian-dress',
    characterId: 'pedestrian-dress',
    role: 'Ambient pedestrian / potential scene extra',
  },
];

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = resolve(
  projectRoot,
  'docs/animation/npc-performance-002-clip-inventory.json',
);
const definitions = new Map(
  [...characterDefinitionEntries, ...npcCharacterDefinitions].map(
    (definition) => [definition.id, definition] as const,
  ),
);
const manifest: AssetManifest = assetManifest;

async function main(): Promise<void> {
  const inspector = new NodeCharacterAssetInspector(projectRoot);
  const characters: ReturnType<typeof inspectCharacter>[] = [];
  for (const target of targets) {
    const definition = definitions.get(target.characterId);
    const modelAssetId = definition?.modelAssetId;
    if (!definition || !modelAssetId) {
      throw new Error(`Missing model definition for ${target.characterId}`);
    }
    const descriptor = manifest[modelAssetId];
    if (!descriptor || descriptor.type !== 'model') {
      throw new Error(`Missing model asset ${modelAssetId}`);
    }
    const inspection = await inspector.inspect(modelAssetId, descriptor);
    try {
      characters.push(
        inspectCharacter(
          target,
          definition,
          modelAssetId,
          inspection.scene,
          inspection.animations,
        ),
      );
    } finally {
      inspection.dispose();
    }
  }

  const rigGroups = new Map<string, ReturnType<typeof inspectCharacter>[]>();
  for (const character of characters) {
    const members = rigGroups.get(character.rig.hierarchySha256) ?? [];
    members.push(character);
    rigGroups.set(character.rig.hierarchySha256, members);
  }
  const rigFamilies = [...rigGroups.values()].map((members) => ({
    hierarchySha256: members[0].rig.hierarchySha256,
    characterIds: members.map(({ characterId }) => characterId),
    boneCount: members[0].rig.boneCount,
  }));
  const report = {
    schemaVersion: 1,
    auditId: 'npc-performance-002',
    scope: {
      relevantProductionGlbs: targets.length,
      runtimeNetworkAssets: false,
      notes: [
        'Metrics are generated from the committed GLBs with Three.js GLTFLoader; declared README clip tables are not used as inspection input.',
        'The definition source-forward assumption is inferred from its authored yaw correction; the visual audit is authoritative when that assumption disagrees with the rendered front.',
        'Loop closure compares first and last keyed values. It is a mechanical continuity signal, not proof that a clip is semantically appropriate.',
        'Body-root motion includes position tracks on the top three bone levels because these packs animate Body below a static Root bone.',
      ],
    },
    rigFamilies,
    characters,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    await format(JSON.stringify(report), { parser: 'json' }),
  );
  console.log(
    `Wrote ${relative(projectRoot, outputPath)} for ${characters.length} character GLBs across ${rigFamilies.length} rig families.`,
  );
}

function inspectCharacter(
  target: AuditTarget,
  definition: CharacterDefinition,
  modelAssetId: string,
  sourceScene: Object3D,
  clips: readonly AnimationClip[],
) {
  const boneEntries = inspectBoneHierarchy(sourceScene);
  const boneNames = new Set(boneEntries.map(({ name }) => name));
  const centralBoneNames = new Set(
    boneEntries.filter(({ depth }) => depth <= 2).map(({ name }) => name),
  );
  const sceneRootNames = new Set(['', sourceScene.name]);
  const skeletonRootNames = new Set(
    boneEntries.filter(({ depth }) => depth === 0).map(({ name }) => name),
  );
  const sourceBounds = boundsOf(sourceScene);
  const transformed = cloneSkeleton(sourceScene);
  applyDefinitionTransform(transformed, definition);
  const runtimeBounds = boundsOf(transformed);
  transformed.clear();
  const geometry = inspectGeometry(sourceScene);
  const materials = inspectMaterials(sourceScene);
  const mappings = Object.fromEntries(
    Object.entries(definition.animations ?? {}).map(([logical, binding]) => {
      const resolved = binding.clipNames.find((name) =>
        clips.some((clip) => clip.name === name),
      );
      return [
        logical,
        {
          required: binding.required ?? false,
          candidates: [...binding.clipNames],
          resolved: resolved ?? null,
        },
      ];
    }),
  );
  const yawCorrection = definition.transform?.rotation?.[1] ?? 0;
  return {
    participantId: target.participantId,
    characterId: definition.id,
    role: target.role,
    displayName: definition.displayName,
    modelAssetId,
    sourcePath: manifest[modelAssetId].url,
    transform: {
      scale: scaleTuple(definition),
      rotationRadians: definition.transform?.rotation ?? [0, 0, 0],
      sourceUpAxis: '+Y (glTF)',
      definitionSourceForwardAssumption: approximatelyPi(yawCorrection)
        ? '-Z'
        : '+Z',
      intendedRuntimeForwardAxis: '+Z',
      assumptionBasis: 'authored CharacterDefinition yaw correction',
    },
    bounds: {
      source: sourceBounds,
      runtime: runtimeBounds,
      groundedVisualOffset: round(-runtimeBounds.min[1]),
    },
    geometry,
    materials,
    rig: {
      boneCount: boneEntries.length,
      hierarchySha256: sha256(
        boneEntries
          .map(({ name, parent, depth }) => `${depth}:${parent ?? ''}>${name}`)
          .join('\n'),
      ),
      skeletonRootBones: [...skeletonRootNames],
      headNeckBones: boneEntries
        .map(({ name }) => name)
        .filter((name) => /head|neck/i.test(name)),
      facialControlBones: boneEntries
        .map(({ name }) => name)
        .filter((name) => /eye|jaw|mouth|brow|lip|cheek|nose/i.test(name)),
      morphTargetCount: geometry.morphTargetCount,
    },
    logicalMappings: mappings,
    clips: clips
      .map((clip) =>
        inspectClip(
          clip,
          boneNames,
          centralBoneNames,
          sceneRootNames,
          skeletonRootNames,
          boneEntries.length,
        ),
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function inspectClip(
  clip: AnimationClip,
  boneNames: ReadonlySet<string>,
  centralBoneNames: ReadonlySet<string>,
  sceneRootNames: ReadonlySet<string>,
  skeletonRootNames: ReadonlySet<string>,
  boneCount: number,
) {
  const parsedTracks = clip.tracks.map((track) => ({
    track,
    ...parseTrackName(track.name),
  }));
  const animatedBones = new Set(
    parsedTracks
      .map(({ target }) => target)
      .filter((target) => boneNames.has(target)),
  );
  const positionTracks = parsedTracks.filter(
    ({ property }) => property === 'position',
  );
  const rootMotion = (targets: ReadonlySet<string>) =>
    summarizePositionMotion(
      positionTracks.filter(({ target }) => targets.has(target)),
    );
  const loopClosure = summarizeLoopClosure(
    parsedTracks.map(({ track }) => track),
  );
  return {
    name: clip.name,
    durationSeconds: round(clip.duration),
    playbackIntent: playbackIntent(clip.name),
    loopClosure,
    trackCoverage: {
      totalTracks: clip.tracks.length,
      positionTracks: positionTracks.length,
      quaternionTracks: parsedTracks.filter(
        ({ property }) => property === 'quaternion',
      ).length,
      scaleTracks: parsedTracks.filter(({ property }) => property === 'scale')
        .length,
      animatedBoneCount: animatedBones.size,
      animatedBoneCoverage: round(animatedBones.size / Math.max(1, boneCount)),
      animatedBones: [...animatedBones].sort(),
      nonBoneTargets: [
        ...new Set(
          parsedTracks
            .map(({ target }) => target)
            .filter((target) => !boneNames.has(target)),
        ),
      ].sort(),
    },
    rootMotion: {
      sceneRoot: rootMotion(sceneRootNames),
      skeletonRoot: rootMotion(skeletonRootNames),
      bodyRoot: rootMotion(centralBoneNames),
      anyPositionTrack: summarizePositionMotion(positionTracks),
    },
  };
}

function inspectBoneHierarchy(scene: Object3D) {
  const entries: { name: string; parent: string | null; depth: number }[] = [];
  scene.traverse((object) => {
    if (!('isBone' in object) || object.isBone !== true) return;
    let parent = object.parent;
    let depth = 0;
    while (parent && 'isBone' in parent && parent.isBone === true) {
      depth += 1;
      parent = parent.parent;
    }
    const directBoneParent =
      object.parent &&
      'isBone' in object.parent &&
      object.parent.isBone === true
        ? object.parent.name
        : null;
    entries.push({ name: object.name, parent: directBoneParent, depth });
  });
  return entries;
}

function inspectGeometry(scene: Object3D) {
  let meshCount = 0;
  let skinnedMeshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let morphTargetCount = 0;
  scene.traverse((object) => {
    if (!isMesh(object)) return;
    meshCount += 1;
    if ('isSkinnedMesh' in object && object.isSkinnedMesh === true)
      skinnedMeshCount += 1;
    const geometry = object.geometry;
    const positions = geometry.getAttribute('position');
    vertexCount += positions?.count ?? 0;
    triangleCount += geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor((positions?.count ?? 0) / 3);
    morphTargetCount += Object.values(geometry.morphAttributes).reduce<number>(
      (total, attributes) => total + (attributes?.length ?? 0),
      0,
    );
  });
  return {
    meshCount,
    skinnedMeshCount,
    vertexCount,
    triangleCount,
    morphTargetCount,
  };
}

function inspectMaterials(scene: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!isMesh(object)) return;
    const candidates = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of candidates) {
      materials.add(material);
      for (const value of Object.values(
        material as unknown as Record<string, unknown>,
      )) {
        if (isTexture(value)) textures.add(value);
      }
    }
  });
  return {
    materialCount: materials.size,
    textureCount: textures.size,
    shading: textures.size === 0 ? 'solid-color materials' : 'textured',
  };
}

function summarizePositionMotion(
  tracks: readonly { readonly track: KeyframeTrack }[],
) {
  let horizontal = 0;
  let vertical = 0;
  const trackNames: string[] = [];
  for (const { track } of tracks) {
    if (track.values.length < 3) continue;
    trackNames.push(track.name);
    const origin = new Vector3(
      Number(track.values[0]),
      Number(track.values[1]),
      Number(track.values[2]),
    );
    for (let index = 3; index + 2 < track.values.length; index += 3) {
      const x = Number(track.values[index]);
      const y = Number(track.values[index + 1]);
      const z = Number(track.values[index + 2]);
      horizontal = Math.max(horizontal, Math.hypot(x - origin.x, z - origin.z));
      vertical = Math.max(vertical, Math.abs(y - origin.y));
    }
  }
  return {
    tracks: trackNames.sort(),
    maxHorizontalDisplacement: round(horizontal),
    maxVerticalDisplacement: round(vertical),
  };
}

function summarizeLoopClosure(tracks: readonly KeyframeTrack[]) {
  let position = 0;
  let quaternionRadians = 0;
  let scale = 0;
  for (const track of tracks) {
    const { property } = parseTrackName(track.name);
    const itemSize = track.getValueSize();
    if (track.values.length < itemSize * 2) continue;
    const last = track.values.length - itemSize;
    if (property === 'quaternion' && itemSize === 4) {
      const firstQ = new Quaternion(
        Number(track.values[0]),
        Number(track.values[1]),
        Number(track.values[2]),
        Number(track.values[3]),
      ).normalize();
      const lastQ = new Quaternion(
        Number(track.values[last]),
        Number(track.values[last + 1]),
        Number(track.values[last + 2]),
        Number(track.values[last + 3]),
      ).normalize();
      quaternionRadians = Math.max(
        quaternionRadians,
        2 * Math.acos(Math.min(1, Math.abs(firstQ.dot(lastQ)))),
      );
      continue;
    }
    let deltaSquared = 0;
    for (let index = 0; index < itemSize; index += 1) {
      const delta =
        Number(track.values[index]) - Number(track.values[last + index]);
      deltaSquared += delta * delta;
    }
    const delta = Math.sqrt(deltaSquared);
    if (property === 'position') position = Math.max(position, delta);
    if (property === 'scale') scale = Math.max(scale, delta);
  }
  const maxPositionEndpointDelta = round(position);
  const maxQuaternionEndpointDeltaRadians = round(quaternionRadians);
  const maxScaleEndpointDelta = round(scale);
  return {
    maxPositionEndpointDelta,
    maxQuaternionEndpointDeltaRadians,
    maxScaleEndpointDelta,
    mechanicallyClosed:
      maxPositionEndpointDelta <= 0.01 &&
      maxQuaternionEndpointDeltaRadians <= 0.05 &&
      maxScaleEndpointDelta <= 0.01,
  };
}

function parseTrackName(name: string): { target: string; property: string } {
  const separator = name.lastIndexOf('.');
  if (separator < 0) return { target: '', property: name };
  return {
    target: name.slice(0, separator),
    property: name.slice(separator + 1),
  };
}

function playbackIntent(name: string): 'repeat' | 'one-shot' {
  return /(?:Idle|Walk|Run|Sitting)(?:$|_)/i.test(name) &&
    !/(?:Jump|Shoot|Slash)/i.test(name)
    ? 'repeat'
    : 'one-shot';
}

function boundsOf(root: Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  return {
    min: bounds.min.toArray().map(round),
    max: bounds.max.toArray().map(round),
    size: size.toArray().map(round),
  };
}

function applyDefinitionTransform(
  root: Object3D,
  definition: CharacterDefinition,
): void {
  const transform = definition.transform;
  if (!transform) return;
  if (typeof transform.scale === 'number')
    root.scale.setScalar(transform.scale);
  else if (transform.scale) root.scale.set(...transform.scale);
  if (transform.rotation) root.rotation.set(...transform.rotation);
  if (transform.forwardAxisCorrection)
    root.rotation.y += transform.forwardAxisCorrection;
  if (transform.offset) root.position.set(...transform.offset);
  root.updateMatrixWorld(true);
}

function scaleTuple(
  definition: CharacterDefinition,
): readonly [number, number, number] {
  const scale = definition.transform?.scale ?? 1;
  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function approximatelyPi(value: number): boolean {
  return Math.abs(Math.abs(value) - Math.PI) < 0.001;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function isMesh(
  object: Object3D,
): object is Mesh<BufferGeometry, Material | Material[]> {
  return 'isMesh' in object && object.isMesh === true;
}

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    value.isTexture === true
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
