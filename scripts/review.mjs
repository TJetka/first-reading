import { resolve } from 'node:path';
import { audioPaths, catalogueCounts, validateCatalogue } from '../src/catalogue.js';
import { approvedWords, readClip, sha256, wordHash, wordSnapshot } from './content.mjs';
import { isMain, readJSON, ROOT } from './validate.mjs';

/** Prepare a pending review record; approval is always an explicit human decision. */
export async function reviewTemplate(word, root) {
  const clips = {};
  for (const path of audioPaths(word)) {
    try { clips[path] = sha256(await readClip(root, path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; clips[path] = null; }
  }
  return { snapshot: wordSnapshot(word), contentHash: wordHash(word),
    editorial: { approved: false, reviewer: '', date: '' },
    audio: { approved: false, reviewer: '', date: '' }, audioSet: '', clips };
}

if (isMain(import.meta.url)) {
  try {
    const catalogue = validateCatalogue(await readJSON(resolve(ROOT, 'word-catalogue.json')));
    const id = process.argv[2];
    if (id) {
      const word = catalogue.words.find((entry) => entry.id === id);
      if (!word) throw new Error('Unknown word id');
      console.log(JSON.stringify({ [id]: await reviewTemplate(word, ROOT) }, null, 2));
    } else {
      const result = await approvedWords(catalogue, await readJSON(resolve(ROOT, 'content/reviews.json')), ROOT);
      const reasons = {};
      for (const entry of result.pending) reasons[entry.reason] = (reasons[entry.reason] ?? 0) + 1;
      console.log(JSON.stringify({ approved: catalogueCounts(result.approved), pending: result.pending.length, reasons }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
