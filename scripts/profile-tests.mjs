import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const output = join(tmpdir(), `vanta-vitest-profile-${process.pid}.json`);
const vitest = join(process.cwd(), 'node_modules/vitest/vitest.mjs');
const started = performance.now();
const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--reporter=json', `--outputFile=${output}`],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
const wallMs = performance.now() - started;

if (result.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  rmSync(output, { force: true });
  process.exit(result.status ?? 1);
}

const report = JSON.parse(readFileSync(output, 'utf8'));
rmSync(output, { force: true });

const relativeTestFile = (name) => name.split('/tests/').at(-1) ?? name;
const files = report.testResults
  .map((file) => ({
    file: relativeTestFile(file.name),
    durationMs: file.endTime - file.startTime,
    tests: file.assertionResults.length,
  }))
  .sort((left, right) => right.durationMs - left.durationMs);
const tests = report.testResults
  .flatMap((file) =>
    file.assertionResults.map((test) => ({
      file: relativeTestFile(file.name),
      name: test.fullName,
      durationMs: test.duration ?? 0,
    })),
  )
  .sort((left, right) => right.durationMs - left.durationMs);

console.log(
  `Vitest profile: ${report.testResults.length} files, ${report.numTotalTests} tests, ${(wallMs / 1000).toFixed(2)}s wall`,
);
console.log(
  'Slowest files (test execution only; import/environment excluded):',
);
for (const file of files.slice(0, 10)) {
  console.log(
    `  ${file.durationMs.toFixed(1).padStart(7)} ms  ${String(file.tests).padStart(3)} tests  ${file.file}`,
  );
}
console.log('Slowest tests:');
for (const test of tests.slice(0, 10)) {
  console.log(
    `  ${test.durationMs.toFixed(1).padStart(7)} ms  ${test.file} > ${test.name}`,
  );
}
