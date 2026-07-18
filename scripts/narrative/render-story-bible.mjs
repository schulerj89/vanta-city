import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  documentPath,
  loadStoryBible,
  renderStoryBible,
  validateStoryBible,
} from './story-bible-tools.mjs';

const bible = validateStoryBible(await loadStoryBible());
await mkdir(path.dirname(documentPath), { recursive: true });
await writeFile(documentPath, await renderStoryBible(bible));
console.log(`Rendered ${path.relative(process.cwd(), documentPath)}`);
