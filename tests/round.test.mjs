import test from 'node:test';
import assert from 'node:assert/strict';
import { currentWord, drawRound, initialState, shuffle, transition } from '../src/round.js';
import { catalogue, seeded } from './helpers.mjs';

function start(level = 1) {
  return transition(initialState(level), { type: 'start', words: drawRound(catalogue.words, level, seeded(42)) });
}
function ready(state) {
  const checking = transition(state, { type: 'check' });
  return transition(checking, { type: 'audioEnd', token: checking.active.token });
}

for (const level of [1, 2]) {
  test(`level ${level}: 1,000 seeded draws have 12 distinct IDs, 5/5/2 and variation`, () => {
    const variations = new Set();
    for (let seed = 0; seed < 1000; seed += 1) {
      const round = drawRound(catalogue.words, level, seeded(seed));
      assert.equal(round.length, 12);
      assert.equal(new Set(round.map((word) => word.id)).size, 12);
      assert.ok(round.every((word) => word.level === level));
      assert.deepEqual(round.map((word) => word.syllables.length), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]);
      variations.add(round.map((word) => word.id).join(','));
    }
    assert.ok(variations.size > 990);
  });
}
test('draw is deterministic and never mutates source', () => {
  const before = JSON.stringify(catalogue);
  assert.deepEqual(drawRound(catalogue.words, 1, seeded(7)), drawRound(catalogue.words, 1, seeded(7)));
  assert.equal(JSON.stringify(catalogue), before);
});
test('missing bucket never borrows from another level', () => {
  const reduced = catalogue.words.filter((word) => word.level === 2 || word.syllables.length !== 3);
  assert.throws(() => drawRound(reduced, 1), /need 2/);
  assert.throws(() => drawRound(catalogue.words, 3), /level/);
  assert.throws(() => drawRound([...catalogue.words, catalogue.words[0]], 1), /Duplicate/);
  assert.throws(() => shuffle([1, 2], () => 1), /RNG/);
});
test('retry returns to same frozen card and index, silently', () => {
  let state = start();
  const ids = state.words.map((word) => word.id);
  state = transition(ready(state), { type: 'retry' });
  assert.equal(state.mode, 'reading'); assert.equal(state.index, 0); assert.equal(state.active, null);
  assert.deepEqual(state.words.map((word) => word.id), ids);
  assert.ok(Object.isFrozen(state.words)); assert.ok(Object.isFrozen(currentWord(state).syllables));
});
test('only successful active whole-word completion allows one advance', () => {
  let state = start();
  assert.equal(transition(state, { type: 'next' }), state);
  state = transition(state, { type: 'syllable', index: 0 });
  const oldToken = state.active.token;
  state = transition(state, { type: 'check' });
  assert.equal(transition(state, { type: 'audioEnd', token: oldToken }), state);
  state = transition(state, { type: 'audioEnd', token: state.active.token });
  assert.equal(state.mode, 'ready');
  state = transition(state, { type: 'next' });
  assert.equal(state.index, 1);
  assert.equal(transition(state, { type: 'next' }), state);
  assert.equal(transition(state, { type: 'audioEnd', token: oldToken }), state);
});
test('failed check retries identical clip without advancing', () => {
  let state = transition(start(), { type: 'check' });
  const request = state.active;
  state = transition(state, { type: 'audioError', token: request.token });
  assert.equal(state.index, 0); assert.equal(state.mode, 'checking'); assert.equal(state.active, null);
  assert.equal(transition(state, { type: 'next' }), state);
  state = transition(state, { type: 'retryAudio' });
  assert.equal(state.active.path, request.path); assert.notEqual(state.active.token, request.token);
  state = transition(state, { type: 'audioEnd', token: state.active.token });
  assert.equal(state.mode, 'ready');
});
test('failed syllable retries and remains in reading mode', () => {
  let state = transition(start(), { type: 'syllable', index: 0 });
  state = transition(state, { type: 'audioError', token: state.active.token });
  state = transition(state, { type: 'retryAudio' });
  state = transition(state, { type: 'audioEnd', token: state.active.token });
  assert.equal(state.mode, 'reading'); assert.equal(state.index, 0);
});
test('exit interrupts sound; continue preserves card and provides replay', () => {
  let state = transition(start(), { type: 'check' });
  const token = state.active.token;
  const id = currentWord(state).id;
  state = transition(state, { type: 'exit' });
  assert.equal(state.active, null); assert.ok(state.error);
  assert.equal(transition(state, { type: 'audioEnd', token }), state);
  state = transition(state, { type: 'continue' });
  assert.equal(currentWord(state).id, id); assert.equal(state.index, 0);
  state = transition(state, { type: 'retryAudio' });
  assert.ok(state.active); assert.notEqual(state.active.token, token);
  state = transition(transition(state, { type: 'exit' }), { type: 'confirmExit' });
  assert.equal(state.screen, 'home'); assert.deepEqual(state.words, []);
  assert.equal(transition(state, { type: 'audioEnd', token }), state);
});
test('end-to-end tiny round ends on 12, restarts at 1 and retains level', () => {
  let state = start(2);
  for (let index = 0; index < 12; index += 1) {
    assert.equal(state.index, index);
    state = transition(ready(state), { type: 'next' });
  }
  assert.equal(state.screen, 'finished'); assert.deepEqual(state.words, []);
  state = transition(state, { type: 'start', words: drawRound(catalogue.words, 2, seeded(8)) });
  assert.equal(state.index, 0); assert.equal(state.level, 2); assert.equal(state.active, null);
});
test('level changes apply only on home; repeated start cannot reset a round', () => {
  const state = start();
  assert.equal(transition(state, { type: 'level', level: 2 }), state);
  assert.equal(transition(state, { type: 'start', words: state.words }), state);
});
