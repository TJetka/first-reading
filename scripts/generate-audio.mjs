import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateCatalogue } from '../src/catalogue.js';
import { PROTOTYPE_WORDS, sha256, wordHash } from './content.mjs';
import { isMain, readJSON, ROOT } from './validate.mjs';

const exec = promisify(execFile);

/** Render a private, unreviewed WAV bank with macOS say. No runtime speech dependency. */
export async function generateAudio({ root = ROOT, scope = 'all', voice = 'Zosia', rate = 145 } = {}) {
  if (process.platform !== 'darwin') throw new Error('This draft renderer needs macOS say; import licensed MP3s on other systems.');
  if (!['all', 'prototype'].includes(scope) || !Number.isInteger(rate) || rate < 80 || rate > 220) throw new Error('Invalid scope/rate');
  const catalogueBytes = await readFile(resolve(root, 'word-catalogue.json'));
  const catalogue = validateCatalogue(JSON.parse(catalogueBytes));
  const words = catalogue.words.filter((word) => scope === 'all' || PROTOTYPE_WORDS.includes(word.word));
  const directory = resolve(root, '.cache/draft-audio');
  const manifestPath = resolve(directory, 'manifest.json');
  await mkdir(directory, { recursive: true });
  let manifest = { schemaVersion: 1, provider: 'macOS say', voice, rate, sampleRate: 22050,
    source: 'Apple system voice; local personal preview only',
    terms: 'https://www.apple.com/legal/sla/docs/macOSSequoia.pdf#page=3', redistributionApproved: false,
    editorialApproved: false, audioApproved: false, catalogueHash: sha256(catalogueBytes), clips: {} };
  try {
    const existing = await readJSON(manifestPath);
    if (existing.voice !== voice || existing.rate !== rate) throw new Error('Existing draft uses different settings; choose a separate checkout.');
    manifest = { ...existing, catalogueHash: sha256(catalogueBytes) };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { stdout } = await exec('/usr/bin/sw_vers', ['-productVersion']);
  manifest.systemVersion = stdout.trim();
  manifest.terms = 'https://www.apple.com/legal/sla/docs/macOSSequoia.pdf#page=3';
  manifest.gitSHA = null;
  try { manifest.gitSHA = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(); }
  catch { /* A source archive may not have Git metadata. */ }
  let count = 0;
  for (const word of words) {
    const clips = new Map([[word.wordAudio, word.word], ...word.syllables.map((syllable) => [syllable.audio, syllable.text])]);
    for (const [sourcePath, text] of clips) {
      const path = sourcePath.replace(/\.mp3$/, '.wav');
      const target = resolve(directory, path);
      const previous = manifest.clips[sourcePath];
      if (previous?.wordHash === wordHash(word)) {
        try { if (sha256(await readFile(target)) === previous.sha256) { count += 1; continue; } } catch { /* Regenerate a missing generated file. */ }
      }
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.rendering.wav`;
      await exec('/usr/bin/say', ['-v', voice, '-r', String(rate), '--file-format=WAVE',
        '--data-format=LEI16@22050', '-o', temporary, text], { timeout: 30000 });
      const bytes = await readFile(temporary);
      if (bytes.length < 1000 || bytes.subarray(0, 4).toString() !== 'RIFF') throw new Error(`Invalid rendered WAV: ${word.id}`);
      // Existing final files are never replaced automatically.
      await copyFile(temporary, target, constants.COPYFILE_EXCL);
      await rm(temporary);
      manifest.clips[sourcePath] = { path, text, wordHash: wordHash(word), sha256: sha256(bytes) };
      count += 1;
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (count % 25 < 4) console.log(`${count} draft clips ready`);
  }
  console.log(`${count} draft clips; voice=${voice}; rate=${rate}; sampleRate=22050; catalogue=${manifest.catalogueHash}`);
  return manifest;
}

if (isMain(import.meta.url)) {
  try { await generateAudio({ scope: process.argv[2] ?? 'all' }); }
  catch (error) { console.error(`Audio generation stopped: ${error.message}`); process.exitCode = 1; }
}
