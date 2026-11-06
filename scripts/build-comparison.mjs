import { execFileSync } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { sha256 } from './content.mjs';
import { ROOT } from './validate.mjs';

/** Copy only verified experiment audio into a self-contained, offline listening page. */
export async function buildComparison(manifestPath, { root = ROOT, destination = resolve(root, '.cache/listening-lab/compare/index.html') } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.purpose !== 'local-listening-experiment'
    || !/^[a-f0-9]{64}$/.test(manifest.id) || !manifest.cases?.length || !manifest.variants?.length) throw new Error('Invalid listening experiment');
  const base = await realpath(root);
  const embedded = structuredClone(manifest);
  const ids = new Set();
  for (const item of embedded.cases) {
    if (!/^w\d{4}-[1-3]$/.test(item.id) || ids.has(item.id)) throw new Error('Invalid or repeated trial ID');
    ids.add(item.id);
    if (!Array.isArray(item.syllables) || item.syllables[item.position] !== item.text
      || item.syllables.join('') !== item.word) throw new Error('Invalid trial syllable context');
    for (const variant of embedded.variants) if (!item.clips[variant.id]) throw new Error('Missing trial variant');
    for (const clip of [item.wordClip, ...Object.values(item.clips)]) {
      if (typeof clip.path !== 'string' || !/^(audio|\.cache\/audio-comparison)\//.test(clip.path)
        || clip.path.split('/').some((part) => part === '..' || part.includes('\\'))
        || !['.mp3', '.wav'].includes(extname(clip.path))) throw new Error('Unsafe experiment audio path');
      const file = await realpath(resolve(root, clip.path));
      if (!file.startsWith(`${base}${sep}`)) throw new Error('Experiment audio escapes checkout');
      const bytes = await readFile(file);
      if (bytes.length > 2_000_000 || sha256(bytes) !== clip.sha256) throw new Error('Experiment audio hash mismatch');
      clip.dataURL = `data:audio/${extname(file) === '.mp3' ? 'mpeg' : 'wav'};base64,${bytes.toString('base64')}`;
      delete clip.path;
    }
  }
  const directory = resolve(root, 'tools/listening');
  const source = await Promise.all(['index.html', 'styles.css', 'core.js', 'app.js'].map((file) => readFile(resolve(directory, file), 'utf8')));
  const script = source.slice(2).map((text) => text.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
  const html = source[0].replace('/* LAB_STYLES */', () => source[1])
    .replace('/* LAB_DATA */', () => JSON.stringify(embedded).replaceAll('<', '\\u003c'))
    .replace('/* LAB_SCRIPT */', () => script.replaceAll('</script', '<\\/script'));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html);
  return { destination, cases: embedded.cases.length, clips: embedded.cases.reduce((total, item) => total + Object.keys(item.clips).length + 1, 0) };
}

/** Reuse the locked local renderer; no API keys or cloud speech calls are needed. */
export function prepareComparison(root = ROOT) {
  const python = resolve(root, 'tools/audio/.venv/bin/python');
  try {
    const result = execFileSync(python, [resolve(root, 'tools/audio/compare.py'), '--root', root,
      '--model', resolve(root, '.cache/models/gosia/pl_PL-gosia-medium.onnx')], { cwd: root, encoding: 'utf8', maxBuffer: 1_000_000 });
    return result.trim().split('\n').at(-1);
  } catch (error) {
    throw new Error(`Cannot prepare comparison audio. Follow tools/audio/README.md to install the locked renderer and Gosia model. ${error.message}`, { cause: error });
  }
}
