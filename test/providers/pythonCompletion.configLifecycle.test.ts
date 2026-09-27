import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
}));

vi.mock('../../src/python/workerPool', () => ({
  PythonWorkerPool: vi.fn(function () {
    return {
      initialize: mocks.initialize,
      shutdown: vi.fn(async () => {}),
      execute: vi.fn(async (_api, args) => ({ output: args[1].config.settings.storageUri })),
    };
  }),
}));
vi.mock('../../src/cache', () => ({
  getCache: () => ({}),
  isCacheEnabled: () => false,
}));

let directory: string;
const providers: PythonProvider[] = [];
const releases: Array<() => void> = [];
const loaderGlobals = globalThis as typeof globalThis & {
  pythonConfigLifecycleLoader?: () => Promise<{ storageUri: string }>;
};

beforeEach(async () => {
  mocks.initialize.mockReset().mockResolvedValue(undefined);
  directory = await mkdtemp(path.join(os.tmpdir(), 'python-config-lifetime-'));
  await writeFile(
    path.join(directory, 'provider.py'),
    '# Worker execution is mocked in this suite.\n',
  );
});

afterEach(async () => {
  for (const release of releases.splice(0)) {
    release();
  }
  delete loaderGlobals.pythonConfigLifecycleLoader;
  await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
  await rm(directory, { recursive: true, force: true });
  vi.resetAllMocks();
});

function createProvider(settings: string) {
  const provider = new PythonProvider(path.join(directory, 'provider.py'), {
    config: { basePath: directory, settings, workers: 1 },
  });
  providers.push(provider);
  return provider;
}

async function writeSettings(kind: 'json' | 'javascript') {
  const filename = path.join(directory, kind === 'json' ? 'settings.json' : 'settings.mjs');
  const settings = { storageUri: 'file://store.db' };
  await writeFile(
    filename,
    kind === 'json'
      ? JSON.stringify(settings)
      : `import fs from 'node:fs';
export default function () {
  fs.appendFileSync(${JSON.stringify(path.join(directory, 'loader-calls.txt'))}, 'called\\n');
  return ${JSON.stringify(settings)};
}`,
  );
  return `file://${filename}`;
}

