import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { synthesize } from '../../src/redteam/index';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { SynthesizeOptions } from '../../src/redteam/types';
import type { ApiProvider, ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/logger');
vi.mock('../../src/telemetry');

const generatedPrompt = 'Plan a ski trip to Hawaii in July';
const providerOptions = (config: Record<string, unknown> = {}): ProviderOptions => ({
  id: path.resolve('test/fixtures/providers/cleanup-provider.mjs'),
  config: { output: `Prompt: ${generatedPrompt}`, ...config },
});
const options: SynthesizeOptions = {
  prompts: ['Help the user with {{query}}'],
  purpose: 'Travel assistant',
  entities: [],
  numTests: 1,
  plugins: [{ id: 'overreliance', numTests: 1 }],
  strategies: [],
  targetIds: ['travel-assistant'],
  showProgressBar: false,
};

describe('generation provider cleanup ownership', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true' });
    redteamProviderManager.clearProvider();
    redteamProviderManager.setRateLimitRegistry(undefined);
  });

  afterEach(() => {
    restoreEnv();
    redteamProviderManager.clearProvider();
    vi.restoreAllMocks();
  });

  it.each(['explicit', 'cli'] as const)(
    'cleans an owned %s provider after generating real plugin tests',
    async (source) => {
      const cleanup = vi.fn();
      const call = vi.fn(() => expect(cleanup).not.toHaveBeenCalled());
      const provider = providerOptions({ cleanup, call });
      const result = await cliState.withConfig(
        source === 'cli' ? { redteam: { provider } } : undefined,
        () => synthesize({ ...options, ...(source === 'explicit' ? { provider } : {}) }),
      );

      expect(result.testCases).toEqual([
        expect.objectContaining({
          vars: { query: generatedPrompt },
          assert: [{ type: 'promptfoo:redteam:overreliance', metric: 'Overreliance' }],
          metadata: expect.objectContaining({ pluginId: 'overreliance' }),
        }),
      ]);
      expect(result.failedPlugins).toEqual([]);
      expect(call).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it.each(['plugin', 'extraction'] as const)(
    'cleans an owned provider when %s generation fails',
    async (phase) => {
      const error = new Error('generation failed');
      const cleanup = vi.fn();
      const call = vi.fn().mockRejectedValue(error);
      const result = synthesize({
        ...options,
        purpose: phase === 'extraction' ? undefined : options.purpose,
        provider: providerOptions({ cleanup, call }),
      });

      if (phase === 'extraction') {
        await expect(result).rejects.toBe(error);
      } else {
        await expect(result).resolves.toMatchObject({
          testCases: [],
          failedPlugins: [{ pluginId: 'overreliance', requested: 1 }],
        });
      }
      expect(call).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it('cleans an owned provider when cancelled after generation starts', async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    const call = vi.fn(() => controller.abort());

    await expect(
      synthesize({
        ...options,
        abortSignal: controller.signal,
        provider: providerOptions({ cleanup, call }),
      }),
    ).rejects.toThrow('Operation cancelled');

    expect(call).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each(['during drain', 'after drain timeout'] as const)(
    'blocks retries and cleans once when a concurrent provider settles %s',
    async (completion) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const started = createDeferred<void>();
      const releaseFirst = createDeferred<void>();
      const releaseSecond = createDeferred<void>();
      const cleanup = vi.fn();
      const call = vi.fn(async function (this: { output: string }) {
        const callNumber = call.mock.calls.length;
        if (callNumber === 1) {
          await releaseFirst.promise;
          this.output = 'Prompt: first completed';
        } else if (callNumber === 2) {
          started.resolve();
          await releaseSecond.promise;
          // The real plugin will retry an empty response unless cancellation stops it.
          this.output = '';
        } else {
          this.output = 'Prompt: retry reopened provider';
        }
      });
      const result = synthesize({
        ...options,
        abortSignal: controller.signal,
        maxConcurrency: 2,
        plugins: Array.from({ length: 3 }, () => ({ id: 'overreliance', numTests: 1 })),
        provider: providerOptions({ call, cleanup }),
      }).catch((error: unknown) => error);

      try {
        await started.promise;
        controller.abort();
        releaseFirst.resolve();
        await vi.advanceTimersByTimeAsync(0);
        const cleanupWhileSecondPending = cleanup.mock.calls.length;

        if (completion === 'after drain timeout') {
          await vi.advanceTimersByTimeAsync(999);
          expect(cleanup).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(1);
          expect(await result).toMatchObject({ message: 'Operation cancelled' });
          expect(cleanup).toHaveBeenCalledOnce();
        }

        releaseSecond.resolve();
        await vi.advanceTimersByTimeAsync(0);

        expect(await result).toMatchObject({ message: 'Operation cancelled' });
        expect(cleanup).toHaveBeenCalledOnce();
        // The third queued plugin and the second plugin's late retry must never call the provider.
        expect(call).toHaveBeenCalledTimes(2);
        expect(cleanupWhileSecondPending).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        releaseFirst.resolve();
        releaseSecond.resolve();
        await vi.runAllTimersAsync();
        await result;
        vi.useRealTimers();
      }
    },
  );

  it.each(['supplied', 'cached'] as const)(
    'leaves a %s provider available for subsequent synthesis',
    async (source) => {
      const cleanup = vi.fn();
      const provider: ApiProvider = {
        id: () => 'borrowed-generation-provider',
        callApi: vi.fn().mockResolvedValue({ output: `Prompt: ${generatedPrompt}` }),
        cleanup,
      };
      if (source === 'cached') {
        await redteamProviderManager.setProvider(provider);
      }

      for (let run = 0; run < 2; run++) {
        const result = await synthesize({
          ...options,
          ...(source === 'supplied' ? { provider } : {}),
        });
        expect(result.testCases[0].vars?.query).toBe(generatedPrompt);
        expect(cleanup).not.toHaveBeenCalled();
      }
      expect(provider.callApi).toHaveBeenCalledTimes(2);
    },
  );
});
