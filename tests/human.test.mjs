import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildHuman, fetchHumanSources, validateSources } from '../scripts/build-human.mjs';
import { sha256 } from '../scripts/content.mjs';
import { ROOT } from '../scripts/validate.mjs';
import { validRange, emptyHumanReview, parseHumanReview, changeRange, frameRange, cutWav, clipCredit, portableReview } from '../tools/human-listening/core.js';

const hash = 'a'.repeat(64);
const source = { word: 'mama', file: 'mama.wav', sha256: hash, originalSHA1: 'b'.repeat(40),
  url: 'https://upload.wikimedia.org/wikipedia/commons/example.wav', page: 'https://commons.wikimedia.org/wiki/File:Example.wav',
  licenseURL: 'https://creativecommons.org/licenses/by-sa/3.0/', speaker: 'Test fixture', title: 'Example.wav',
  recordingText: 'mama', license: 'CC BY-SA 3.0', wordRange: [0, 1], cuts: [[0.1, 0.55], [0.5, 0.9]] };
const word = { id: 'w0001', word: 'mama', syllables: ['ma', 'ma'], source, clip: { duration: 1, pcmSHA256: hash } };
const dataset = { id: hash, words: [word], provenance: { decoder: 'test fixture' } };

test('cut boundaries use finite source seconds and allow intentional overlap', () => {
  assert.ok(validRange([0, 1], 1));
  for (const range of [[-1, 1], [1, 0], [0, 1.001], [0, NaN], [0, Infinity], [0, 0.019], ['0', 1], [0]]) assert.equal(validRange(range, 1), false);
  const review = emptyHumanReview(dataset);
  review.words[word.id].segments[1].verdict = 'usable';
  review.words[word.id].segments[2].verdict = 'usable';
  const edited = changeRange(review, word, 1, [0.12, 0.6]);
  assert.equal(edited.words[word.id].segments[1].verdict, 'unreviewed');
  assert.equal(edited.words[word.id].segments[2].verdict, 'usable');
  assert.equal(review.words[word.id].segments[1].verdict, 'usable');
  assert.equal(changeRange(review, word, 1, [0.1, 0.55]).words[word.id].segments[1].verdict, 'usable');
  assert.throws(() => changeRange(review, word, 3, [0, 1]), /boundaries/);
});

test('portable reviews retain credits and bind to exact recordings and valid segments', () => {
  const review = emptyHumanReview(dataset);
  review.words[word.id].note = 'Sprawdź początek.';
  review.words[word.id].sourceVerdict = 'poor';
  const portable = portableReview(review, dataset);
  assert.equal(portable.sources[0].license, source.license);
  assert.equal(portable.sources[0].wordId, word.id);
  assert.deepEqual(parseHumanReview(JSON.parse(JSON.stringify(portable)), dataset), review);
  for (const mutate of [
    (r) => { r.datasetId = 'other'; },
    (r) => { r.words[word.id].sourceSHA256 = 'b'.repeat(64); },
    (r) => { r.words[word.id].pcmSHA256 = 'b'.repeat(64); },
    (r) => { r.words[word.id].segments[1].range = [0.5, 0.4]; },
    (r) => { r.words[word.id].segments[1].verdict = 'approved'; },
    (r) => { r.words[word.id].note = 'x'.repeat(2001); },
    (r) => { r.words[word.id].segments.pop(); },
    (r) => { r.words.extra = r.words[word.id]; },
  ]) {
    const invalid = structuredClone(review); mutate(invalid);
    assert.throws(() => parseHumanReview(invalid, dataset));
  }
});

test('WAV exports have exact selected samples, valid RIFF chunks and source credits', () => {
  const sampleRate = 1000;
  const samples = Float32Array.from({ length: 1000 }, (_, index) => (index - 500) / 1000);
  const range = [0.1, 0.15];
  const frames = frameRange(range, sampleRate, samples.length);
  assert.deepEqual(frames, [100, 150]);
  const credits = clipCredit(word, { range, verdict: 'unreviewed' }, sampleRate, frames);
  const bytes = Buffer.from(cutWav(samples, sampleRate, range, credits));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt16LE(22), 1);
  assert.equal(bytes.readUInt32LE(24), sampleRate);
  assert.equal(bytes.readUInt32LE(40), 100);
  for (let frame = 0; frame < 50; frame++) assert.equal(bytes.readInt16LE(44 + frame * 2), Math.round(samples[100 + frame] * 32768));
  assert.equal(bytes.toString('ascii', 144, 148), 'LIST');
  assert.equal(bytes.readUInt32LE(148), bytes.length - 152);
  assert.equal(bytes.toString('ascii', 152, 160), 'INFOICMT');
  const metadata = JSON.parse(bytes.subarray(164, 164 + bytes.readUInt32LE(160) - 1).toString('utf8'));
  assert.equal(metadata.creator, source.speaker);
  assert.equal(metadata.licenseURL, source.licenseURL);
  assert.deepEqual(metadata.frameRange, frames);
  assert.match(metadata.redistribution, /same license/);
  assert.throws(() => frameRange([0, 2], sampleRate, samples.length));
});

