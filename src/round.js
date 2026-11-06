export const COMPOSITION = Object.freeze([5, 5, 2]);

/** Fisher–Yates on a copy; rng must return independent values in [0, 1). */
export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('Invalid RNG');
    const other = Math.floor(random * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Draw exactly 5/5/2 distinct entries from a prefiltered publication pool. */
export function drawRound(words, level, rng = Math.random) {
  if (![1, 2].includes(level)) throw new Error('Unknown level');
  const eligible = words.filter((word) => word.level === level);
  if (new Set(eligible.map((word) => word.id)).size !== eligible.length) throw new Error('Duplicate word ids');
  const buckets = COMPOSITION.map((count, index) => {
    const bucket = eligible.filter((word) => word.syllables.length === index + 1);
    if (bucket.length < count) throw new Error(`Level ${level}: need ${count} words with ${index + 1} syllables`);
    return shuffle(bucket, rng).slice(0, count);
  });
  return Object.freeze(buckets.flat());
}

export function initialState(level = 1) {
  return { screen: 'home', level, words: [], index: 0, mode: 'reading',
    request: 0, active: null, error: null, exiting: false };
}

export function currentWord(state) { return state.words[state.index]; }

function playback(state, clip) {
  const request = state.request + 1;
  return { ...state, request, active: { ...clip, token: request }, error: null };
}

/** Pure state machine. Tokens prevent late audio events and repeated advancement. */
export function transition(state, event) {
  if (event.type === 'start' && ['home', 'finished'].includes(state.screen)) {
    if (event.words?.length !== 12 || new Set(event.words.map((word) => word.id)).size !== 12
      || event.words.some((word) => word.level !== state.level)) throw new Error('Invalid round');
    const words = event.words.map((word) => Object.freeze({ ...word,
      syllables: Object.freeze(word.syllables.map((syllable) => Object.freeze({ ...syllable }))) }));
    return { ...initialState(state.level), screen: 'round', words: Object.freeze(words), request: state.request + 1 };
  }
  if (event.type === 'level' && state.screen === 'home' && [1, 2].includes(event.level)) {
    return { ...state, level: event.level };
  }
  if (event.type === 'home' && state.screen === 'finished') {
    return { ...initialState(state.level), request: state.request + 1 };
  }
  if (state.screen !== 'round') return state;
  if (event.type === 'exit') {
    return { ...state, exiting: true, active: null, request: state.request + 1,
      error: state.active?.kind === 'word' ? state.active : state.error };
  }
  if (event.type === 'continue' && state.exiting) return { ...state, exiting: false };
  if (event.type === 'confirmExit' && state.exiting) {
    return { ...initialState(state.level), request: state.request + 1 };
  }
  if (state.exiting) return state;
  const word = currentWord(state);
  if (event.type === 'syllable' && state.mode === 'reading' && word.syllables[event.index]) {
    return playback(state, { kind: 'syllable', index: event.index, path: word.syllables[event.index].audio });
  }
  if (event.type === 'check' && state.mode === 'reading') {
    return playback({ ...state, mode: 'checking' }, { kind: 'word', path: word.wordAudio });
  }
  if (event.type === 'audioEnd' && state.active && state.active.token === event.token) {
    return { ...state, mode: state.active.kind === 'word' ? 'ready' : state.mode, active: null };
  }
  if (event.type === 'audioError' && state.active && state.active.token === event.token) {
    return { ...state, error: state.active, active: null };
  }
  if (event.type === 'retryAudio' && state.error) return playback(state, state.error);
  if (event.type === 'retry' && state.mode === 'ready') {
    return { ...state, mode: 'reading', active: null, error: null, request: state.request + 1 };
  }
  if (event.type === 'next' && state.mode === 'ready') {
    if (state.index === state.words.length - 1) {
      return { ...state, screen: 'finished', words: [], active: null, error: null, request: state.request + 1 };
    }
    return { ...state, index: state.index + 1, mode: 'reading', active: null, error: null, request: state.request + 1 };
  }
  return state;
}
