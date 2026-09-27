import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(async () => {
  mocks.initialize.mockReset().mockResolvedValue(undefined);
  directory = await mkdtemp(path.join(os.tmpdir(), 'python-config-lifetime-'));
  await writeFile(
    path.join(directory, 'provider.py'),
    '# Worker execution is mocked in this suite.\n',
  );
});

afterEach(async () => {
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
});