test('source URLs, source identities and filenames are constrained', () => {
  const config = { schemaVersion: 1, purpose: 'human-speech-prototype', sources: [source] };
  assert.equal(validateSources(config), config);
  for (const changes of [{ file: '../outside.wav' }, { url: 'https://example.org/a.wav' }, { url: 'http://upload.wikimedia.org/a.wav' }, { sha256: 'x' }, { speaker: '' }]) {
    assert.throws(() => validateSources({ ...config, sources: [{ ...source, ...changes }] }));
  }
});

test('offline build embeds verified PCM and Piper references, rejects changed source bytes', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'human-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'tools/audio'), { recursive: true });
  await mkdir(resolve(root, '.cache/human-audio'), { recursive: true });
  await mkdir(resolve(root, 'audio/w0001'), { recursive: true });
  await cp(resolve(ROOT, 'tools/human-listening'), resolve(root, 'tools/human-listening'), { recursive: true });
  await writeFile(resolve(root, 'tools/audio/human.py'), '# fixture decoder');
  // Canonical PCM16 fixture: remove the optional credits chunk created by the export helper.
  const pcm = Buffer.from(cutWav(new Float32Array(44100), 44100, [0, 1], '')).subarray(0, 88244);
  pcm.writeUInt32LE(pcm.length - 8, 4);
  const pcmHash = sha256(pcm);
  const fixtureSource = { ...source, sha256: pcmHash };
  const clip = { duration: 1, sampleRate: 44100, frames: 44100, pcmSHA256: pcmHash, dataURL: `data:audio/wav;base64,${pcm.toString('base64')}` };
  const path = resolve(root, '.cache/human-audio/mama.wav');
  await writeFile(path, pcm);
  await writeFile(resolve(root, 'audio/w0001/word.mp3'), Buffer.from([0xff, 0xfb, 1]));
  await writeFile(resolve(root, 'tools/human-listening/sources.json'), JSON.stringify({ schemaVersion: 1, purpose: 'human-speech-prototype', sources: [fixtureSource] }));
  await writeFile(resolve(root, 'word-catalogue.json'), JSON.stringify({ words: [{ id: word.id, word: word.word, wordAudio: 'audio/w0001/word.mp3', syllables: word.syllables.map((text) => ({ text, audio: 'audio/w0001/word.mp3' })) }] }));
  assert.equal(await fetchHumanSources(root), 1); // Reuses a verified fixture; never contacts a service.
  const result = await buildHuman({ root, decoded: { 'mama.wav': clip } });
  assert.equal(result.words, 1); assert.equal(result.cuts, 2);
  const html = await readFile(result.destination, 'utf8');
  assert.match(html, /data:audio\/wav;base64,/); assert.match(html, /data:audio\/mpeg;base64,/);
  assert.match(html, /connect-src 'none'/); assert.doesNotMatch(html, /HUMAN_DATA|HUMAN_SCRIPT|^import /m);
  assert.equal(result.manifest.words[0].source.sha256, pcmHash);
  assert.equal((await buildHuman({ root, decoded: { 'mama.wav': clip } })).manifest.id, result.manifest.id);
  await assert.rejects(buildHuman({ root, decoded: { 'mama.wav': { ...clip, pcmSHA256: hash } } }), /hash or format/);
  await writeFile(path, 'changed audio');
  await assert.rejects(buildHuman({ root, decoded: { 'mama.wav': clip } }), /Source hash mismatch/);
  await assert.rejects(fetchHumanSources(root), /Source hash mismatch/);
  assert.equal(await readFile(path, 'utf8'), 'changed audio');
});
