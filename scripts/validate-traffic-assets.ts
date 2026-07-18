import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { assetManifest } from '../src/assets/catalog';
import { trafficVehicleCatalog } from '../src/traffic/TrafficVehicleCatalog';

const vehicleRoot = resolve('public/assets/vehicles');
const expected = {
  'pickup-truck.glb': {
    bytes: 273_012,
    sha256: '9d6b2e33af0d37bf42b2e7af850949f4efd0ddbb9a88077812d152d8b4c1c3eb',
    triangles: 6_432,
    materials: 3,
    textures: 1,
  },
  'sports-car.glb': {
    bytes: 171_300,
    sha256: '2878182e9a17b809d45b0a184f51560eab755b2d7e3058bf02acbd5fcd0ca78b',
    triangles: 3_066,
    materials: 7,
    textures: 0,
  },
} as const;

const localFiles = (await readdir(vehicleRoot, { recursive: true }))
  .filter((file) => file.endsWith('.glb'))
  .sort();
const catalogFiles = trafficVehicleCatalog
  .map(({ assetId }) => basename(assetManifest[assetId].url))
  .sort();
if (
  JSON.stringify(localFiles.map((file) => basename(file))) !==
  JSON.stringify(catalogFiles)
) {
  throw new Error(
    `Civilian vehicle audit mismatch: local=${localFiles.join(',')} catalog=${catalogFiles.join(',')}`,
  );
}

for (const definition of trafficVehicleCatalog) {
  const descriptor = assetManifest[definition.assetId];
  const file = basename(descriptor.url) as keyof typeof expected;
  const expectation = expected[file];
  if (!expectation) throw new Error(`${file}: missing integrity baseline`);
  const path = resolve('public', descriptor.url.replace(/^\//, ''));
  const bytes = await readFile(path);
  if (bytes.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`${file}: expected a binary glTF header`);
  }
  const declaredLength = bytes.readUInt32LE(8);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8'),
  ) as GlbJson;
  const sourceBounds = sceneBounds(json);
  const sourceSize = sourceBounds.getSize(new Vector3());
  const { presentation } = definition;
  const authoredLength = presentation.forwardAxis.endsWith('z')
    ? sourceSize.z
    : sourceSize.x;
  const scale = presentation.length / authoredLength;
  const normalizedWidth =
    (presentation.forwardAxis.endsWith('z') ? sourceSize.x : sourceSize.z) *
    scale;
  const normalizedHeight = sourceSize.y * scale;
  if (
    normalizedWidth > presentation.maximumWidth + 1e-3 ||
    normalizedHeight > presentation.maximumHeight + 1e-3
  ) {
    throw new Error(
      `${file}: normalized ${normalizedWidth.toFixed(3)}m wide × ${normalizedHeight.toFixed(3)}m high exceeds ${presentation.maximumWidth}m × ${presentation.maximumHeight}m contract`,
    );
  }
  if (presentation.staticSweepRadius > presentation.detectionWidth / 2) {
    throw new Error(`${file}: static sweep exceeds detector half-width`);
  }
  const actual = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    triangles: triangleCount(json),
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
  };
  if (declaredLength !== bytes.length) {
    throw new Error(
      `${file}: GLB declares ${declaredLength} bytes, read ${bytes.length}`,
    );
  }
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (actual[key] !== expectation[key]) {
      throw new Error(
        `${file}: expected ${key}=${expectation[key]}, received ${actual[key]}`,
      );
    }
  }
  console.log(
    `${definition.id}: ${file}, ${actual.triangles} triangles, source ${format(sourceSize)}m, normalized ${normalizedWidth.toFixed(2)}×${normalizedHeight.toFixed(2)}×${presentation.length.toFixed(2)}m, forward ${presentation.forwardAxis}, detector ${presentation.detectionWidth}×${presentation.detectionHeight}×${presentation.detectionLength}m, sha256 ${actual.sha256}`,
  );
}
console.log(
  `Audited ${localFiles.length} local civilian vehicle models; every file has exactly one runtime catalog entry.`,
);

interface GlbJson {
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
  readonly nodes?: readonly GlbNode[];
  readonly accessors?: readonly {
    readonly count?: number;
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly indices?: number;
      readonly mode?: number;
      readonly attributes: { readonly POSITION: number };
    }[];
  }[];
  readonly materials?: readonly unknown[];
  readonly textures?: readonly unknown[];
}

interface GlbNode {
  readonly mesh?: number;
  readonly children?: readonly number[];
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
}

function sceneBounds(json: GlbJson): Box3 {
  const bounds = new Box3().makeEmpty();
  const scene = json.scenes?.[json.scene ?? 0];
  for (const node of scene?.nodes ?? []) {
    addNodeBounds(json, node, new Matrix4(), bounds);
  }
  if (bounds.isEmpty()) throw new Error('GLB scene contains no bounded meshes');
  return bounds;
}

function addNodeBounds(
  json: GlbJson,
  nodeIndex: number,
  parent: Matrix4,
  bounds: Box3,
): void {
  const node = json.nodes?.[nodeIndex];
  if (!node) throw new Error(`GLB references missing node ${nodeIndex}`);
  const local = node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3().fromArray(node.translation ?? [0, 0, 0]),
        new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
        new Vector3().fromArray(node.scale ?? [1, 1, 1]),
      );
  const world = parent.clone().multiply(local);
  if (node.mesh !== undefined) {
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes.POSITION];
      if (!accessor?.min || !accessor.max) {
        throw new Error(`Mesh ${node.mesh} POSITION accessor lacks bounds`);
      }
      bounds.union(
        new Box3(
          new Vector3().fromArray(accessor.min),
          new Vector3().fromArray(accessor.max),
        ).applyMatrix4(world),
      );
    }
  }
  for (const child of node.children ?? [])
    addNodeBounds(json, child, world, bounds);
}

function triangleCount(json: GlbJson): number {
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.indices ?? primitive.attributes.POSITION;
      const count = json.accessors?.[accessorIndex]?.count ?? 0;
      triangles +=
        primitive.mode === 5 || primitive.mode === 6
          ? Math.max(0, count - 2)
          : Math.floor(count / 3);
    }
  }
  return triangles;
}

function format(vector: Vector3): string {
  return vector
    .toArray()
    .map((value) => value.toFixed(2))
    .join('×');
}
