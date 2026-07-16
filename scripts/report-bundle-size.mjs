import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const warningKilobytes = Number(process.env.BUNDLE_WARN_KB ?? 1536);
const reportableExtensions = new Set(['.js', '.css']);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (reportableExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = await collect(outputDirectory);
const rows = await Promise.all(
  files.map(async (file) => {
    const bytes = (await stat(file)).size;
    const contents = await readFile(file);
    return {
      file: relative(outputDirectory, file),
      bytes,
      gzipBytes: (await gzipAsync(contents)).byteLength,
    };
  }),
);

const totalBytes = rows.reduce((total, row) => total + row.bytes, 0);
const totalGzipBytes = rows.reduce((total, row) => total + row.gzipBytes, 0);
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

console.log('Bundle size report (JavaScript and CSS)');
for (const row of rows.sort((left, right) => right.bytes - left.bytes)) {
  console.log(
    `  ${row.file.padEnd(36)} ${format(row.bytes).padStart(10)} (${format(row.gzipBytes)} gzip)`,
  );
}
console.log(
  `  ${'total'.padEnd(36)} ${format(totalBytes).padStart(10)} (${format(totalGzipBytes)} gzip)`,
);

if (totalBytes > warningKilobytes * 1024) {
  console.warn(
    `::warning::Bundle is ${format(totalBytes)}; review growth above the informational ${warningKilobytes} KiB threshold.`,
  );
}
