import { resolve } from 'node:path';
import { buildHuman, fetchHumanSources } from './build-human.mjs';
import { createStaticServer } from './serve.mjs';
import { ROOT } from './validate.mjs';

try {
  if (process.argv.includes('--fetch')) {
    console.log(`Verified ${await fetchHumanSources()} human recordings in .cache/human-audio/`);
  } else {
    const result = await buildHuman();
    console.log(`${result.words} human words / ${result.cuts} editable syllables. Offline page: ${result.destination}`);
    if (!process.argv.includes('--build-only')) {
      const index = process.argv.indexOf('--port');
      const port = index === -1 ? 8002 : Number(process.argv[index + 1]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
      const server = createStaticServer(resolve(ROOT, '.cache/listening-lab'), { basePath: '/human' });
      server.on('error', (error) => { console.error(`${error.message}\nOpen the offline page above, or choose another --port.`); process.exitCode = 1; });
      server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/human/`));
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
    }
  }
} catch (error) {
  console.error(`${error.message}\nSetup: see tools/human-listening/README.md. Existing recordings are preserved.`);
  process.exitCode = 1;
}
