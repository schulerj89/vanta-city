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
    '2f4c0a516f9ec8a8c885115d6dec31a8f6267ba02184ce5fe9bb9284e3ce24b0',
  'concrete-deco.generated.jpg':
    'da86c6509b158bb022fae974f313e72531e19f1d074d46895f8949a22a8b07db',
  'corrugated-teal.generated.jpg':
    '31b43363b8bb45fdb1634caa5c1bc6685aae751329bafd9fec112f7696a2b2c9',
  'roof-membrane.generated.jpg':
    '8f6f0b564e075d3d62710c83d1f3b0ceee7589b896b1ff1cd9c3b362e85ca9aa',
  'window-deco.generated.jpg':
    '1d300c6c240967960693178349f73c59021f2c9d11e75d18a528b6b919b7ad70',
} as const;

const issues = validateAshfallBuildingKit();
if (issues.length > 0) throw new Error(issues.join('\n'));
const variantCount: number = ashfallBuildingVariants.length;
if (variantCount !== 18) {
  throw new Error(`Expected 18 building variants, found ${variantCount}`);
}
if (Object.keys(ashfallBuildingAssets).length !== 5) {
  throw new Error('Expected exactly five controlled building textures');
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
if (totalBytes > 400_000) {
  throw new Error(`Building textures exceed 400KB budget: ${totalBytes}`);
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
  `Validated ${variantCount} variants and 5 generated 512px textures (${totalBytes} bytes).`,
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
