import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { audioPaths, catalogueCounts, validateCatalogue } from '../src/catalogue.js';
import { checkRelease, readClip, sha256, wordHash } from './content.mjs';
import { isMain, readJSON, ROOT } from './validate.mjs';

/** Validate the public voice files without claiming native-speaker or editorial approval. */
export async function validatePublicAudio(catalogue, manifest, root) {
  if (manifest?.schemaVersion !== 1 || manifest.purpose !== 'public-preview'
    || manifest.license !== 'MIT' || manifest.datasetLicense !== 'CC0-1.0'
    || !manifest.source?.startsWith('https://') || !manifest.redistributionPermission?.startsWith('https://')) {
    throw new Error('Public preview requires the documented redistributable voice manifest');
  }
  let count = 0;
  for (const word of catalogue.words) {
    for (const path of audioPaths(word)) {
      const record = manifest.clips?.[path];
      if (!record || record.wordHash !== wordHash(word)) throw new Error(`Missing or stale public audio: ${path}`);
      const bytes = await readClip(root, path);
      if (sha256(bytes) !== record.sha256) throw new Error(`Public audio hash mismatch: ${path}`);
      count += 1;
    }
  }
  return count;
}

/** Publish an app entry at the existing Pages main/root source, using source-relative assets. */
export async function buildPages({ root = ROOT } = {}) {
  const catalogueBytes = await readFile(resolve(root, 'word-catalogue.json'));
  const catalogue = validateCatalogue(JSON.parse(catalogueBytes));
  checkRelease(catalogue.words);
  const manifestBytes = await readFile(resolve(root, 'content/public-audio.json'));
  const manifest = JSON.parse(manifestBytes);
  const audioFiles = await validatePublicAudio(catalogue, manifest, root);
  const sourceFiles = ['index.html', 'app.js', 'audio.js', 'catalogue.js', 'round.js',
    'styles.css', 'tokens.css', 'favicon.svg'];
  const sourceHashes = {};
  for (const file of sourceFiles) sourceHashes[file] = sha256(await readFile(resolve(root, 'src', file)));
  const sourceHash = sha256(JSON.stringify(sourceHashes));
  const version = sourceHash.slice(0, 12);
  const html = (await readFile(resolve(root, 'src/index.html'), 'utf8'))
    .replaceAll('./favicon.svg', './src/favicon.svg')
    .replace('./styles.css', `./src/styles.css?v=${version}`)
    .replace('./app.js', `./src/app.js?v=${version}`);
  let gitSHA = null;
  try { gitSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { /* Source archives have no Git metadata. */ }
  const metadata = { schemaVersion: 1, mode: 'public-preview', language: 'pl-PL', levels: [1, 2],
    catalogueHash: sha256(catalogueBytes), publicAudioManifestHash: sha256(manifestBytes),
    sourceHash, sourceHashes, gitSHA, node: process.version, counts: catalogueCounts(catalogue.words),
    audioFiles, voice: manifest.settings?.voice ?? null, reviewStatus: 'pending' };
  // All content/audio gates pass before publishing any root entry or metadata.
  await writeFile(resolve(root, 'build-info.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(resolve(root, 'index.html'), html);
  await writeFile(resolve(root, '.nojekyll'), '');
  return metadata;
}

if (isMain(import.meta.url)) {
  try {
    const metadata = await buildPages();
    console.log(`Pages app ready at repository root: ${metadata.counts.total} words, ${metadata.audioFiles} MP3s; review pending.`);
  } catch (error) { console.error(`Pages build blocked: ${error.message}`); process.exitCode = 1; }
}
