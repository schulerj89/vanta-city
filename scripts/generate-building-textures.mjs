import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const size = 512;
const output = resolve('public/assets/environment/ashfall-buildings');
const temporary = mkdtempSync(join(tmpdir(), 'vanta-building-textures-'));

const families = {
  'ribbed-zinc.procedural.jpg': ribbedZinc,
  'ceramic-tile.procedural.jpg': ceramicTile,
  'glass-block.procedural.jpg': glassBlock,
  'painted-shopfront.procedural.jpg': paintedShopfront,
  'venue-terrazzo.procedural.jpg': venueTerrazzo,
  'home-linoleum.procedural.jpg': homeLinoleum,
};

try {
  for (const [file, render] of Object.entries(families)) {
    const pixels = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const color = render(x, y);
        const offset = (y * size + x) * 3;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
      }
    }
    const ppm = join(temporary, file.replace('.jpg', '.ppm'));
    writeFileSync(
      ppm,
      Buffer.concat([Buffer.from(`P6\n${size} ${size}\n255\n`), pixels]),
    );
    execFileSync('/usr/bin/sips', [
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      '72',
      ppm,
      '--out',
      join(output, file),
    ]);
  }
} finally {
  rmSync(temporary, { recursive: true });
}

function ribbedZinc(x, y) {
  const rib = x % 32;
  const seam = rib < 3 || rib > 29;
  const highlight = rib >= 7 && rib <= 11;
  const salt = noise(x, y, 17) > 0.86 ? 12 : 0;
  const rust = noise(x >> 1, y >> 1, 31) > 0.96 && y % 128 > 88;
  return rust
    ? [101, 70, 54]
    : [
        82 + (highlight ? 13 : 0) - (seam ? 18 : 0) + salt,
        105 + (highlight ? 12 : 0) - (seam ? 15 : 0) + salt,
        108 + (highlight ? 14 : 0) - (seam ? 12 : 0) + salt,
      ];
}

function ceramicTile(x, y) {
  const joint = x % 64 < 3 || y % 48 < 3;
  const variation =
    Math.floor(noise(Math.floor(x / 64), Math.floor(y / 48), 47) * 10) - 5;
  return joint
    ? [51, 58, 57]
    : [111 + variation, 128 + variation, 119 + variation];
}

function glassBlock(x, y) {
  const bx = x % 64;
  const by = y % 64;
  const joint = bx < 4 || by < 4;
  const edge = bx < 10 || bx > 56 || by < 10 || by > 56;
  const ripple = Math.round(6 * Math.sin((bx + by) * 0.2));
  return joint
    ? [47, 55, 57]
    : [
        56 + ripple + (edge ? 8 : 0),
        84 + ripple + (edge ? 9 : 0),
        90 + ripple + (edge ? 11 : 0),
      ];
}

function paintedShopfront(x, y) {
  const bay = x % 128;
  const fascia = y % 256 < 52;
  const pier = bay < 10 || bay > 118;
  const bulkhead = y % 256 > 196;
  const scratch = noise(x, y, 83) > 0.985;
  if (pier) return [54, 66, 65];
  if (fascia) return scratch ? [134, 102, 71] : [118, 80, 55];
  if (bulkhead) return [75, 101, 94];
  return scratch ? [74, 92, 93] : [45, 65, 69];
}

function venueTerrazzo(x, y) {
  const base = 48 + Math.floor(noise(x >> 2, y >> 2, 109) * 9);
  const chip = noise(x, y, 113);
  if (chip > 0.986) return [164, 98, 86];
  if (chip > 0.972) return [72, 139, 145];
  if (chip > 0.957) return [199, 174, 118];
  const seam = x % 128 < 2 || y % 128 < 2;
  return seam ? [31, 35, 43] : [base, base + 3, base + 8];
}

function homeLinoleum(x, y) {
  const tileX = Math.floor(x / 64);
  const tileY = Math.floor(y / 64);
  const alternating = (tileX + tileY) % 2 === 0;
  const joint = x % 64 < 2 || y % 64 < 2;
  const wear = noise(x >> 1, y >> 1, 137) > 0.94 ? 7 : 0;
  if (joint) return [58, 61, 55];
  return alternating
    ? [111 + wear, 116 + wear, 96 + wear]
    : [96 + wear, 105 + wear, 91 + wear];
}

function noise(x, y, seed) {
  let value = (x * 374761393 + y * 668265263 + seed * 69069) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
