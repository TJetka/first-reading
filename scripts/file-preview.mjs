import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Bundle our four modules for a file:// preview; production keeps external ES modules. */
export async function writeFilePreview(directory, catalogue, buildInfo, filename = 'local-preview.html') {
  const files = ['catalogue.js', 'round.js', 'audio.js', 'app.js'];
  const modules = await Promise.all(files.map((file) => readFile(resolve(directory, file), 'utf8')));
  const script = modules.map((source) => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
  const css = await readFile(resolve(directory, 'tokens.css'), 'utf8')
    + (await readFile(resolve(directory, 'styles.css'), 'utf8')).replace(/^@import .*;\n/m, '');
  const data = JSON.stringify({ catalogue, buildInfo }).replaceAll('<', '\\u003c');
  let html = await readFile(resolve(directory, 'index.html'), 'utf8');
  html = html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    .replace('<link rel="stylesheet" href="./styles.css">', `<style>${css}</style>`)
    .replace('<script type="module" src="./app.js"></script>', '')
    .replace('</body>', `<script type="application/json" id="preview-data">${data}</script><script type="module">${script}</script></body>`);
  await writeFile(resolve(directory, filename), html);
}
