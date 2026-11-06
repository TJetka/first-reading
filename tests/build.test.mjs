import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, mkdir, symlink, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from '../scripts/build.mjs';
import { approvedWords, checkRelease, readClip, sha256, wordHash } from '../scripts/content.mjs';
import { reviewTemplate } from '../scripts/review.mjs';
import { validateCatalogue, audioPaths } from '../src/catalogue.js';
import { catalogue, clone, fakeMP3, fixture } from './helpers.mjs';

test('unreviewed source validates but release/prototype both fail without deployable output', async (t) => {
  const { root } = await fixture(t);
  const result = await approvedWords(catalogue, { schemaVersion: 1, words: {}, audioSets: {} }, root);
  assert.equal(result.approved.length, 0); assert.equal(result.pending.length, catalogue.words.length);
  await assert.rejects(build({ root }), /200–500 approved/);
  await assert.rejects(build({ root, mode: 'prototype' }), /12 approved/);
  await assert.rejects(access(resolve(root, 'dist/first-reading/index.html')));
});
test('preview is isolated from dist and preserves source catalogue', async (t) => {
  const { root } = await fixture(t);
  const original = await readFile(resolve(root, 'word-catalogue.json'), 'utf8');
  const result = await build({ root, mode: 'preview' });
  assert.equal(result.metadata.mode, 'preview'); assert.equal(result.metadata.counts.total, catalogue.words.length);
  assert.ok(result.destination.endsWith('preview/first-reading'));
  const direct = await readFile(resolve(result.destination, 'local-preview.html'), 'utf8');
  assert.match(direct, /id="preview-data"/); assert.doesNotMatch(direct, /^import /m);
  validateCatalogue(JSON.parse(await readFile(resolve(result.destination, 'word-catalogue.json'), 'utf8')));
  assert.equal(await readFile(resolve(root, 'word-catalogue.json'), 'utf8'), original);
  await assert.rejects(access(resolve(root, 'dist/first-reading/index.html')));
});
test('approved build smoke: complete catalogue, exact files, provenance and relative URLs', async (t) => {
  const { root, reviews } = await fixture(t, { approved: true });
  const result = await build({ root });
  const output = JSON.parse(await readFile(resolve(result.destination, 'word-catalogue.json'), 'utf8'));
  assert.equal(output.words.length, catalogue.words.length); validateCatalogue(output);
  for (const path of new Set(output.words.flatMap(audioPaths))) {
    assert.equal(sha256(await readFile(resolve(result.destination, path))), sha256(fakeMP3));
  }
  assert.equal(result.metadata.catalogueHash, sha256(await readFile(resolve(root, 'word-catalogue.json'))));
  assert.equal(result.metadata.reviewHash, sha256(await readFile(resolve(root, 'content/reviews.json'))));
  assert.deepEqual(result.metadata.levels, [1, 2]);
  const html = await readFile(resolve(result.destination, 'index.html'), 'utf8');
  assert.match(html, /lang="pl"/); assert.doesNotMatch(html, /(?:src|href)="\//);
  await assert.rejects(access(resolve(result.destination, 'reviews.json')));
  await assert.rejects(access(resolve(result.destination, 'local-preview.html')));
  const prototype = await build({ root, mode: 'prototype' });
  assert.equal(prototype.metadata.counts.total, 12); assert.deepEqual(prototype.metadata.levels, [1]);
  await assert.rejects(access(resolve(prototype.destination, catalogue.words[127].wordAudio)));
  // A failed rebuild must remove a stale generated release.
  await writeFile(resolve(root, 'content/reviews.json'), JSON.stringify({ ...reviews, words: {} }));
  await assert.rejects(build({ root }), /200–500/);
  await assert.rejects(access(resolve(root, 'dist/first-reading/index.html')));
});
test('changed spelling, level, split, permission or audio invalidates approval', async (t) => {
  const { root, reviews } = await fixture(t, { approved: true });
  for (const mutate of [
    (c) => { c.words[0].word = 'pies'; },
    (c) => { c.words[0].level = 2; },
    (c) => { c.words[0].syllables[0].text = 'ko'; },
  ]) {
    const changed = clone(catalogue); mutate(changed);
    const result = await approvedWords(changed, reviews, root);
    assert.equal(result.approved.length, catalogue.words.length - 1); assert.match(result.pending[0].reason, /changed/);
  }
  const noPermission = clone(reviews); noPermission.audioSets.test.redistributionApproved = false;
  assert.equal((await approvedWords(catalogue, noPermission, root)).approved.length, 0);
  await writeFile(resolve(root, catalogue.words[0].wordAudio), Buffer.concat([fakeMP3, Buffer.from('changed')]));
  assert.equal((await approvedWords(catalogue, reviews, root)).approved.length, catalogue.words.length - 1);
  await rm(resolve(root, catalogue.words[1].wordAudio));
  const result = await approvedWords(catalogue, reviews, root);
  assert.equal(result.approved.length, catalogue.words.length - 2); assert.ok(result.pending.some((entry) => entry.reason.includes('missing clip')));
});
test('missing reviewer/date/hash and non-MP3 bytes cannot pass review', async (t) => {
  const { root, reviews } = await fixture(t, { approved: true });
  reviews.words.w0001.editorial.reviewer = '';
  reviews.words.w0002.audio.date = 'no';
  reviews.words.w0003.clips = {};
  await writeFile(resolve(root, catalogue.words[3].wordAudio), 'x');
  await writeFile(resolve(root, catalogue.words[4].wordAudio), Buffer.alloc(60));
  const result = await approvedWords(catalogue, reviews, root);
  assert.equal(result.approved.length, catalogue.words.length - 5); assert.equal(result.pending.length, 5);
});
test('audio traversal and symlink escape are rejected', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(readClip(root, '../bad.mp3'), /Unsafe/);
  await writeFile(resolve(root, 'outside.mp3'), fakeMP3);
  await mkdir(resolve(root, 'audio/w0001'));
  await symlink(resolve(root, 'outside.mp3'), resolve(root, 'audio/w0001/word.mp3'));
  await assert.rejects(readClip(root, 'audio/w0001/word.mp3'), /under audio/);
});
test('release gates enforce size, both pools and all seven PRD digraphs', () => {
  assert.doesNotThrow(() => checkRelease(catalogue.words));
  assert.throws(() => checkRelease(catalogue.words.slice(0, 12)), /200–500/);
  assert.throws(() => checkRelease(Array(501).fill(catalogue.words[0])), /200–500/);
  const noThirdBucket = catalogue.words.filter((word) => word.level !== 2 || word.syllables.length !== 3);
  assert.throws(() => checkRelease(noThirdBucket), /need 2/);
  assert.throws(() => checkRelease(catalogue.words.filter((word) => !word.difficultyFeatures.includes('dż'))), /dż/);
});
test('review template records exact text and hashes without approving anything', async (t) => {
  const { root } = await fixture(t);
  const template = await reviewTemplate(catalogue.words[0], root);
  assert.equal(template.contentHash, wordHash(catalogue.words[0]));
  assert.equal(template.snapshot.word, 'kot'); assert.equal(template.editorial.approved, false);
  assert.equal(template.audio.approved, false); assert.equal(template.clips['audio/w0001/word.mp3'], null);
});
test('draft WAV mapping is hash-bound, local-only and never eligible for release', async (t) => {
  const { root } = await fixture(t);
  const word = catalogue.words[0];
  const path = 'audio/w0001/word.wav';
  const bytes = Buffer.from('RIFF test fixture');
  const clip = { path, wordHash: wordHash(word), sha256: sha256(bytes) };
  await mkdir(dirname(resolve(root, '.cache/draft-audio', path)), { recursive: true });
  await writeFile(resolve(root, '.cache/draft-audio', path), bytes);
  await writeFile(resolve(root, '.cache/draft-audio/manifest.json'), JSON.stringify({ clips: { [word.wordAudio]: clip } }));
  const result = await build({ root, mode: 'preview' });
  const runtime = JSON.parse(await readFile(resolve(result.destination, 'word-catalogue.json'), 'utf8'));
  assert.equal(runtime.words[0].wordAudio, path); assert.equal(runtime.words[0].syllables[0].audio, path);
  assert.equal(result.metadata.draftAudioManifestHash, sha256(await readFile(resolve(root, '.cache/draft-audio/manifest.json'))));
  validateCatalogue(runtime, { allowDraftAudio: true });
  assert.throws(() => validateCatalogue(runtime), /unsafe/);
  await assert.rejects(build({ root }), /200–500/);
  await writeFile(resolve(root, '.cache/draft-audio', path), 'changed');
  await assert.rejects(build({ root, mode: 'preview' }), /Draft audio changed/);
});
