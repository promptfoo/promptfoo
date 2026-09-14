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

  it.each(['resolve', 'reject'] as const)(
    'rejects while the real Python function stays held, then observes late %s',
    async (settlement) => {
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
    if (directory / "fail").exists():
        raise RuntimeError("late independent Python preparation failure")
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
      let outcome: unknown;
      const pending = provider
        .callApi('fixture', undefined, { abortSignal: controller.signal })
        .then(
          (value) => {
            outcome = value;
          },
          (error) => {
            outcome = error;
          },
        );
      try {
        await vi.waitFor(() => access(path.join(directory, 'started')));
        controller.abort(reason);
        await vi.waitFor(() => expect(outcome).toBe(reason));
        await expect(access(path.join(directory, 'finished'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        if (settlement === 'reject') {
          await writeFile(path.join(directory, 'fail'), 'fail');
        }
        await writeFile(path.join(directory, 'release'), 'release');
        await pending;
        expect(runPython).toHaveBeenCalledOnce();
        const underlying = runPython.mock.results[0].value;
        if (settlement === 'reject') {
          await expect(underlying).rejects.toThrow('late independent Python preparation failure');
        } else {
          await expect(underlying).resolves.toEqual([]);
        }
      }
      await access(path.join(directory, 'finished'));
      expect(outcome).toBe(reason);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );
});
