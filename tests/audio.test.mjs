import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioController } from '../src/audio.js';

class FakeMedia {
  constructor() { this.src = ''; this.pauses = 0; this.loads = 0; this.plays = 0; }
  play() { this.plays += 1; return this.result ?? Promise.resolve(); }
  pause() { this.pauses += 1; }
  load() { this.loads += 1; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
function controller(overrides = {}) {
  const media = [], ended = [], errors = [], playing = [];
  const audio = new AudioController({ baseURL: 'https://example.test/first-reading/',
    createAudio: () => { const item = new FakeMedia(); media.push(item); return item; },
    onEnd: (token) => ended.push(token), onError: (token) => errors.push(token),
    onPlaying: (token) => playing.push(token), ...overrides });
  return { audio, media, ended, errors, playing };
}
const request = (token, path = 'audio/w0001/word.mp3') => ({ token, path });

test('play is synchronous and resolves assets under the Pages project path', () => {
  const { audio, media, ended, playing } = controller();
  audio.play(request(1));
  assert.equal(media[0].plays, 1);
  assert.equal(media[0].src, 'https://example.test/first-reading/audio/w0001/word.mp3');
  media[0].onplaying(); assert.deepEqual(playing, [1]);
  media[0].onended(); assert.deepEqual(ended, [1]); assert.equal(audio.active, null);
});
test('latest tap wins; stale completion and error events cannot complete playback', () => {
  const { audio, media, ended, errors } = controller();
  audio.play(request(1));
  const staleEnd = media[0].onended, staleError = media[0].onerror;
  audio.play(request(2, 'audio/w0009/2.mp3'));
  assert.equal(media[0].pauses, 1); assert.equal(media[0].src, '');
  staleEnd(); staleError(); assert.deepEqual(ended, []); assert.deepEqual(errors, []);
  media[1].onended(); assert.deepEqual(ended, [2]);
});
test('rejected play promise reports failure once and releases audio', async () => {
  const item = new FakeMedia(); item.result = Promise.reject(new Error('NotAllowedError'));
  const { audio, errors, ended } = controller({ createAudio: () => item });
  audio.play(request(4)); const staleError = item.onerror;
  await Promise.resolve(); await Promise.resolve(); staleError();
  assert.deepEqual(errors, [4]); assert.deepEqual(ended, []); assert.equal(audio.active, null);
});
test('late rejected promise after cancellation is ignored', async () => {
  let reject;
  const item = new FakeMedia(); item.result = new Promise((_, failure) => { reject = failure; });
  const { audio, errors } = controller({ createAudio: () => item });
  audio.play(request(1)); audio.stop(); reject(new Error('Cancelled'));
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(errors, []);
});
test('synchronous audio construction/play errors are recoverable', () => {
  const { audio, errors } = controller({ createAudio: () => { throw new Error('No media'); } });
  audio.play(request(2)); assert.deepEqual(errors, [2]);
  const broken = new FakeMedia(); broken.play = () => { throw new Error('Blocked'); };
  const second = controller({ createAudio: () => broken });
  second.audio.play(request(3)); assert.deepEqual(second.errors, [3]);
});
test('preload is deduplicated, bounded and never plays automatically', () => {
  const { audio, media } = controller();
  const word = { wordAudio: 'audio/w0001/word.mp3', syllables: [{ audio: 'audio/w0001/word.mp3' }] };
  audio.preload([word, word]); audio.preload([word]);
  assert.equal(media.length, 1); assert.equal(media[0].plays, 0); assert.equal(media[0].loads, 1);
  audio.preload([{ ...word, wordAudio: 'audio/w0002/word.mp3', syllables: [] }]);
  assert.equal(audio.preloads.size, 1); assert.equal(media[0].src, '');
  audio.dispose(); assert.equal(audio.preloads.size, 0);
});
