import { resolve } from 'node:path';
import { buildComparison, prepareComparison } from './build-comparison.mjs';
import { createStaticServer } from './serve.mjs';
import { ROOT } from './validate.mjs';

try {
  const index = process.argv.indexOf('--port');
  const port = index === -1 ? 8001 : Number(process.argv[index + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const manifest = prepareComparison();
  const result = await buildComparison(manifest);
  console.log(`${result.cases} trials / ${result.clips} clips. Offline page: ${result.destination}`);
  if (!process.argv.includes('--build-only')) {
    const server = createStaticServer(resolve(ROOT, '.cache/listening-lab'), { basePath: '/compare' });
    server.on('error', (error) => { console.error(`${error.message}\nOpen the offline page above, or choose another --port.`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/compare/`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
