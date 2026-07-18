import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const integrationSpecs = [
  'e2e/collision-geometry.spec.ts',
  'e2e/conversation-slice.spec.ts',
  'e2e/district-location-hud.spec.ts',
  'e2e/equipment-actions.spec.ts',
  'e2e/interaction-reliability.spec.ts',
  'e2e/performance-loading.spec.ts',
  'e2e/vehicle-foundation.spec.ts',
  'e2e/weapon-aim-damage.spec.ts',
];
const forwardedArgs = process.argv
  .slice(2)
  .filter((argument) => argument !== '--');
const playwright = join(process.cwd(), 'node_modules/@playwright/test/cli.js');
const result = spawnSync(
  process.execPath,
  [playwright, 'test', ...integrationSpecs, ...forwardedArgs, '--workers=1'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
