import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { audioPaths, DIGRAPHS, isAudioPath } from '../src/catalogue.js';
import { drawRound } from '../src/round.js';

export const PROTOTYPE_WORDS = Object.freeze([
  'kot', 'dom', 'las', 'sok', 'rak', 'mama', 'ryba', 'woda', 'rower', 'balon', 'malina', 'papuga',
]);
export function sha256(content) { return createHash('sha256').update(content).digest('hex'); }

/** Bind review to spelling, order, level, topic, features and audio references. */
export function wordSnapshot(word) {
  return { id: word.id, word: word.word, category: word.category, level: word.level,
    difficultyFeatures: word.difficultyFeatures, syllables: word.syllables, wordAudio: word.wordAudio };
}
export function wordHash(word) { return sha256(JSON.stringify(wordSnapshot(word))); }

/** Read only regular MP3 files contained in this project's audio directory. */
export async function readClip(root, path) {
  if (!isAudioPath(path)) throw new Error(`Unsafe audio path: ${path}`);
  const projectRoot = await realpath(root);
  const audioRoot = await realpath(resolve(root, 'audio'));
  if (!audioRoot.startsWith(`${projectRoot}${sep}`)) throw new Error('Audio directory must be inside the project');
  const target = await realpath(resolve(root, path));
  if (!target.startsWith(`${audioRoot}${sep}`) || !(await stat(target)).isFile()) {
    throw new Error(`Audio must be a regular file under audio/: ${path}`);
  }
  const buffer = await readFile(target);
  if (buffer.length < 32) throw new Error(`Empty or truncated MP3: ${path}`);
  // Signature check is structural only. Human/browser playback review is still required.
  const id3 = buffer.subarray(0, 3).toString() === 'ID3';
  const frame = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) throw new Error(`Not an MP3: ${path}`);
  return buffer;
}

function signed(review) {
  return review?.approved === true && typeof review.reviewer === 'string'
    && review.reviewer.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(review.date)
    && Number.isFinite(Date.parse(review.date));
}

/** Missing/stale reviews stay pending. Never turn generated assets into approvals. */
export async function approvedWords(catalogue, reviews, root) {
  if (reviews?.schemaVersion !== 1 || !reviews.words || !reviews.audioSets) throw new Error('Invalid review manifest');
  const approved = [];
  const pending = [];
  const clips = new Map();
  for (const word of catalogue.words) {
    const review = reviews.words[word.id];
    const reject = (reason) => pending.push({ id: word.id, word: word.word, reason });
    if (!signed(review?.editorial) || !signed(review?.audio)) { reject('missing editorial/audio approval'); continue; }
    if (review.contentHash !== wordHash(word)) { reject('text or metadata changed since review'); continue; }
    const source = reviews.audioSets[review.audioSet];
    if (!source?.source?.trim() || !source?.voice?.trim() || !source?.redistributionPermission?.trim()
      || source.redistributionApproved !== true) { reject('missing audio source or redistribution permission'); continue; }
    let failure = null;
    const wordClips = new Map();
    for (const path of audioPaths(word)) {
      try {
        const buffer = clips.get(path) ?? await readClip(root, path);
        if (review.clips?.[path] !== sha256(buffer)) throw new Error(`changed or unreviewed clip: ${path}`);
        wordClips.set(path, buffer);
      } catch (error) { failure = error.code === 'ENOENT' ? `missing clip: ${path}` : error.message; break; }
    }
    if (failure) { reject(failure); continue; }
    approved.push(word);
    for (const [path, buffer] of wordClips) clips.set(path, buffer);
  }
  return { approved, pending, clips };
}

export function checkRelease(words) {
  if (words.length < 200 || words.length > 500) throw new Error(`Release needs 200–500 approved words; found ${words.length}`);
  for (const level of [1, 2]) drawRound(words, level, () => 0.5);
  // Enforce all seven digraphs listed in the PRD.
  for (const digraph of DIGRAPHS) {
    if (!words.some((word) => word.difficultyFeatures.includes(digraph))) throw new Error(`Missing digraph: ${digraph}`);
  }
}

export function selectPrototype(words) {
  const selected = PROTOTYPE_WORDS.map((text) => words.find((word) => word.word === text));
  if (selected.some((word) => !word)) throw new Error('Prototype needs all 12 approved prototype words and their clips');
  drawRound(selected, 1, () => 0.5);
  return selected;
}
