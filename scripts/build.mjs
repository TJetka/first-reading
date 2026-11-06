import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { audioPaths, catalogueCounts, validateCatalogue } from '../src/catalogue.js';
import { approvedWords, checkRelease, selectPrototype, sha256, wordHash } from './content.mjs';
import { isMain, readJSON, ROOT } from './validate.mjs';
import { writeFilePreview } from './file-preview.mjs';

/** Build atomically after every gate passes; source data is never modified. */
export async function build({ root = ROOT, mode = 'release' } = {}) {
  if (!['release', 'prototype', 'preview'].includes(mode)) throw new Error('Unknown build mode');
  const destination = resolve(root, mode === 'preview' ? 'preview/first-reading' : 'dist/first-reading');
  // Remove an earlier generated release so a failed build cannot deploy stale output.
  if (mode !== 'preview') await rm(destination, { recursive: true, force: true });
  const sourceBytes = await readFile(resolve(root, 'word-catalogue.json'));
  const catalogue = validateCatalogue(JSON.parse(sourceBytes));
  const reviews = await readJSON(resolve(root, 'content/reviews.json'));
  const reviewBytes = await readFile(resolve(root, 'content/reviews.json'));
  let words;
  let clips = new Map();
  let pending = [];
  let draftAudioManifestHash = null;
  if (mode === 'preview') {
    words = structuredClone(catalogue.words);
    let draft;
    try {
      const draftBytes = await readFile(resolve(root, '.cache/draft-audio/manifest.json'));
      draftAudioManifestHash = sha256(draftBytes);
      draft = JSON.parse(draftBytes);
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const word of words) {
      const contentHash = wordHash(word);
      const replacements = new Map();
      for (const path of audioPaths(word)) {
        const record = draft?.clips[path];
        if (!record || record.wordHash !== contentHash || record.path !== path.replace(/\.mp3$/, '.wav')) continue;
        const buffer = await readFile(resolve(root, '.cache/draft-audio', record.path));
        if (sha256(buffer) !== record.sha256) throw new Error(`Draft audio changed: ${path}`);
        replacements.set(path, record.path);
        clips.set(record.path, buffer);
      }
      word.wordAudio = replacements.get(word.wordAudio) ?? word.wordAudio;
      for (const syllable of word.syllables) syllable.audio = replacements.get(syllable.audio) ?? syllable.audio;
    }
  }
  else {
    const result = await approvedWords(catalogue, reviews, root);
    words = result.approved;
    clips = result.clips;
    pending = result.pending;
    if (mode === 'release') checkRelease(words);
    else words = selectPrototype(words);
  }
  let gitSHA = null;
  try { gitSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* Uninitialised checkout. */ }
  const metadata = { schemaVersion: 1, mode, catalogueHash: sha256(sourceBytes),
    reviewHash: sha256(reviewBytes), draftAudioManifestHash, gitSHA, node: process.version,
    levels: mode === 'prototype' ? [1] : [1, 2], counts: catalogueCounts(words) };
  await mkdir(dirname(destination), { recursive: true });
  const stage = await mkdtemp(resolve(dirname(destination), '.build-'));
  try {
    await cp(resolve(root, 'src'), stage, { recursive: true });
    const runtimeCatalogue = { schemaVersion: 1, language: 'pl-PL', words };
    await writeFile(resolve(stage, 'word-catalogue.json'), `${JSON.stringify(runtimeCatalogue)}\n`);
    await writeFile(resolve(stage, 'build-info.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    for (const path of new Set(words.flatMap(audioPaths))) {
      const buffer = clips.get(path);
      if (buffer) { await mkdir(dirname(resolve(stage, path)), { recursive: true }); await writeFile(resolve(stage, path), buffer); }
    }
    await writeFile(resolve(stage, '.nojekyll'), '');
    if (mode === 'preview') await writeFilePreview(stage, runtimeCatalogue, metadata);
    await rm(destination, { recursive: true, force: true });
    await rename(stage, destination);
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
  return { destination, metadata, pending };
}

if (isMain(import.meta.url)) {
  try { const result = await build({ mode: process.argv[2] ?? 'release' }); console.log(`${result.metadata.mode}: ${result.metadata.counts.total} words → ${result.destination}`); }
  catch (error) { console.error(`Build blocked: ${error.message}`); process.exitCode = 1; }
}
