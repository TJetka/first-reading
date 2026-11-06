import { execFileSync } from 'node:child_process';
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { sha256 } from './content.mjs';
import { ROOT } from './validate.mjs';
import { validRange } from '../tools/human-listening/core.js';

const hashPattern = /^[a-f0-9]{64}$/;

export function validateSources(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.purpose !== 'human-speech-prototype'
    || !Array.isArray(manifest.sources) || !manifest.sources.length) throw new Error('Invalid human source manifest');
  const seen = new Set();
  for (const source of manifest.sources) {
    if (!/^[a-z-]+\.(mp3|wav)$/.test(source.file) || seen.has(source.file)
      || !hashPattern.test(source.sha256) || !/^[a-f0-9]{40}$/.test(source.originalSHA1)
      || !/^[a-ząćęłńóśźż]+$/.test(source.word)) throw new Error('Invalid or repeated recording');
    seen.add(source.file);
    for (const [key, host] of [['url', 'upload.wikimedia.org'], ['page', 'commons.wikimedia.org'], ['licenseURL', 'creativecommons.org']]) {
      const url = new URL(source[key]);
      if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) throw new Error('Untrusted recording URL');
    }
    for (const key of ['speaker', 'title', 'license', 'recordingText']) {
      if (typeof source[key] !== 'string' || !source[key].trim() || source[key].length > 300) throw new Error('Missing source credit');
    }
  }
  return manifest;
}

async function sourceManifest(root) {
  return validateSources(JSON.parse(await readFile(resolve(root, 'tools/human-listening/sources.json'), 'utf8')));
}

async function insideFile(root, path) {
  const base = await realpath(root);
  const file = await realpath(resolve(root, path));
  if (!file.startsWith(`${base}${sep}`)) throw new Error('Recording escapes checkout');
  return file;
}

/** Explicit network step: fetch only missing, pinned public recordings; never replace a source. */
export async function fetchHumanSources(root = ROOT) {
  const manifest = await sourceManifest(root);
  const cache = resolve(root, '.cache/human-audio');
  await mkdir(cache, { recursive: true });
  for (const source of manifest.sources) {
    const destination = resolve(cache, source.file);
    let exists = true;
    try { await lstat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
    if (!exists) {
      const temporary = await mkdtemp(resolve(cache, 'download-'));
      try {
        const path = resolve(temporary, source.file);
        execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--max-time', '60', '--max-filesize', '5000000', source.url, '--output', path]);
        if (sha256(await readFile(path)) !== source.sha256) throw new Error(`Source hash mismatch: ${source.file}`);
        // Hard-link within the same cache filesystem: atomic and refuses an existing destination.
        await link(path, destination);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    const file = await insideFile(root, destination);
    if (sha256(await readFile(file)) !== source.sha256) throw new Error(`Source hash mismatch: ${source.file}; original preserved`);
  }
  return manifest.sources.length;
}

function validatePCM(clip) {
  if (!clip || clip.sampleRate !== 44100 || !Number.isInteger(clip.frames) || clip.frames <= 0
    || clip.frames > 44100 * 15 || clip.duration !== clip.frames / 44100
    || !clip.dataURL?.startsWith('data:audio/wav;base64,')) throw new Error('Invalid decoded recording');
  const bytes = Buffer.from(clip.dataURL.split(',')[1], 'base64');
  if (sha256(bytes) !== clip.pcmSHA256 || bytes.length !== 44 + clip.frames * 2
    || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 16) !== 'WAVEfmt '
    || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 44100
    || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data') throw new Error('Decoded audio hash or format mismatch');
}

/** Package five credited recordings and the published reference clips into one offline page. */
export async function buildHuman({ root = ROOT, decoded, destination = resolve(root, '.cache/listening-lab/human/index.html') } = {}) {
  const configPath = resolve(root, 'tools/human-listening/sources.json');
  const config = await sourceManifest(root);
  for (const source of config.sources) {
    const file = await insideFile(root, `.cache/human-audio/${source.file}`);
    if (sha256(await readFile(file)) !== source.sha256) throw new Error(`Source hash mismatch: ${source.file}`);
  }
  if (!decoded) {
    decoded = JSON.parse(execFileSync(resolve(root, 'tools/audio/.venv/bin/python'), [resolve(root, 'tools/audio/human.py'),
      '--manifest', configPath, '--cache', resolve(root, '.cache/human-audio')], { encoding: 'utf8', maxBuffer: 8_000_000 }));
  }
  const catalogue = JSON.parse(await readFile(resolve(root, 'word-catalogue.json'), 'utf8'));
  const words = [];
  for (const source of config.sources) {
    const word = catalogue.words.find((item) => item.word === source.word);
    const clip = decoded[source.file];
    validatePCM(clip);
    if (!word || !validRange(source.wordRange, clip.duration) || !Array.isArray(source.cuts)
      || source.cuts.length !== word.syllables.length || !source.cuts.every((range) => validRange(range, clip.duration))) throw new Error('Invalid word/cut context');
    const baseline = [];
    for (const path of [word.wordAudio, ...word.syllables.map((item) => item.audio)]) {
      if (!/^audio\/w\d{4}\/[a-z0-9-]+\.mp3$/.test(path)) throw new Error('Invalid reference audio path');
      const bytes = await readFile(await insideFile(root, path));
      baseline.push({ sha256: sha256(bytes), dataURL: `data:audio/mpeg;base64,${bytes.toString('base64')}` });
    }
    words.push({ id: word.id, word: word.word, syllables: word.syllables.map((item) => item.text), source, clip, baseline });
  }
  let gitSHA = 'unavailable';
  try { gitSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Source archive has no Git metadata. */ }
  const manifest = {
    schemaVersion: 1, purpose: config.purpose,
    id: sha256(JSON.stringify(words.map(({ id, syllables, source, clip, baseline }) => ({ id, syllables, source, pcmSHA256: clip.pcmSHA256, baseline: baseline.map((item) => item.sha256) })))),
    provenance: { gitSHA, builtAt: new Date().toISOString(), sourceManifestSHA256: sha256(await readFile(configPath)),
      decoderSHA256: sha256(await readFile(resolve(root, 'tools/audio/human.py'))),
      decoder: 'miniaudio 1.61', processing: 'Decoded to 44,100 Hz mono PCM16. No denoising, normalization, pitch or speed changes.',
      cutStatus: 'Rough manual starting points; no pronunciation or boundary approvals.' },
    words,
  };
  const directory = resolve(root, 'tools/human-listening');
  const files = await Promise.all(['index.html', 'styles.css', 'core.js', 'app.js'].map((file) => readFile(resolve(directory, file), 'utf8')));
  const script = files.slice(2).map((text) => text.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
  const html = files[0].replace('/* HUMAN_STYLES */', () => files[1])
    .replace('/* HUMAN_DATA */', () => JSON.stringify(manifest).replaceAll('<', '\\u003c'))
    .replace('/* HUMAN_SCRIPT */', () => script.replaceAll('</script', '<\\/script'));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html);
  return { destination, words: words.length, cuts: words.reduce((sum, word) => sum + word.syllables.length, 0), manifest };
}
