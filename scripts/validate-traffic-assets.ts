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
    sourceSize: [2.312174, 1.848446, 5.180381],
  },
  'sports-car.glb': {
    bytes: 171_300,
    sha256: '2878182e9a17b809d45b0a184f51560eab755b2d7e3058bf02acbd5fcd0ca78b',
    triangles: 3_066,
    materials: 7,
    textures: 0,
    sourceSize: [1.804519, 1.155404, 3.968707],
  },
  'sport-coupe.glb': {
    bytes: 175_100,
    sha256: 'bbb1c718d2aaf5f4344e9fb2cd66d8332a998a515b09ddd4dfa14698d787124e',
    triangles: 3_148,
    materials: 6,
    textures: 0,
    sourceSize: [1.871591, 1.203055, 3.926533],
  },
  'family-sedan.glb': {
    bytes: 164_752,
    sha256: 'bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462',
    triangles: 2_954,
    materials: 6,
    textures: 0,
    sourceSize: [1.80736, 1.176579, 4.220717],
  },
  'taxi-sedan.glb': {
    bytes: 181_084,
    sha256: '14b2f982f8a501565702ecb56f917c82e9abae914fa3f76d2f622a8670598af1',
    triangles: 3_278,
    materials: 6,
    textures: 0,
    sourceSize: [1.80736, 1.310465, 4.220717],
  },
  'suv.glb': {
    bytes: 181_608,
    sha256: '1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6',
    triangles: 3_294,
    materials: 6,
    textures: 0,
    sourceSize: [2.111102, 1.527851, 4.209349],
  },
  'compact-wagon.glb': {
    bytes: 174_320,
    sha256: 'e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39',
    triangles: 3_124,
    materials: 7,
    textures: 0,
    sourceSize: [1.638448, 1.145616, 3.309623],
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
  validateEmbeddedGlb(file, bytes, jsonLength, json);
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
  expectation.sourceSize.forEach((value, index) => {
    if (Math.abs(sourceSize.getComponent(index) - value) > 1e-5) {
      throw new Error(
        `${file}: source bound axis ${index} expected ${value}, received ${sourceSize.getComponent(index)}`,
      );
    }
  });
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
  readonly images?: readonly {
    readonly uri?: string;
    readonly bufferView?: number;
  }[];
  readonly buffers?: readonly {
    readonly uri?: string;
    readonly byteLength: number;
  }[];
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

function validateEmbeddedGlb(
  file: string,
  bytes: Buffer,
  jsonLength: number,
  json: GlbJson,
): void {
  if (bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${file}: expected glTF 2.0`);
  }
  if (bytes.toString('ascii', 16, 20) !== 'JSON') {
    throw new Error(`${file}: malformed JSON chunk`);
  }
  const binaryOffset = 20 + jsonLength;
  if (binaryOffset + 8 > bytes.length) {
    throw new Error(`${file}: missing binary chunk`);
  }
  const binaryLength = bytes.readUInt32LE(binaryOffset);
  if (bytes.toString('ascii', binaryOffset + 4, binaryOffset + 8) !== 'BIN\0') {
    throw new Error(`${file}: malformed binary chunk`);
  }
  if (binaryOffset + 8 + binaryLength !== bytes.length) {
    throw new Error(`${file}: binary chunk does not consume the GLB`);
  }
  if ((json.buffers ?? []).length !== 1 || json.buffers?.[0]?.uri) {
    throw new Error(`${file}: runtime geometry must use one embedded buffer`);
  }
  if ((json.images ?? []).some(({ uri }) => uri !== undefined)) {
    throw new Error(`${file}: runtime images must be embedded buffer views`);
  }
}

function format(vector: Vector3): string {
  return vector
    .toArray()
    .map((value) => value.toFixed(2))
    .join('×');
}
