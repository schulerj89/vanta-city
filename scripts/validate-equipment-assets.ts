import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Box3 } from 'three';
import type { BufferGeometry, Material, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetManifest } from '../src/assets/catalog';

const expected = [
  {
    id: 'equipment.handgun.model',
    file: 'public/assets/equipment/kenney-weapon-pack/handgun.glb',
    bytes: 24_164,
    sha256: 'd5d97d022b96d297171bce94dff5e8913230095c9271eec81133d6252dff66bd',
    meshes: 4,
    triangles: 350,
    materials: 3,
    textures: 0,
  },
  {
    id: 'equipment.knife.model',
    file: 'public/assets/equipment/kenney-weapon-pack/knife.glb',
    bytes: 11_672,
    sha256: 'd2ed34ad2bc09f40f4f6918163dadcb34771a18764c67c99fa5cc38893cfd4c8',
    meshes: 4,
    triangles: 98,
    materials: 4,
    textures: 0,
  },
] as const;

for (const expectation of expected) {
  const descriptor = assetManifest[expectation.id];
  assert(descriptor, `${expectation.id}: missing catalog descriptor`);
  assert.equal(descriptor.type, 'model');
  assert.equal(descriptor.attribution?.license, 'CC0 1.0 Universal');
  assert.equal(
    descriptor.attribution?.licenseUrl,
    'https://creativecommons.org/publicdomain/zero/1.0/',
  );
  assert.equal(
    descriptor.attribution?.sourceUrl,
    'https://opengameart.org/content/weapon-pack',
  );

  const bytes = await readFile(resolve(expectation.file));
  assert.equal(bytes.byteLength, expectation.bytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    expectation.sha256,
  );
  assert.equal(bytes.subarray(0, 4).toString('utf8'), 'glTF');
  const json = readGlbJson(bytes);
  assert(
    (json.buffers ?? []).every((buffer) => buffer.uri === undefined),
    `${expectation.id}: GLB must not reference external buffers`,
  );
  assert(
    (json.images ?? []).every((image) => image.uri === undefined),
    `${expectation.id}: GLB must not reference external images`,
  );

  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  const metrics = inspect(gltf.scene);
  assert.deepEqual(metrics, {
    meshes: expectation.meshes,
    triangles: expectation.triangles,
    materials: expectation.materials,
    textures: expectation.textures,
  });
  const bounds = new Box3().setFromObject(gltf.scene);
  assert(!bounds.isEmpty(), `${expectation.id}: model bounds are empty`);
  console.log(
    `${expectation.id}: ${expectation.bytes} bytes, ${metrics.triangles} triangles, ${metrics.materials} materials, ${metrics.textures} textures`,
  );
}

type GlbJson = {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string }[];
};

function readGlbJson(bytes: Buffer): GlbJson {
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.toString('ascii', 16, 20);
  assert.equal(jsonType, 'JSON');
  return JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as GlbJson;
}

function inspect(root: Object3D): {
  readonly meshes: number;
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
} {
  let meshes = 0;
  let triangles = 0;
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!('geometry' in object) || !isGeometry(object.geometry)) return;
    meshes += 1;
    triangles += (object.geometry.index?.count ?? 0) / 3;
    const candidates =
      'material' in object
        ? Array.isArray(object.material)
          ? object.material
          : [object.material]
        : [];
    for (const material of candidates) {
      if (!isMaterial(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (isTexture(value)) textures.add(value);
      }
    }
  });
  return {
    meshes,
    triangles,
    materials: materials.size,
    textures: textures.size,
  };
}

function isGeometry(value: unknown): value is BufferGeometry {
  return Boolean(
    value && typeof value === 'object' && 'isBufferGeometry' in value,
  );
}

function isMaterial(value: unknown): value is Material {
  return Boolean(value && typeof value === 'object' && 'isMaterial' in value);
}

function isTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === 'object' && 'isTexture' in value);
}
