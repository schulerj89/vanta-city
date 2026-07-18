import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ashfallBuildingAssets,
  ashfallBuildingVariants,
  validateAshfallBuildingKit,
} from '../src/world/buildings/AshfallBuildingKit';

const hashes = {
  'brick-stucco.generated.jpg':
    'eaaabe6a6426d2fcb74a05d67e0b22d24fb5c806fd98362c2a2c1cbe0b0c7f1f',
  'concrete-deco.generated.jpg':
    '139f002e9d40868e6d4fa2c97283cbf4d65f771d8bb2dbfd4c7d9c8a20e0f88d',
  'corrugated-teal.generated.jpg':
    'd17e8e3683bab5d1c26ba735f6e46386122238ffae8e2312274e4d8ea275200c',
  'curb-aggregate.generated.jpg':
    '74f297441c6d9dd93a33aa924e894cfb5652b7b1f4ba6e4b25cd95a992241fda',
  'roof-membrane.generated.jpg':
    'f1b970387b3b4c3fd83d9b475526fc86b3c7a98df799203c19acc781e7e1c0a5',
  'sidewalk-concrete.generated.jpg':
    'c3b85ce5949b7b667a468335f3ba2b03987072c44e72f3939579936ef226fb3e',
  'window-deco.generated.jpg':
    'ed4c12fccda5335d8d9bdd9bab5f88199a3b696236a52f63acb86cb19848600d',
} as const;

const issues = validateAshfallBuildingKit();
if (issues.length > 0) throw new Error(issues.join('\n'));
const variantCount: number = ashfallBuildingVariants.length;
if (variantCount !== 18) {
  throw new Error(`Expected 18 building variants, found ${variantCount}`);
}
if (Object.keys(ashfallBuildingAssets).length !== 7) {
  throw new Error('Expected exactly seven controlled streetscape textures');
}

let totalBytes = 0;
for (const [file, expectedHash] of Object.entries(hashes)) {
  const bytes = await readFile(
    resolve('public/assets/environment/ashfall-buildings', file),
  );
  totalBytes += bytes.byteLength;
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) throw new Error(`${file} hash mismatch`);
  const dimensions = jpegDimensions(bytes);
  if (dimensions.width !== 512 || dimensions.height !== 512) {
    throw new Error(
      `${file} must be 512x512, got ${dimensions.width}x${dimensions.height}`,
    );
  }
}
if (totalBytes > 700_000) {
  throw new Error(`Streetscape textures exceed 700KB budget: ${totalBytes}`);
}
for (const descriptor of Object.values(ashfallBuildingAssets)) {
  if (!descriptor.url.startsWith('/assets/environment/ashfall-buildings/')) {
    throw new Error(`Building texture is not local: ${descriptor.url}`);
  }
  if (descriptor.metadata.runtimeNetwork !== false) {
    throw new Error(
      `Building texture lacks no-network metadata: ${descriptor.url}`,
    );
  }
}

console.log(
  `Validated ${variantCount} variants and 7 generated 512px textures (${totalBytes} bytes).`,
);

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG');
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker !== undefined && marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new Error('JPEG dimensions were not found');
}
