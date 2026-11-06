import { readFile, mkdir, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { audioPaths } from '../src/catalogue.js';
import { wordHash, sha256 } from '../scripts/content.mjs';
import { ROOT } from '../scripts/validate.mjs';

export const catalogue = JSON.parse(await readFile(new URL('../word-catalogue.json', import.meta.url), 'utf8'));
export function seeded(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(1664525, value) + 1013904223) >>> 0; return value / 4294967296; };
}
export function clone(value) { return structuredClone(value); }

/** Synthetic bytes test structural/hash gates only; never count as playable audio. */
export const fakeMP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(50, 1)]);

export async function fixture(t, { approved = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), 'first-reading-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(resolve(ROOT, 'src'), resolve(root, 'src'), { recursive: true });
  await mkdir(resolve(root, 'content'));
  await mkdir(resolve(root, 'audio'));
  await writeFile(resolve(root, 'word-catalogue.json'), JSON.stringify(catalogue));
  const reviews = { schemaVersion: 1, audioSets: {}, words: {} };
  if (approved) {
    reviews.audioSets.test = { source: 'Synthetic test fixture', voice: 'Fixture',
      redistributionPermission: 'Test only', redistributionApproved: true };
    for (const word of catalogue.words) {
      const clips = {};
      for (const path of audioPaths(word)) {
        await mkdir(dirname(resolve(root, path)), { recursive: true });
        await writeFile(resolve(root, path), fakeMP3);
        clips[path] = sha256(fakeMP3);
      }
      reviews.words[word.id] = { contentHash: wordHash(word),
        editorial: { approved: true, reviewer: 'Test reviewer', date: '2026-01-01' },
        audio: { approved: true, reviewer: 'Test reviewer', date: '2026-01-01' }, audioSet: 'test', clips };
    }
  }
  await writeFile(resolve(root, 'content/reviews.json'), JSON.stringify(reviews));
  return { root, reviews };
}
