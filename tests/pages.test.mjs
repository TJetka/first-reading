import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';
import { build } from '../scripts/build.mjs';
import { audioPaths } from '../src/catalogue.js';
import { sha256, wordHash } from '../scripts/content.mjs';
import { catalogue, fakeMP3, fixture } from './helpers.mjs';

async function publicFixture(t) {
  const { root } = await fixture(t, { approved: true });
  // Public preview permission never substitutes for editorial/audio sign-off.
  await writeFile(resolve(root, 'content/reviews.json'), JSON.stringify({ schemaVersion: 1, words: {}, audioSets: {} }));
  const manifest = { schemaVersion: 1, purpose: 'public-preview', license: 'MIT',
    datasetLicense: 'CC0-1.0', source: 'https://example.test/model',
    redistributionPermission: 'https://example.test/license', settings: { voice: 'fixture' }, clips: {} };
  for (const word of catalogue.words) {
    for (const path of audioPaths(word)) manifest.clips[path] = { wordHash: wordHash(word), sha256: sha256(fakeMP3) };
  }
  await writeFile(resolve(root, 'content/public-audio.json'), JSON.stringify(manifest));
  return { root, manifest };
}

test('Pages root serves the actual app, with every asset below /first-reading/', async (t) => {
  const { root } = await publicFixture(t);
  const metadata = await buildPages({ root });
  assert.equal(metadata.mode, 'public-preview'); assert.equal(metadata.reviewStatus, 'pending');
  assert.equal(metadata.counts.total, catalogue.words.length); assert.equal(metadata.audioFiles, 1300);
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.match(html, /lang="pl"/); assert.match(html, /id="app"/);
  assert.match(html, /src="\.\/src\/app\.js\?v=/); assert.doesNotMatch(html, /README|Jekyll|\.\/app\.js"/);
  await access(resolve(root, '.nojekyll'));
  for (const [, relative] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(relative, 'https://example.test/first-reading/');
    assert.ok(url.pathname.startsWith('/first-reading/'));
    await access(resolve(root, url.pathname.replace('/first-reading/', '')));
  }
  assert.equal(metadata.catalogueHash, sha256(await readFile(resolve(root, 'word-catalogue.json'))));
  const preview = await build({ root, mode: 'preview' });
  assert.ok(preview.metadata.publicAudioManifestHash);
  assert.equal(preview.metadata.draftAudioManifestHash, null);
  assert.equal(sha256(await readFile(resolve(preview.destination, catalogue.words[0].wordAudio))), sha256(fakeMP3));
  await assert.rejects(build({ root }), /200–500 approved/);
});

test('Pages publishing refuses private, missing or altered audio before writing its entry', async (t) => {
  const { root, manifest } = await publicFixture(t);
  manifest.license = 'private-use-only';
  await writeFile(resolve(root, 'content/public-audio.json'), JSON.stringify(manifest));
  await assert.rejects(buildPages({ root }), /redistributable/);
  await assert.rejects(access(resolve(root, 'index.html')));
  manifest.license = 'MIT';
  const firstPath = catalogue.words[0].wordAudio;
  delete manifest.clips[firstPath];
  await writeFile(resolve(root, 'content/public-audio.json'), JSON.stringify(manifest));
  await assert.rejects(buildPages({ root }), /Missing or stale/);
  manifest.clips[firstPath] = { wordHash: wordHash(catalogue.words[0]), sha256: 'wrong' };
  await writeFile(resolve(root, 'content/public-audio.json'), JSON.stringify(manifest));
  await assert.rejects(buildPages({ root }), /hash mismatch/);
  await assert.rejects(access(resolve(root, 'index.html')));
});
