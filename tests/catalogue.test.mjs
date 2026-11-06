import test from 'node:test';
import assert from 'node:assert/strict';
import { audioPaths, catalogueCounts, isAudioPath, validateCatalogue } from '../src/catalogue.js';
import { catalogue, clone } from './helpers.mjs';

test('500 NFC Polish candidates, exact bucket/topic counts and 1,300 distinct clips', () => {
  assert.equal(validateCatalogue(catalogue), catalogue);
  const counts = catalogueCounts(catalogue.words);
  assert.equal(counts.total, 500);
  assert.deepEqual(counts.levels, { 1: [80, 110, 60], 2: [80, 110, 60] });
  assert.equal(Object.keys(counts.categories).length, 8);
  assert.equal(Object.values(counts.categories).reduce((sum, count) => sum + count, 0), 500);
  assert.equal(new Set(catalogue.words.flatMap(audioPaths)).size, 1300);
});

const mutations = [
  ['schema', (c) => { c.schemaVersion = 2; }, /schemaVersion/],
  ['language', (c) => { c.language = 'en'; }, /language/],
  ['duplicate id', (c) => { c.words[1].id = c.words[0].id; }, /duplicate id/],
  ['duplicate word', (c) => { c.words.push(clone(c.words[0])); }, /duplicate word/],
  ['uppercase', (c) => { c.words[0].word = 'Kot'; }, /lowercase NFC/],
  ['decomposed Unicode', (c) => { c.words[0].word = 'za\u0307ba'; }, /NFC/],
  ['topic', (c) => { c.words[0].category = 'Unknown'; }, /category/],
  ['level', (c) => { c.words[0].level = 3; }, /level/],
  ['missing feature', (c) => { c.words[127].difficultyFeatures = []; }, /advanced feature/],
  ['false feature', (c) => { c.words[0].difficultyFeatures = ['sz']; }, /absent/],
  ['hard spelling in easy level', (c) => { c.words[127].level = 1; }, /advanced spelling/],
  ['broken split', (c) => { c.words[0].syllables[0].text = 'ko'; }, /reconstruct/],
  ['no syllables', (c) => { c.words[0].syllables = []; }, /one to three/],
  ['unsafe source', (c) => { c.words[0].wordAudio = '../secrets.mp3'; }, /unsafe/],
  ['monosyllable mismatch', (c) => { c.words[0].syllables[0].audio = 'audio/w0001/1.mp3'; }, /share/],
  ['null record', (c) => { c.words[0] = null; }, /word record/],
  ['split digraph', (c) => {
    const word = c.words.find((entry) => entry.word === 'szafa');
    word.syllables = [{ text: 's', audio: 'audio/w0160/1.mp3' }, { text: 'zafa', audio: 'audio/w0160/2.mp3' }];
  }, /digraph/],
];
for (const [name, mutate, pattern] of mutations) {
  test(`reject ${name}`, () => { const c = clone(catalogue); mutate(c); assert.throws(() => validateCatalogue(c), pattern); });
}

test('explicit syllable counts preserve soft i words', () => {
  for (const [text, count] of [['pies', 1], ['ciasto', 2], ['jezioro', 3]]) {
    assert.equal(catalogue.words.find((word) => word.word === text).syllables.length, count);
  }
});
test('safe path allowlist rejects remote, encoded and traversal paths', () => {
  for (const path of ['/audio/w0001/word.mp3', 'https://x/a.mp3', 'audio/../a.mp3', 'audio/w0001/%2e.mp3', 'audio\\w0001\\word.mp3', 'audio/w0001/word.wav']) assert.equal(isAudioPath(path), false);
  assert.equal(isAudioPath('audio/w0001/word.mp3'), true);
  assert.equal(isAudioPath('audio/w0001/word.wav', true), true);
});
