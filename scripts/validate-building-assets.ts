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
  'ribbed-zinc.procedural.jpg':
    '12d3128fe4e4cc1e8b14710b84de107d0c0aadf07206766dab386736268e9b13',
  'ceramic-tile.procedural.jpg':
    'fed1b8be96bbd2cd50f7bd67b53921b8fff58b50b41ca59c7f0fcb9f21b8fe7a',
  'glass-block.procedural.jpg':
    'e1ee7d0be134cb93dc106dac94e4a101a914e42a09d4b31bec5e94f35d4a214f',
  'painted-shopfront.procedural.jpg':
    '89c52be626dfcb4a371699c877079a005215b3e8ee4208f04df74f6799d643a9',
  'venue-terrazzo.procedural.jpg':
    '9e5ccef8ca182d4b4a83f2658ffee3f68a0abd64b8437684e3409be5f4a8dbf2',
  'home-linoleum.procedural.jpg':
    'b923bf21c8a83ba328840cca4774847a075af1a7903d059d59b285eb91a57df4',
} as const;

const issues = validateAshfallBuildingKit();
if (issues.length > 0) throw new Error(issues.join('\n'));
const variantCount: number = ashfallBuildingVariants.length;
if (variantCount !== 26) {
  throw new Error(`Expected 26 building variants, found ${variantCount}`);
}
if (Object.keys(ashfallBuildingAssets).length !== 13) {
  throw new Error('Expected exactly thirteen controlled streetscape textures');
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
if (totalBytes > 1_153_433) {
  throw new Error(`Streetscape textures exceed 1.1MiB budget: ${totalBytes}`);
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
  `Validated ${variantCount} variants and 13 local 512px textures (${totalBytes} bytes).`,
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
