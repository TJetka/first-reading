import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildComparison } from '../scripts/build-comparison.mjs';
import { createStaticServer } from '../scripts/serve.mjs';
import { sha256 } from '../scripts/content.mjs';
import { ROOT } from '../scripts/validate.mjs';
import { trialOrder, reviewKey, emptyReview, parseReview, reviewCSV } from '../tools/listening/core.js';

const hash = 'a'.repeat(64);
const dataset = { id: 'experiment', variants: [{ id: 'original' }, { id: 'slower' }, { id: 'stress' }, { id: 'stress-slower' }],
  cases: [{ id: 'w0369-2', text: 'mi', word: 'domino', clips: { original: { sha256: hash } } }] };

test('blind trial order is stable, varied and contains each method once', () => {
  const variants = dataset.variants;
  assert.deepEqual(trialOrder('w0369-2', variants), trialOrder('w0369-2', variants));
  assert.deepEqual(new Set(trialOrder('w0369-2', variants)), new Set(variants));
  assert.notDeepEqual(trialOrder('w0001-1', variants), trialOrder('w0002-2', variants));
  assert.equal(variants[0].id, 'original');
});

test('reviews round-trip exact audio identities and reject mismatched or malformed data', () => {
  const review = emptyReview(dataset.id);
  const key = reviewKey('w0369-2', 'original', hash);
  review.ratings[key] = { score: 4, issues: ['Clipped'] };
  review.winners['w0369-2'] = key;
  review.notes['w0369-2'] = 'Listen to the m.';
  assert.deepEqual(parseReview(JSON.parse(JSON.stringify(review)), dataset), review);
  assert.notEqual(key, reviewKey('w0369-2', 'original', 'b'.repeat(64)));
  assert.throws(() => parseReview({ ...review, datasetId: 'different' }, dataset), /different experiment/);
  for (const score of [0, 6, '5']) {
    assert.throws(() => parseReview({ ...review, ratings: { [key]: { score, issues: [] } } }, dataset), /Invalid rating/);
  }
  assert.throws(() => parseReview({ ...review, winners: { 'w0369-2': 'unknown' } }, dataset), /Invalid preferred/);
  review.ratings[key].score = null;
  assert.equal(parseReview(review, dataset).ratings[key].score, null);
});

test('CSV preserves Polish notes, reports rejection and prevents spreadsheet formulas', () => {
  const review = emptyReview(dataset.id);
  review.notes['w0369-2'] = '=HYPERLINK("bad")';
  review.winners['w0369-2'] = 'none';
  const csv = reviewCSV(dataset, review);
  assert.match(csv, /none acceptable/);
  assert.match(csv, /'\=HYPERLINK/);
  assert.match(csv, /"mi"/);
});

test('offline lab embeds verified audio and serves on its own route', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'listening-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'audio/w0369'), { recursive: true });
  await mkdir(resolve(root, 'tools'), { recursive: true });
  await cp(resolve(ROOT, 'tools/listening'), resolve(root, 'tools/listening'), { recursive: true });
  const bytes = Buffer.from([0xff, 0xfb, 0x90, 0, 1, 2]);
  await writeFile(resolve(root, 'audio/w0369/2.mp3'), bytes);
  const clip = { path: 'audio/w0369/2.mp3', sha256: sha256(bytes), durationSeconds: 0.2 };
  const manifest = { schemaVersion: 1, id: hash, purpose: 'local-listening-experiment', variants: [{ id: 'original' }],
    cases: [{ id: 'w0369-2', word: 'domino', text: 'mi', syllables: ['do', 'mi', 'no'], position: 1, wordClip: clip, clips: { original: clip } }] };
  const path = resolve(root, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest));
  const built = await buildComparison(path, { root });
  assert.equal(built.cases, 1); assert.equal(built.clips, 2);
  const html = await readFile(built.destination, 'utf8');
  assert.match(html, /data:audio\/mpeg;base64,/); assert.doesNotMatch(html, /LAB_DATA|LAB_SCRIPT|^import /m);
  assert.match(html, /connect-src 'none'/);
  const server = createStaticServer(resolve(root, '.cache/listening-lab'), { basePath: '/compare' });
  const response = await new Promise((done) => {
    const result = {};
    server.emit('request', { url: '/', method: 'GET', headers: {} }, {
      writeHead(status, headers) { Object.assign(result, { status, headers }); return this; }, end() { done(result); },
    });
  });
  assert.equal(response.headers.Location, '/compare/');
  manifest.cases[0].clips.original.sha256 = hash;
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(buildComparison(path, { root }), /hash mismatch/);
  manifest.cases[0].clips.original.path = '../outside.wav';
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(buildComparison(path, { root }), /Unsafe/);
});
