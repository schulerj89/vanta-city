import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const forwardedArgs = process.argv
  .slice(2)
  .filter((argument) => argument !== '--');
const hasExplicitSelection = forwardedArgs.some(
  (argument) =>
    argument.endsWith('.spec.ts') ||
    argument === '--grep' ||
    argument === '-g' ||
    argument.startsWith('--grep='),
);

if (!hasExplicitSelection) {
  console.error(
    [
      'Changed-feature browser validation requires an explicit spec or --grep selection.',
      'Examples:',
      '  pnpm test:e2e:feature e2e/player-money.spec.ts',
      '  pnpm test:e2e:feature -- --grep "player money" e2e/player-money.spec.ts',
      'Use pnpm test:e2e:integration for the bounded multi-system gate.',
      'Use pnpm test:e2e:release only for an explicit release milestone.',
    ].join('\n'),
  );
  process.exit(2);
}

const playwright = join(process.cwd(), 'node_modules/@playwright/test/cli.js');
const result = spawnSync(
  process.execPath,
  [playwright, 'test', ...forwardedArgs, '--workers=1'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
