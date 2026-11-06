/** Catalogue validation shared by the browser and build tools. */
export const CATEGORIES = Object.freeze([
  'Zwierzęta', 'Dom i ubrania', 'Ludzie i ciało', 'Jedzenie',
  'Przyroda', 'Szkoła i zabawa', 'Podróże i miejsca', 'Czynności',
]);
export const DIGRAPHS = Object.freeze(['ch', 'cz', 'dz', 'dź', 'dż', 'rz', 'sz']);
export const FEATURES = Object.freeze([
  ...DIGRAPHS, ...'ąćęłńóśźżh', 'ci', 'si', 'zi', 'ni', 'dzi', 'i+vowel',
]);
const POLISH = /^[aąbcćdeęfghijklłmnńoóprsśtuwyzźż]+$/u;
const AUDIO_PATH = /^audio\/w\d{4}\/(?:word|[1-3])\.mp3$/;

/** True only for a project-relative, allowlisted MP3 path. */
export function isAudioPath(path, allowDraftAudio = false) {
  return typeof path === 'string' && (AUDIO_PATH.test(path)
    || (allowDraftAudio && /^audio\/w\d{4}\/(?:word|[1-3])\.wav$/.test(path)));
}

function hasFeature(word, feature) {
  return feature === 'i+vowel' ? /i[aąeęiouóy]/u.test(word) : word.includes(feature);
}

/** Validate draft or published records; never infer syllables from vowel counts. */
export function validateCatalogue(catalogue, { allowDraftAudio = false } = {}) {
  const errors = [];
  if (catalogue?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (catalogue?.language !== 'pl-PL') errors.push('language must be pl-PL');
  if (!Array.isArray(catalogue?.words)) throw new Error('words must be an array');
  const ids = new Set();
  const words = new Set();
  for (const entry of catalogue.words) {
    const label = entry?.id ?? '(missing id)';
    const fail = (message) => errors.push(`${label}: ${message}`);
    if (!entry || typeof entry !== 'object') { fail('expected a word record'); continue; }
    if (!/^w\d{4}$/.test(entry.id)) fail('invalid stable id');
    if (ids.has(entry.id)) fail('duplicate id');
    ids.add(entry.id);
    if (typeof entry.word !== 'string' || !POLISH.test(entry.word)
      || entry.word.normalize('NFC') !== entry.word) fail('expected lowercase NFC Polish word');
    if (words.has(entry.word)) fail('duplicate word');
    words.add(entry.word);
    if (!CATEGORIES.includes(entry.category)) fail('unknown category');
    if (![1, 2].includes(entry.level)) fail('level must be 1 or 2');
    const spelling = typeof entry.word === 'string' ? entry.word : '';
    const tags = entry.difficultyFeatures;
    if (!Array.isArray(tags) || new Set(tags).size !== tags.length) {
      fail('difficultyFeatures must be a unique array');
    } else {
      if (tags.some((tag) => !FEATURES.includes(tag) || !hasFeature(spelling, tag))) {
        fail('feature tag is unknown or absent from word');
      }
      const isAdvanced = FEATURES.some((feature) => hasFeature(spelling, feature));
      if (entry.level === 1 && (tags.length || isAdvanced)) fail('advanced spelling in level 1');
      if (entry.level === 2 && (!tags.length || !isAdvanced)) fail('level 2 needs an advanced feature');
    }
    if (!Array.isArray(entry.syllables) || entry.syllables.length < 1 || entry.syllables.length > 3) {
      fail('expected one to three explicit syllables');
      continue;
    }
    if (entry.syllables.map((syllable) => syllable?.text).join('') !== spelling) {
      fail('syllables do not reconstruct word');
    }
    if (!isAudioPath(entry.wordAudio, allowDraftAudio)) fail('unsafe word audio path');
    for (let index = 0; index < entry.syllables.length; index += 1) {
      const syllable = entry.syllables[index];
      if (typeof syllable?.text !== 'string' || !POLISH.test(syllable.text)
        || syllable.text.normalize('NFC') !== syllable.text) fail('invalid syllable spelling');
      if (!isAudioPath(syllable?.audio, allowDraftAudio)) fail('unsafe syllable audio path');
      if (entry.syllables.length === 1 && syllable?.audio !== entry.wordAudio) {
        fail('monosyllable must share whole-word audio');
      }
      const next = entry.syllables[index + 1]?.text;
      if (typeof syllable?.text === 'string' && typeof next === 'string') {
        const boundary = syllable.text.slice(-1) + next[0];
        if (DIGRAPHS.includes(boundary) || /^i[aąeęiouóy]$/.test(boundary)) {
          fail('syllable boundary splits a digraph or soft i spelling');
        }
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return catalogue;
}

/** Unique paths, preserving the word/position mapping in the source record. */
export function audioPaths(word) {
  return [...new Set([word.wordAudio, ...word.syllables.map((syllable) => syllable.audio)])];
}

/** Counts for content review and build reports, without learner data. */
export function catalogueCounts(words) {
  const levels = { 1: [0, 0, 0], 2: [0, 0, 0] };
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const word of words) {
    levels[word.level][word.syllables.length - 1] += 1;
    categories[word.category] += 1;
  }
  return { total: words.length, levels, categories };
}