describe('Python provider configuration lifetime', () => {
  it.each(['json', 'javascript'] as const)(
    'preserves resolved %s configuration across worker restarts',
    async (kind) => {
      const settings = await writeSettings(kind);
      const provider = createProvider(settings);
      await Promise.all([provider.initialize(), provider.initialize()]);
      expect(await provider.callApi('first')).toMatchObject({ output: 'file://store.db' });
      await provider.shutdown();
      expect(await provider.callApi('second')).toMatchObject({ output: 'file://store.db' });
      expect(provider.config.settings).toEqual({ storageUri: 'file://store.db' });
      expect(mocks.initialize).toHaveBeenCalledTimes(2);
      if (kind === 'javascript') {
        expect(await readFile(path.join(directory, 'loader-calls.txt'), 'utf8')).toBe('called\n');
      }
    },
  );

  it('retains successfully loaded settings when pool startup fails and retries', async () => {
    const provider = createProvider(await writeSettings('javascript'));
    mocks.initialize.mockRejectedValueOnce(new Error('pool startup failed'));
    await expect(provider.initialize()).rejects.toThrow('pool startup failed');
    expect(await provider.callApi('retry')).toMatchObject({ output: 'file://store.db' });
    expect(await readFile(path.join(directory, 'loader-calls.txt'), 'utf8')).toBe('called\n');
  });

  it('retries failed configuration resolution once the file becomes available', async () => {
    const provider = createProvider(`file://${path.join(directory, 'settings.json')}`);
    await expect(provider.initialize()).rejects.toThrow('ENOENT');
    expect(mocks.initialize).not.toHaveBeenCalled();
    await writeSettings('json');
    expect(await provider.callApi('retry')).toMatchObject({ output: 'file://store.db' });
    expect(mocks.initialize).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    'closes a Python configuration child before shutdown (ignore TERM=%s)',
    async (ignoreTerm) => {
      const filename = path.join(directory, 'blocking.py');
      const pidFile = path.join(directory, 'blocking.pid');
      await writeFile(
        filename,
        `import os, signal, time
from pathlib import Path
def get_config():
 ${ignoreTerm ? 'signal.signal(signal.SIGTERM, signal.SIG_IGN)' : 'pass'}
 Path(__file__).with_suffix('.pid').write_text(str(os.getpid()))
 while True: time.sleep(1)
`,
      );
      const provider = createProvider(`file://${filename}`);
      const initializing = provider.initialize().catch((error: Error) => error);
      let pid: number | undefined;
      const alive = () => {
        if (!pid) {
          return false;
        }
        try {
          process.kill(pid, 0);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            return false;
          }
          throw error;
        }
      };
      try {
        await vi.waitFor(async () => {
          pid = Number(await readFile(pidFile, 'utf8'));
          expect(pid).toBeGreaterThan(0);
        });
        expect(alive()).toBe(true);
        await providerRegistry.shutdownAll();
        expect(await initializing).toMatchObject({ name: 'AbortError' });
        expect(alive()).toBe(false);
        expect(mocks.initialize).not.toHaveBeenCalled();
        await writeFile(filename, "def get_config():\n return {'storageUri': 'retry-ok'}\n");
        expect(await provider.callApi('retry')).toMatchObject({ output: 'retry-ok' });
        expect(mocks.initialize).toHaveBeenCalledOnce();
      } finally {
        if (pid && alive()) {
          process.kill(pid, 'SIGKILL');
        }
        await vi.waitFor(() => expect(alive()).toBe(false));
      }
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'cancels unresolved JavaScript configuration and ignores a late %s after reuse',
    async (completion) => {
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let resolveConfig!: (value: { storageUri: string }) => void;
      let rejectConfig!: (error: Error) => void;
      const pendingConfig = new Promise<{ storageUri: string }>((resolve, reject) => {
        resolveConfig = resolve;
        rejectConfig = reject;
      });
      releases.push(() => resolveConfig({ storageUri: 'stale' }));
      loaderGlobals.pythonConfigLifecycleLoader = () => {
        entered();
        return pendingConfig;
      };
      const filename = path.join(directory, 'pending.mjs');
      await writeFile(filename, 'export default () => globalThis.pythonConfigLifecycleLoader();');
      const provider = createProvider(`file://${filename}`);
      const initializing = provider.initialize().catch((error: Error) => error);
      const alsoInitializing = provider.initialize().catch((error: Error) => error);
      await started;
      let stopped = false;
      const stopping = providerRegistry.shutdownAll().then(() => {
        stopped = true;
      });
      // No elapsed-time assumption: all cancellation reactions settle before the next event-loop turn.
      await setImmediate();
      expect(stopped).toBe(true);
      await stopping;
      expect(await initializing).toMatchObject({ name: 'AbortError' });
      expect(await alsoInitializing).toMatchObject({ name: 'AbortError' });
      expect(mocks.initialize).not.toHaveBeenCalled();

      loaderGlobals.pythonConfigLifecycleLoader = async () => ({ storageUri: 'current' });
      await provider.initialize();
      expect(mocks.initialize).toHaveBeenCalledOnce();
      if (completion === 'resolve') {
        resolveConfig({ storageUri: 'stale' });
      } else {
        rejectConfig(new Error('late loader failure'));
      }
      await setImmediate();
      expect(provider.config.settings).toEqual({ storageUri: 'current' });
      expect(await provider.callApi('reuse')).toMatchObject({ output: 'current' });
      expect(mocks.initialize).toHaveBeenCalledOnce();
      await providerRegistry.shutdownAll();
      await provider.initialize();
      expect(mocks.initialize).toHaveBeenCalledTimes(2);
    },
  );
});
