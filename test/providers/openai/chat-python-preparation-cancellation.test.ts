import { watch } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import * as pythonUtils from '../../../src/python/pythonUtils';
import { mockProcessEnv } from '../../util/utils';

import type { ApiProvider } from '../../../src/types';

describe('public Chat Python tool preparation', () => {
  let directory: string;
  let restoreEnvironment: () => void;
  let cacheWasEnabled: boolean;
  let provider: ApiProvider | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-chat-python-preparation-'));
    restoreEnvironment = mockProcessEnv({ OPENAI_API_KEY: 'fixture-key' });
    cacheWasEnabled = cache.isCacheEnabled();
    cache.disableCache();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    await provider?.cleanup?.();
    provider = undefined;
    vi.restoreAllMocks();
    restoreEnvironment();
    if (cacheWasEnabled) {
      cache.enableCache();
    }
    await rm(directory, { recursive: true, force: true });
  });

  it('stops a canceled Python loader before it completes and permits a later call', async () => {
    const file = path.join(directory, 'tools.py');
    await writeFile(
      file,
      `from pathlib import Path
import time

def get_tools():
    directory = Path(__file__).parent
    (directory / "started").write_text("started")
    while not (directory / "release").exists():
        time.sleep(0.01)
    (directory / "finished").write_text("finished")
    return []
`,
    );
    const runPython = vi.spyOn(pythonUtils, 'runPython');
    provider = await loadApiProvider('openai:chat:gpt-4o', {
      options: { config: { tools: `file://${file}:get_tools`, maxRetries: 0 } },
    });
    const controller = new AbortController();
    const reason = Object.assign(new Error('cancel held Python preparation'), {
      name: 'AbortError',
    });
    const watcher = watch(directory);
    const started = new Promise<void>((resolve, reject) => {
      watcher.on('change', (_event, filename) => {
        if (filename?.toString() === 'started') {
          resolve();
        }
      });
      watcher.on('error', reject);
    });
    let outcome: unknown;
    const pending = provider.callApi('fixture', undefined, { abortSignal: controller.signal }).then(
      (value) => {
        outcome = value;
      },
      (error) => {
        outcome = error;
      },
    );
    try {
      await Promise.race([
        started,
        pending.then(() => {
          throw new Error('Python preparation settled before its readiness signal', {
            cause: outcome,
          });
        }),
      ]);
      controller.abort(reason);
      await vi.waitFor(() => expect(outcome).toBe(reason));
      await expect(access(path.join(directory, 'finished'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      watcher.close();
      controller.abort(reason);
      await pending;
      expect(runPython).toHaveBeenCalledOnce();
      await expect(runPython.mock.results[0].value).rejects.toBe(reason);
    }
    await expect(access(path.join(directory, 'finished'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(outcome).toBe(reason);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await writeFile(path.join(directory, 'release'), 'release');
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'recovered' }, finish_reason: 'stop' }],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(provider.callApi('fixture')).resolves.toMatchObject({ output: 'recovered' });
    await access(path.join(directory, 'finished'));
    expect(runPython).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
