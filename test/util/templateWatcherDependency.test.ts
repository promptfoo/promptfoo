import { once } from 'node:events';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it } from 'vitest';
import type { FSWatcher } from 'chokidar';

const require = createRequire(import.meta.url);
const requireFromNunjucks = createRequire(require.resolve('nunjucks/package.json'));

it('watches literal template directories using the Nunjucks watcher dependency', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-template-watch-'));
  const template = path.join(directory, 'prompt.njk');
  let watcher: FSWatcher | undefined;
  try {
    await writeFile(template, 'Hello {{ name }}');
    // Nunjucks passes literal search directories to chokidar, not glob patterns.
    watcher = requireFromNunjucks('chokidar').watch([directory]) as FSWatcher;
    await once(watcher, 'ready');

    // Chokidar finishes its initial scan before macOS necessarily starts delivering events.
    // Observe a directory addition before making the single template edit under test.
    const signal = AbortSignal.timeout(5000);
    const directoryAdded = once(watcher, 'addDir', { signal });
    for (;;) {
      const [event] = await Promise.all([
        Promise.race([directoryAdded, delay(25)]),
        mkdtemp(path.join(directory, 'ready-')),
      ]);
      if (event) {
        break;
      }
    }

    const [changed] = await Promise.all([
      once(watcher, 'change', { signal }),
      appendFile(template, '!'),
    ]);
    expect(path.resolve(changed[0])).toBe(template);
  } finally {
    await watcher?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
