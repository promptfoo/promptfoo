import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';
import { PythonWorker } from '../../src/python/worker';

it('finishes cleanup when the validated interpreter is no longer available', async () => {
  const missing = path.join(os.tmpdir(), `promptfoo-missing-python-${randomUUID()}`);
  const worker = new PythonWorker('unused.py', 'call_api', missing);
  try {
    await expect(worker.initialize(missing)).rejects.toThrow(/ENOENT/);
  } finally {
    // PythonShell does not emit its own close event after a spawn failure.
    await worker.shutdown();
  }
  expect(worker.isReady()).toBe(false);
});
