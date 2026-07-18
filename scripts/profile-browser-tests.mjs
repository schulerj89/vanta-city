import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const playwright = join(process.cwd(), 'node_modules/@playwright/test/cli.js');
const forwardedArgs = process.argv.slice(2);
const separator = forwardedArgs.indexOf('--');
if (separator !== -1) forwardedArgs.splice(separator, 1);
const args = ['test', ...forwardedArgs, '--reporter=json'];
const port =
  process.env.VANTA_E2E_PORT ?? String(42_000 + (process.pid % 10_000));
const started = performance.now();
const result = spawnSync(process.execPath, [playwright, ...args], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, VANTA_E2E_PORT: port },
  maxBuffer: 128 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
});
const wallMs = performance.now() - started;

if (!result.stdout) {
  console.error('Playwright produced no JSON profile.');
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  process.stdout.write(result.stdout);
  console.error(`Unable to parse Playwright JSON profile: ${error.message}`);
  process.exit(result.status ?? 1);
}

const tests = [];
function collect(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const testResult of test.results ?? []) {
          tests.push({
            durationMs: testResult.duration ?? 0,
            error: testResult.error?.message,
            file: relative(process.cwd(), spec.file),
            status: testResult.status,
            title: spec.title,
          });
        }
      }
    }
    collect(suite.suites);
  }
}
collect(report.suites);
tests.sort((left, right) => right.durationMs - left.durationMs);

const stats = report.stats ?? {};
const attempts = tests.length;
const passed = tests.filter(({ status }) => status === 'passed').length;
const selected =
  (stats.expected ?? 0) +
  (stats.unexpected ?? 0) +
  (stats.flaky ?? 0) +
  (stats.skipped ?? 0);
console.log(
  `Playwright profile: ${selected || passed} selected tests, ${attempts} attempts, ${(wallMs / 1000).toFixed(2)}s wall, port ${port}`,
);
console.log(
  `Results: ${passed} passed, ${stats.unexpected ?? 0} unexpected, ${stats.flaky ?? 0} flaky, ${stats.skipped ?? 0} skipped`,
);
for (const test of tests.filter(({ status }) => status !== 'passed')) {
  console.log(`  ${test.status}: ${test.file} > ${test.title}`);
  if (test.error) console.log(`    ${test.error.replaceAll('\n', '\n    ')}`);
}
console.log('Slowest test attempts:');
for (const test of tests.slice(0, 10)) {
  console.log(
    `  ${(test.durationMs / 1000).toFixed(2).padStart(6)} s  ${test.status.padEnd(7)}  ${test.file} > ${test.title}`,
  );
}

process.exit(result.status ?? 1);
