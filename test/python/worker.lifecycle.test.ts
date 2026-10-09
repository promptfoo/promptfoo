import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { expect, it, vi } from 'vitest';
import { PythonWorker } from '../../src/python/worker';
import { PythonWorkerPool } from '../../src/python/workerPool';
import * as secureTempFiles from '../../src/util/secureTempFiles';

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

it('replaces repeated timed-out children without exhausting the crash budget', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-worker-lifecycle-'));
  const script = path.join(directory, 'provider.py');
  const marker = path.join(directory, 'pid.txt');
  await fs.writeFile(
    script,
    `import os
import signal
import time


def call_api(mode, marker):
    if mode == "hang":
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        with open(marker, "w", encoding="utf-8") as handle:
            handle.write(str(os.getpid()))
        time.sleep(60)
    return os.getpid()
`,
  );
  const directories: string[] = [];
  const create = secureTempFiles.createSecureTempDirectory;
  const capture = vi
    .spyOn(secureTempFiles, 'createSecureTempDirectory')
    .mockImplementation(async (prefix) => {
      const created = await create(prefix);
      directories.push(created);
      return created;
    });
  const pool = new PythonWorkerPool(script, 'call_api', 1, undefined, 1000);
  try {
    await pool.initialize();
    // Exercise the real worker deadline without charging Windows filesystem and
    // process scheduling delays against the successful replacement request.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (let attempt = 0; attempt < 4; attempt++) {
      await fs.rm(marker, { force: true });
      const timedOut = pool.execute('call_api', ['hang', marker]);
      const rejected = expect(timedOut).rejects.toThrow('Python worker timed out after 1000ms');
      const recovered = pool.execute('call_api', ['recover', marker]).catch((error) => error);
      // Wait for the actual Python call to enter its hanging branch before
      // advancing its deadline. setImmediate and filesystem I/O remain real.
      let originalPid = 0;
      while (!originalPid) {
        try {
          originalPid = Number(await fs.readFile(marker, 'utf-8'));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
        if (!originalPid) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      expect(originalPid).toBeGreaterThan(0);
      expect(() => process.kill(originalPid, 0)).toThrow();
      const replacementPid = await recovered;
      expect(replacementPid).toBeTypeOf('number');
      expect(replacementPid).toBeGreaterThan(0);
      expect(replacementPid).not.toBe(originalPid);
    }
    expect(directories).toHaveLength(8);
    for (const created of directories) {
      await expect(fs.stat(created)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  } finally {
    vi.useRealTimers();
    await pool.shutdown();
    capture.mockRestore();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it.each(['timeout', 'shutdown'] as const)(
  'finishes %s when a descendant retains the worker pipes',
  async (mode) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-worker-descendant-'));
    const script = path.join(directory, 'provider.py');
    const marker = path.join(directory, 'pids.json');
    await fs.writeFile(
      script,
      `import json
import os
import subprocess
import sys
import time


def call_api(mode, marker):
    if mode != "recover":
        # Inherit stdout/stderr so close cannot fire merely because the wrapper exits.
        descendant = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        with open(marker, "w", encoding="utf-8") as handle:
            json.dump({"worker": os.getpid(), "descendant": descendant.pid}, handle)
        if mode == "timeout":
            time.sleep(60)
    return os.getpid()
`,
    );
    const pool = new PythonWorkerPool(script, 'call_api', 1, undefined, 1000);
    const deadline = new AbortController();
    let operation: Promise<unknown> | undefined;
    try {
      await pool.initialize();
      if (mode === 'shutdown') {
        await pool.execute('call_api', [mode, marker]);
        operation = pool.shutdown();
      } else {
        operation = pool.execute('call_api', [mode, marker]).catch((error) => error);
      }
      // Bound cleanup even when the descendant retains the worker's output pipes.
      const outcome = await Promise.race([
        operation,
        sleep(3000, 'still waiting for descendant pipes', { signal: deadline.signal }),
      ]);
      expect(outcome).toEqual(
        mode === 'shutdown' ? undefined : new Error('Python worker timed out after 1000ms'),
      );
      const pids = JSON.parse(await fs.readFile(marker, 'utf-8'));
      expect(() => process.kill(pids.worker, 0)).toThrow();
      if (process.platform === 'win32' && mode === 'timeout') {
        // Forced Windows shutdown terminates the entire process tree.
        expect(() => process.kill(pids.descendant, 0)).toThrow();
      } else {
        expect(() => process.kill(pids.descendant, 0)).not.toThrow();
      }
      if (mode === 'timeout') {
        const replacement = await pool.execute('call_api', ['recover', marker]);
        expect(replacement).toBeTypeOf('number');
        expect(replacement).not.toBe(pids.worker);
      }
    } finally {
      deadline.abort();
      // The provider-created descendant is deliberately independent of wrapper lifetime.
      const pids = await fs
        .readFile(marker, 'utf-8')
        .then(JSON.parse)
        .catch(() => undefined);
      if (pids?.descendant) {
        try {
          process.kill(pids.descendant, 'SIGKILL');
        } catch {
          // It may have already exited while the test was cleaning up.
        }
      }
      await operation;
      await pool.shutdown();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
