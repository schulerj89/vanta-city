import { readFile } from 'node:fs/promises';
import {
  documentPath,
  loadStoryBible,
  renderStoryBible,
  validateStoryBible,
} from './story-bible-tools.mjs';

const bible = validateStoryBible(await loadStoryBible());
const expected = await renderStoryBible(bible);
const actual = await readFile(documentPath, 'utf8');
if (actual !== expected) {
  throw new Error(
    'Generated narrative document is stale. Run "pnpm narrative:render".',
  );
}
console.log(
  `Ashfall story bible valid: ${bible.characters.length} characters, ${bible.factions.length} factions, ${bible.missions.length} missions.`,
);
