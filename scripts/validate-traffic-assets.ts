import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const expected = [
  {
    file: 'pickup-truck.glb',
    bytes: 273_012,
    sha256: '9d6b2e33af0d37bf42b2e7af850949f4efd0ddbb9a88077812d152d8b4c1c3eb',
    triangles: 6_432,
    materials: 3,
    textures: 1,
  },
  {
    file: 'sports-car.glb',
    bytes: 171_300,
    sha256: '2878182e9a17b809d45b0a184f51560eab755b2d7e3058bf02acbd5fcd0ca78b',
    triangles: 3_066,
    materials: 7,
    textures: 0,
  },
] as const;

for (const asset of expected) {
  const path = resolve('public/assets/vehicles/quaternius-cars', asset.file);
  const bytes = await readFile(path);
  if (bytes.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`${asset.file}: expected a binary glTF header`);
  }
  const declaredLength = bytes.readUInt32LE(8);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8'),
  ) as GlbJson;
  const actual = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    triangles: triangleCount(json),
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
  };
  if (declaredLength !== bytes.length) {
    throw new Error(
      `${asset.file}: GLB declares ${declaredLength} bytes, read ${bytes.length}`,
    );
  }
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (actual[key] !== asset[key]) {
      throw new Error(
        `${asset.file}: expected ${key}=${asset[key]}, received ${actual[key]}`,
      );
    }
  }
  console.log(
    `${asset.file}: ${actual.bytes} bytes, ${actual.triangles} triangles, ${actual.materials} materials, ${actual.textures} textures, sha256 ${actual.sha256}`,
  );
}

interface GlbJson {
  readonly accessors?: readonly { readonly count?: number }[];
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
