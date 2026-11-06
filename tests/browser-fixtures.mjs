// Optional local browser QA fixtures. Never included in production builds.
import { resolve } from 'node:path';
import { readJSON, ROOT } from '../scripts/validate.mjs';
import { writeFilePreview } from '../scripts/file-preview.mjs';

const directory = resolve(ROOT, 'preview/first-reading');
const source = await readJSON(resolve(directory, 'word-catalogue.json'));
const info = await readJSON(resolve(directory, 'build-info.json'));
if (info.mode !== 'preview') throw new Error('QA fixtures require a preview build');
const longWords = structuredClone(source);
longWords.words = [1, 2, 3].flatMap((length) => source.words
  .filter((word) => word.level === 2 && word.syllables.length === length)
  .sort((a, b) => b.word.length - a.word.length)
  .slice(0, length === 3 ? 2 : 5));
await writeFilePreview(directory, longWords, { ...info, levels: [2] }, 'qa-long-words.html');
const missing = structuredClone(longWords);
for (const word of missing.words.filter((word) => word.syllables.length === 1)) {
  word.wordAudio = 'audio/w9999/word.wav';
  word.syllables[0].audio = word.wordAudio;
}
await writeFilePreview(directory, missing, { ...info, levels: [2] }, 'qa-missing-audio.html');
console.log('QA only: preview/first-reading/qa-{long-words,missing-audio}.html');
