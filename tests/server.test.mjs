import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStaticServer } from '../scripts/serve.mjs';
import { fixture } from './helpers.mjs';

// Exercise the production HTTP handler in process: no sockets or external services.
function request(server, url, headers = {}, method = 'GET') {
  return new Promise((done) => {
    const result = {};
    const response = { writeHead(status, responseHeaders) { Object.assign(result, { status, headers: responseHeaders }); return this; },
      end(body) { result.body = body; done(result); } };
    server.emit('request', { url, headers, method }, response);
  });
}
test('static server serves project routes and byte ranges without exposing source', async (t) => {
  const { root } = await fixture(t);
  const site = resolve(root, 'preview/first-reading');
  await mkdir(site, { recursive: true });
  await writeFile(resolve(site, 'index.html'), '<html lang="pl">test</html>');
  await writeFile(resolve(site, 'test.wav'), '0123456789');
  await writeFile(resolve(site, '.env'), 'not-a-real-secret');
  await symlink(resolve(root, 'word-catalogue.json'), resolve(site, 'escape.json'));
  const server = createStaticServer(resolve(root, 'preview'));
  assert.equal((await request(server, '/')).headers.Location, '/first-reading/');
  assert.equal((await request(server, '/first-reading/')).status, 200);
  assert.equal((await request(server, '/first-reading/', {}, 'HEAD')).body, undefined);
  assert.equal((await request(server, '/first-reading/', {}, 'POST')).status, 405);
  for (const url of ['/PRD.md', '/first-reading/.env', '/first-reading/escape.json', '/first-reading/%00']) {
    assert.equal((await request(server, url)).status, 404);
  }
  assert.equal((await request(server, '/%ZZ')).status, 400);
  const range = await request(server, '/first-reading/test.wav', { range: 'bytes=2-5' });
  assert.equal(range.status, 206); assert.equal(range.body.toString(), '2345');
  assert.equal(range.headers['Content-Range'], 'bytes 2-5/10');
  assert.equal((await request(server, '/first-reading/test.wav', { range: 'bytes=-3' })).body.toString(), '789');
  for (const range of ['bytes=11-20', 'bytes=5-2', 'bytes=-', 'bytes=1-2,4-5']) {
    assert.equal((await request(server, '/first-reading/test.wav', { range })).status, 416);
  }
});
