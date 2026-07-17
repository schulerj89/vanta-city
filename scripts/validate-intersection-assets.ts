import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const hashes = {
  'crosswalk.glb':
    '3c74672173a90e6f957fb9d2082cc9d51d0a7d975c5a22f55249ea58532a97e9',
  'traffic-light.glb':
    '95c345e7ed3a906facbef94d64c0f213bc48611e3491cd7c98e8812def186f2d',
  'street-light.glb':
    '38b165340c9037a2f42ac379dbf99901b56b03c313c054c9723e34cf2176e7f9',
  'fire-hydrant.glb':
    '15a7d2d6f462b2d819b0c8df22980a91e04233499b49b4c908b934df672a09cc',
  'plastic-barrier.glb':
    '69b52543e2b8620ae87301c95c126ab0a9f92706d785ed2cb552e6c6d12102ea',
  'broken-pallet.glb':
    'ab76bec38409bfa03e759da2fa6f50efb6b30db16c34425886b1237ef2709919',
  'trash-bags.glb':
    '01fdade3dd549fcaa0715134f42bc049a12e478659599afcf7ef541bd5a42cca',
} as const;

for (const [file, expected] of Object.entries(hashes)) {
  const bytes = await readFile(
    resolve('public/assets/environment/intersection', file),
  );
  if (bytes.subarray(0, 4).toString() !== 'glTF') {
    throw new Error(`${file} is not a binary glTF`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`${file} hash mismatch: ${actual}`);
}

const [svg, ascii, levelSource] = await Promise.all([
  readFile(resolve('docs/world/ashfall-junction-map.svg'), 'utf8'),
  readFile(resolve('docs/world/ashfall-junction-map.txt'), 'utf8'),
  readFile(resolve('src/world/levels/testDistrict.ts'), 'utf8'),
]);
const signature = 'footprint=56;road=12;sidewalk=4;edge=28';
if (!svg.includes(signature)) throw new Error('SVG layout signature is stale');
if (!ascii.includes('Footprint: 56m x 56m')) {
  throw new Error('ASCII construction map is stale');
}
const cc0Records = levelSource.match(/license: 'CC0 1\.0'/g)?.length ?? 0;
const sourceRecords =
  levelSource.match(/https:\/\/poly\.pizza\/m\//g)?.length ?? 0;
if (cc0Records !== 1 || sourceRecords !== 1) {
  throw new Error('Level asset provenance template is missing or duplicated');
}

console.log(
  `Validated ${Object.keys(hashes).length} CC0 GLBs and both generated intersection maps.`,
);
