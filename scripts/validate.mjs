import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { audioPaths, catalogueCounts, validateCatalogue } from '../src/catalogue.js';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export async function readJSON(path) { return JSON.parse(await readFile(path, 'utf8')); }
export function isMain(url) { return typeof process !== 'undefined' && process.argv[1] && fileURLToPath(url) === resolve(process.argv[1]); }

if (isMain(import.meta.url)) {
  try {
    const catalogue = validateCatalogue(await readJSON(resolve(ROOT, 'word-catalogue.json')));
    console.log(JSON.stringify({ ...catalogueCounts(catalogue.words),
      audioFiles: new Set(catalogue.words.flatMap(audioPaths)).size }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
