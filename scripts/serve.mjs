import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { build } from './build.mjs';
import { isMain, ROOT } from './validate.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

/** Serve only generated assets; never expose the checkout, review files or secrets. */
export function createStaticServer(directory) {
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (path === '/' || path === '/first-reading') {
        response.writeHead(302, { Location: '/first-reading/' }).end(); return;
      }
      const pieces = path.split('/');
      if (pieces.some((piece) => piece.startsWith('.') || piece.includes('\\') || piece.includes('\0'))) {
        response.writeHead(404).end(); return;
      }
      const base = await realpath(directory);
      const file = await realpath(resolve(directory, `.${path}${path.endsWith('/') ? 'index.html' : ''}`));
      if (!file.startsWith(`${base}${sep}`) || !(await stat(file)).isFile() || !TYPES[extname(file)]) {
        response.writeHead(404).end(); return;
      }
      const bytes = await readFile(file);
      const headers = { 'Content-Type': TYPES[extname(file)], 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) { response.writeHead(416).end(); return; }
        const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
        if (start > end || start >= bytes.length) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end(); return; }
        response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
        response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
      } else {
        response.writeHead(200, { ...headers, 'Content-Length': bytes.length });
        response.end(request.method === 'HEAD' ? undefined : bytes);
      }
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
  });
}

if (isMain(import.meta.url)) {
  try {
    const portIndex = process.argv.indexOf('--port');
    const port = Number(portIndex === -1 ? 8000 : process.argv[portIndex + 1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    await build({ mode: 'preview' });
    const server = createStaticServer(resolve(ROOT, 'preview'));
    server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}/first-reading/\nDraft words/audio; not a release. Restart to rebuild changed sources.`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
