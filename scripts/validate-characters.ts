import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetManifest } from '../src/assets/catalog';
import { characterDefinitionEntries } from '../src/characters/characters';
import type {
  CharacterValidationConfigInput,
  CharacterValidationIssue,
  CharacterValidationReport,
} from '../src/characters/validation/CharacterAssetValidation';
import {
  mergeCharacterValidationConfig,
  validateCharacterCatalog,
} from '../src/characters/validation/CharacterAssetValidation';
import { NodeCharacterAssetInspector } from './character-validation/NodeCharacterAssetInspector';

interface CliOptions {
  readonly configPath: string;
  readonly jsonPath: string;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const override = JSON.parse(
    await readFile(options.configPath, 'utf8'),
  ) as CharacterValidationConfigInput;
  const config = mergeCharacterValidationConfig(override);
  const inspector = new NodeCharacterAssetInspector(projectRoot);
  const report = await validateCharacterCatalog(
    characterDefinitionEntries,
    assetManifest,
    inspector,
    config,
  );

  await mkdir(dirname(options.jsonPath), { recursive: true });
  await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  printHumanReport(report, options.jsonPath);
  if (report.summary.hardFailures > 0) process.exitCode = 1;
}

function parseArguments(arguments_: readonly string[]): CliOptions {
  let configPath = resolve(projectRoot, 'character-validation.config.json');
  let jsonPath = resolve(projectRoot, 'reports/character-validation.json');
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === '--config' && value) {
      configPath = resolve(projectRoot, value);
      index += 1;
    } else if (argument === '--json' && value) {
      jsonPath = resolve(projectRoot, value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return { configPath, jsonPath };
}

function printHumanReport(
  report: CharacterValidationReport,
  jsonPath: string,
): void {
  console.log('Vanta City character asset validation');
  console.log(
    `Limits: scale ${report.config.limits.minScale}–${report.config.limits.maxScale}, height ${report.config.limits.minHeight}–${report.config.limits.maxHeight}, root motion ≤ ${report.config.limits.rootMotionTolerance}`,
  );
  console.log('');
  console.log(
    `${'Character'.padEnd(22)} ${'Status'.padEnd(10)} ${'Meshes'.padStart(6)} ${'Height'.padStart(8)} ${'Clips'.padStart(6)} ${'Issues'.padStart(7)}`,
  );
  console.log('-'.repeat(65));
  for (const character of report.characters) {
    const metrics = character.metrics;
    console.log(
      `${character.id.padEnd(22)} ${character.status.toUpperCase().padEnd(10)} ${formatMetric(metrics.meshCount).padStart(6)} ${formatMetric(metrics.calculatedHeight).padStart(8)} ${String(metrics.animationClips.length).padStart(6)} ${String(character.issues.length).padStart(7)}`,
    );
  }

  const assetIssues = report.characters.flatMap(({ id, issues }) =>
    issues
      .filter(({ defectType }) => defectType === 'asset')
      .map((issue) => ({ characterId: id, issue })),
  );
  const codeIssues = report.characters.flatMap(({ id, issues }) =>
    issues
      .filter(({ defectType }) => defectType === 'code')
      .map((issue) => ({ characterId: id, issue })),
  );
  const catalogIssues = report.catalogIssues.map((issue) => ({
    characterId: '<catalog>',
    issue,
  }));
  printIssues('Asset findings', assetIssues);
  printIssues('Code findings', [...catalogIssues, ...codeIssues]);

  console.log('');
  console.log(
    `Summary: ${report.summary.passed} passed, ${report.summary.warnings} with warnings, ${report.summary.failed} failed; ${report.summary.hardFailures} hard failure(s).`,
  );
  console.log(`JSON report: ${relative(projectRoot, jsonPath)}`);
}

function printIssues(
  heading: string,
  entries: readonly {
    readonly characterId: string;
    readonly issue: CharacterValidationIssue;
  }[],
): void {
  if (entries.length === 0) return;
  console.log('');
  console.log(`${heading}:`);
  for (const { characterId, issue } of entries) {
    console.log(
      `  ${issue.severity === 'failure' ? 'FAIL' : 'WARN'} ${characterId} [${issue.code}] ${issue.message}`,
    );
  }
}

function formatMetric(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(3).replace(/\.?0+$/, '');
}

void main().catch((error: unknown) => {
  console.error(
    `Character validator code defect: ${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exitCode = 2;
});
