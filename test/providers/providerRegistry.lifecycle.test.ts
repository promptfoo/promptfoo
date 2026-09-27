import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const events = ['SIGINT', 'SIGTERM', 'beforeExit'] as const;
let originalListeners: Map<(typeof events)[number], Set<(...args: any[]) => void>>;
let registry: typeof import('../../src/providers/providerRegistry').providerRegistry;
const releaseCleanup: Array<() => void> = [];

function listeners(event: (typeof events)[number]): Array<(...args: any[]) => void> {
  return event === 'beforeExit' ? process.listeners('beforeExit') : process.listeners(event);
}

beforeEach(async () => {
  vi.resetModules();
  originalListeners = new Map(events.map((event) => [event, new Set(listeners(event))]));
  registry = (await import('../../src/providers/providerRegistry')).providerRegistry;
});

afterEach(async () => {
  for (const release of releaseCleanup.splice(0)) {
    release();
  }
  await registry.shutdownAll();
  for (const event of events) {
    for (const listener of listeners(event)) {
      if (!originalListeners.get(event)!.has(listener)) {
        process.removeListener(event, listener);
      }
    }
  }
});

function addedListeners(event: (typeof events)[number]) {
  return listeners(event).filter((listener) => !originalListeners.get(event)!.has(listener));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releaseCleanup.push(resolve);
  return { promise, resolve };
}

describe('provider registry signal ownership', () => {
  it('removes only its own listeners when the last provider unregisters and rearms on reuse', () => {
    const hostListener = vi.fn();
    process.on('SIGTERM', hostListener);
    const first = { shutdown: vi.fn().mockResolvedValue(undefined) };
    registry.register(first);
    const firstSignal = addedListeners('SIGINT')[0];
    registry.unregister(first);
    expect(addedListeners('SIGINT')).toEqual([]);
    expect(addedListeners('beforeExit')).toEqual([]);
    expect(addedListeners('SIGTERM')).toEqual([hostListener]);

    registry.register(first);
    expect(addedListeners('SIGINT')).toHaveLength(1);
    expect(addedListeners('SIGINT')[0]).not.toBe(firstSignal);
    registry.unregister(first);
    expect(addedListeners('SIGTERM')).toEqual([hostListener]);
  });

  it('retains listeners while another provider owns live resources', () => {
    const first = { shutdown: vi.fn().mockResolvedValue(undefined) };
    const other = { shutdown: vi.fn().mockResolvedValue(undefined) };
    registry.register(first);
    registry.register(other);
    registry.unregister(first);
    for (const event of events) {
      expect(addedListeners(event)).toHaveLength(1);
    }
    registry.unregister(other);
    for (const event of events) {
      expect(addedListeners(event)).toHaveLength(0);
    }
  });

  it('keeps handlers through synchronous unregister, overlapping cleanup and a new registration', async () => {
    const closing = deferred();
    const first = {
      shutdown: vi.fn(() => {
        registry.unregister(first);
        return closing.promise;
      }),
    };
    registry.register(first);
    const listener = addedListeners('SIGTERM')[0];
    const pending = registry.shutdownAll();
    const concurrent = registry.shutdownAll();
    expect(addedListeners('SIGTERM')).toEqual([listener]);

    const replacement = { shutdown: vi.fn().mockResolvedValue(undefined) };
    registry.register(replacement);
    closing.resolve();
    await Promise.all([pending, concurrent]);
    expect(addedListeners('SIGTERM')).toEqual([listener]);
    expect(first.shutdown).toHaveBeenCalledOnce();
    expect(replacement.shutdown).not.toHaveBeenCalled();

    await registry.shutdownAll();
    expect(replacement.shutdown).toHaveBeenCalledOnce();
    for (const event of events) {
      expect(addedListeners(event)).toHaveLength(0);
    }
  });

  it('releases signal handlers after a caught first Python configuration failure', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-failed-python-'));
    const providerModule = pathToFileURL(path.resolve('src/providers/pythonCompletion.ts')).href;
    const loader = pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href;
    const fixture = path.join(directory, 'provider.py');
    await fs.writeFile(
      fixture,
      "def call_api(prompt, options, context):\n return {'output':'ok'}\n",
    );
    const script = `
        const { PythonProvider } = await import(${JSON.stringify(providerModule)});
        const provider = new PythonProvider(${JSON.stringify(fixture)}, {
          config: { basePath: ${JSON.stringify(directory)}, value: 'file://missing.json' },
        });
        let error;
        try { await provider.initialize(); } catch (caught) { error = String(caught); }
        setInterval(() => {}, 1000);
        process.send({ error, listenerCount: process.listenerCount('SIGTERM') });
      `;
    const child = spawn(
      process.execPath,
      ['--import', loader, '--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: directory,
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
          PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    let stderr = '';
    child.stderr!.on('data', (data) => {
      stderr += String(data);
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
      },
    );
    let timer: NodeJS.Timeout | undefined;
    try {
      const ready = await new Promise<{ error: string; listenerCount: number }>(
        (resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Child did not initialize: ${stderr}`)),
            15_000,
          );
          child.once('message', (message) => {
            clearTimeout(timer);
            resolve(message as { error: string; listenerCount: number });
          });
          child.once('error', reject);
          child.once('exit', () => reject(new Error(`Child exited before ready: ${stderr}`)));
        },
      );
      expect(ready.error).toContain('missing.json');
      expect(ready.error).toContain('ENOENT');
      expect(ready.listenerCount).toBe(0);
      child.kill('SIGTERM');
      const outcome = await Promise.race([
        exited,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 1000);
        }),
      ]);
      expect(outcome).toEqual({ code: null, signal: 'SIGTERM' });
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await exited;
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
