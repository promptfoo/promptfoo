import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import * as esm from '../../src/esm';
import { evaluateWithSource } from '../../src/evaluate';
import logger from '../../src/logger';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { cleanupProvider, trackProvider, withProviderCleanup } from '../../src/providers/lifecycle';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { VoiceCrescendoProvider } from '../../src/redteam/providers/voiceCrescendo/index';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/telemetry');

const providerPath = path.resolve('test/fixtures/providers/cleanup-provider.mjs');
const providerOptions = (config: Record<string, unknown> = {}): ProviderOptions => ({
  id: providerPath,
  config: { cleanup: vi.fn(), ...config },
});
const makeProvider = (cleanup = vi.fn()): ApiProvider => ({
  id: () => 'owned',
  callApi: async () => ({ output: 'ok' }),
  cleanup,
});

afterEach(() => {
  redteamProviderManager.clearProvider();
  redteamProviderManager.setRateLimitRegistry(undefined);
  vi.restoreAllMocks();
});

describe('provider cleanup ownership', () => {
  it.each(['caller-owned', 'evaluation-owned', 'nested-owner', 'preloaded'] as const)(
    'preserves %s strategy delegate ownership across real evaluations',
    async (ownership) => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true' });
      let closed = false;
      const cleanup = vi.fn(async () => {
        closed = true;
      });
      const delegate = providerOptions({
        cleanup,
        call: async () => {
          if (closed) {
            throw new Error('delegate is closed');
          }
        },
        output: JSON.stringify({
          generatedQuestion: 'hello',
          rationaleBehindJailbreak: 'local fixture',
          lastResponseSummary: '',
          value: false,
          metadata: 0,
          rationale: 'local fixture',
        }),
      });
      const scorer = await loadApiProvider(providerPath, { options: delegate });
      const strategyConfig = {
        id: 'promptfoo:redteam:crescendo',
        config: { redteamProvider: delegate, injectVar: 'query', maxTurns: 1 },
      };
      const strategy = await loadApiProvider(strategyConfig.id, { options: strategyConfig });
      const evaluations = async () => {
        const runs = ownership === 'evaluation-owned' ? 1 : 2;
        const passes = [];
        for (let run = 0; run < runs; run++) {
          const result = await evaluateWithSource(
            {
              prompts: ['{{query}}'],
              providers: [makeProvider()],
              defaultTest: { options: { provider: scorer } },
              tests: [
                {
                  provider: ownership === 'evaluation-owned' ? strategyConfig : strategy,
                  vars: { query: 'hello' },
                  assert: [{ type: 'equals', value: 'ok' }],
                },
              ],
            },
            { cache: false },
          );
          passes.push(result.prompts[0].metrics?.testPassCount);
        }
        expect(passes).toEqual(Array(runs).fill(1));
        if (ownership !== 'evaluation-owned') {
          expect(cleanup).not.toHaveBeenCalled();
        }
      };
      try {
        if (ownership === 'preloaded') {
          await (
            strategy as ApiProvider & { getRedTeamProvider(): Promise<ApiProvider> }
          ).getRedTeamProvider();
        }
        if (ownership === 'nested-owner' || ownership === 'preloaded') {
          await withProviderCleanup(async () => {
            trackProvider(strategy);
            await evaluations();
            expect(cleanup).not.toHaveBeenCalled();
          });
        } else {
          await evaluations();
        }
        expect(cleanup).toHaveBeenCalledTimes(ownership === 'caller-owned' ? 0 : 1);
        if (ownership === 'caller-owned') {
          expect(strategy.cleanup).toBeTypeOf('function');
          await strategy.cleanup!();
          await strategy.cleanup!();
          expect(cleanup).toHaveBeenCalledOnce();
        }
      } finally {
        restoreEnv();
      }
    },
  );

  it.each(['crescendo', 'custom', 'voice-crescendo'])(
    'releases only configured %s delegates through public terminal cleanup',
    async (name) => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true' });
      const cleanup = vi.fn();
      const borrowed = makeProvider();
      const id = 'promptfoo:redteam:' + name;
      const loaded: ApiProvider =
        name === 'voice-crescendo'
          ? new VoiceCrescendoProvider({ injectVar: 'query' })
          : await loadApiProvider(id, {
              options: {
                id,
                config: {
                  strategyText: 'local strategy',
                  redteamProvider: providerOptions({ cleanup }),
                },
              },
            });
      const strategy = loaded as ApiProvider & {
        getRedTeamProvider(): Promise<ApiProvider>;
        getScoringProvider(): Promise<ApiProvider>;
      };
      try {
        await cliState.withConfig(
          {
            redteam: { provider: providerOptions({ cleanup }) },
            defaultTest: { options: { provider: borrowed } },
          },
          async () => {
            await strategy.getRedTeamProvider();
            await strategy.getScoringProvider();
          },
        );
        expect(cleanup).not.toHaveBeenCalled();
        expect(strategy.cleanup).toBeTypeOf('function');
        await strategy.cleanup!();
        await strategy.cleanup!();
        expect(cleanup).toHaveBeenCalledTimes(name === 'custom' ? 2 : 1);
        expect(borrowed.cleanup).not.toHaveBeenCalled();
        await expect(strategy.getRedTeamProvider()).rejects.toThrow(
          'Provider cleanup scope is closed',
        );
      } finally {
        restoreEnv();
      }
    },
  );

  it.each(['supplied', 'cached'] as const)(
    'keeps %s delegates borrowed when a strategy is disposed',
    async (source) => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true' });
      const borrowed = makeProvider();
      if (source === 'cached') {
        await redteamProviderManager.setProvider(borrowed);
      }
      const id = 'promptfoo:redteam:custom';
      const strategy = (await loadApiProvider(id, {
        options: {
          id,
          config: {
            strategyText: 'local strategy',
            ...(source === 'supplied' ? { redteamProvider: borrowed } : {}),
          },
        },
      })) as ApiProvider & {
        getRedTeamProvider(): Promise<ApiProvider>;
        getScoringProvider(): Promise<ApiProvider>;
      };
      try {
        await strategy.getRedTeamProvider();
        await strategy.getScoringProvider();
        expect(strategy.cleanup).toBeTypeOf('function');
        await strategy.cleanup!();
        expect(borrowed.cleanup).not.toHaveBeenCalled();
        await expect(borrowed.callApi('still usable')).resolves.toMatchObject({ output: 'ok' });
      } finally {
        restoreEnv();
      }
    },
  );

  it('settles every strategy delegate cleanup and reports a failure', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true' });
    const error = new Error('delegate cleanup failed');
    const cleanup = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const id = 'promptfoo:redteam:custom';
    const strategy = (await loadApiProvider(id, {
      options: {
        id,
        config: { strategyText: 'local strategy', redteamProvider: providerOptions({ cleanup }) },
      },
    })) as ApiProvider & {
      getRedTeamProvider(): Promise<ApiProvider>;
      getScoringProvider(): Promise<ApiProvider>;
    };
    try {
      await strategy.getRedTeamProvider();
      await strategy.getScoringProvider();
      expect(strategy.cleanup).toBeTypeOf('function');
      await expect(strategy.cleanup!()).rejects.toBe(error);
      expect(cleanup).toHaveBeenCalledTimes(2);
    } finally {
      restoreEnv();
    }
  });

  it('disposes a pending delegate after public terminal cleanup instead of returning it', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true' });
    const load = createDeferred<void>();
    const started = createDeferred<void>();
    const cleaned = createDeferred<void>();
    const cleanup = vi.fn(() => cleaned.resolve());
    const id = 'promptfoo:redteam:crescendo';
    const strategy = (await loadApiProvider(id, {
      options: {
        id,
        config: {
          redteamProvider: providerOptions({
            cleanup,
            waitForLoad: () => {
              started.resolve();
              return load.promise;
            },
          }),
        },
      },
    })) as ApiProvider & { getRedTeamProvider(): Promise<ApiProvider> };
    const pending = strategy.getRedTeamProvider().catch((error: unknown) => error);
    try {
      await started.promise;
      await strategy.cleanup!();
      expect(cleanup).not.toHaveBeenCalled();
      load.resolve();
      expect(await pending).toMatchObject({ message: 'Provider cleanup scope is closed' });
      await cleaned.promise;
      await strategy.cleanup!();
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      load.resolve();
      await pending;
      restoreEnv();
    }
  });

  it('keeps direct loader results caller-owned', async () => {
    const cleanup = vi.fn();
    const provider = await loadApiProvider(providerPath, { options: providerOptions({ cleanup }) });
    expect(cleanup).not.toHaveBeenCalled();
    await provider.cleanup?.();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each(['single', 'batch'])(
    'keeps %s loader delegates caller-owned across evaluations',
    async (loader) => {
      const cleanup = vi.fn();
      let delegate: ApiProvider | undefined;
      const caller: ApiProvider = {
        id: () => 'caller',
        async callApi(prompt) {
          delegate ??=
            loader === 'single'
              ? await loadApiProvider(providerPath, { options: providerOptions({ cleanup }) })
              : (await loadApiProviders([providerOptions({ cleanup })]))[0];
          return delegate.callApi(prompt);
        },
      };
      try {
        for (let run = 0; run < 2; run++) {
          const result = await evaluateWithSource(
            {
              prompts: ['hello'],
              providers: [caller],
              tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
            },
            { cache: false },
          );
          expect(result.prompts[0].metrics?.testPassCount).toBe(1);
          expect(cleanup).not.toHaveBeenCalled();
        }
      } finally {
        await delegate?.cleanup?.();
      }
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it('preserves process-registered caller providers during evaluation', async () => {
    const provider = { ...makeProvider(), shutdown: vi.fn(async () => {}) };
    providerRegistry.register(provider);
    try {
      await evaluateWithSource(
        {
          prompts: ['hello'],
          providers: [provider],
          tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
        },
        { cache: false },
      );
      expect(provider.shutdown).not.toHaveBeenCalled();
      expect(providerRegistry.has(provider)).toBe(true);
    } finally {
      providerRegistry.unregister(provider);
    }
  });

  it('shuts down a registered owned provider when setup fails', async () => {
    const error = new Error('setup failed');
    const provider = { ...makeProvider(), shutdown: vi.fn(async () => {}) };
    providerRegistry.register(provider);
    try {
      await expect(
        withProviderCleanup(async () => {
          trackProvider(provider);
          throw error;
        }),
      ).rejects.toBe(error);
      expect(provider.shutdown).toHaveBeenCalledOnce();
      expect(providerRegistry.has(provider)).toBe(false);
    } finally {
      providerRegistry.unregister(provider);
    }
  });

  it('reports cleanup failure without replacing a batch load failure', async () => {
    const error = new Error('cleanup failed');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await expect(
      loadApiProviders([
        providerOptions({ cleanup: vi.fn().mockRejectedValue(error) }),
        providerOptions({ fail: true }),
      ]),
    ).rejects.toThrow('provider load failed');
    expect(warn).toHaveBeenCalledWith('Provider cleanup failed after provider load error', {
      error,
    });
  });

  it('cleans a configured provider after programmatic evaluation', async () => {
    const cleanup = vi.fn();
    const result = await evaluateWithSource(
      {
        prompts: ['hello'],
        providers: [providerOptions({ cleanup })],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      },
      { cache: false },
    );
    expect(result.prompts[0].metrics?.testPassCount).toBe(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans a lazily constructed grading provider', async () => {
    const cleanup = vi.fn();
    const result = await evaluateWithSource(
      {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            options: {
              provider: {
                text: providerOptions({ cleanup, output: '{"pass":true,"score":1,"reason":"ok"}' }),
              },
            },
            assert: [{ type: 'llm-rubric', value: 'returns hello' }],
          },
        ],
      },
      { cache: false },
    );
    expect(result.prompts[0].metrics?.testPassCount).toBe(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('leaves caller-supplied target and grader instances open', async () => {
    const cleanup = vi.fn();
    const target = makeProvider(cleanup);
    const grader = {
      ...makeProvider(cleanup),
      callApi: async () => ({ output: '{"pass":true,"score":1,"reason":"ok"}' }),
    };
    await evaluateWithSource(
      {
        prompts: ['hello'],
        providers: [target],
        tests: [
          {
            options: { provider: { text: grader } },
            assert: [{ type: 'llm-rubric', value: 'ok' }],
          },
        ],
      },
      { cache: false },
    );
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans constructed test providers when a later test cannot load', async () => {
    const cleanup = vi.fn();
    await expect(
      evaluateWithSource(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            { provider: providerOptions({ cleanup }) },
            { provider: providerOptions({ fail: true }) },
          ],
        },
        { cache: false },
      ),
    ).rejects.toThrow('provider load failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([false, true])('cleans partial batch loads once (scoped=%s)', async (scoped) => {
    const cleanup = vi.fn();
    const borrowed = makeProvider();
    const load = () =>
      loadApiProviders([borrowed, providerOptions({ cleanup }), providerOptions({ fail: true })]);
    await expect(scoped ? withProviderCleanup(load) : load()).rejects.toThrow(
      'provider load failed',
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(borrowed.cleanup).not.toHaveBeenCalled();
  });

  it.each([false, true])('cleans late batch loads without waiting (scoped=%s)', async (scoped) => {
    const loaded = createDeferred<void>();
    const cleaned = createDeferred<void>();
    const cleanup = vi.fn(() => cleaned.resolve());
    const load = () =>
      loadApiProviders([
        providerOptions({ cleanup, waitForLoad: () => loaded.promise }),
        providerOptions({ fail: true }),
      ]);
    await expect(scoped ? withProviderCleanup(load) : load()).rejects.toThrow(
      'provider load failed',
    );
    expect(cleanup).not.toHaveBeenCalled();
    loaded.resolve();
    await cleaned.promise;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('starts every cleanup in a late file-backed provider batch concurrently', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-lifecycle-'));
    const file = path.join(directory, 'providers.json');
    const loaded = createDeferred<void>();
    const releaseCleanup = createDeferred<void>();
    const firstCleanup = vi.fn(() => releaseCleanup.promise);
    const secondCleanup = vi.fn();
    vi.spyOn(esm, 'importModule').mockResolvedValue(function FixtureProvider(
      options: ProviderOptions,
    ) {
      if (options.config?.fail) {
        throw new Error('provider load failed');
      }
      return loaded.promise.then(() =>
        makeProvider(options.config?.first ? firstCleanup : secondCleanup),
      );
    });
    fs.writeFileSync(
      file,
      JSON.stringify([{ id: providerPath, config: { first: true } }, { id: providerPath }]),
    );
    try {
      await expect(
        loadApiProviders([`file://${file}`, providerOptions({ fail: true })]),
      ).rejects.toThrow('provider load failed');
      loaded.resolve();
      await vi.waitFor(() => expect(secondCleanup).toHaveBeenCalledOnce());
      expect(firstCleanup).toHaveBeenCalledOnce();
    } finally {
      loaded.resolve();
      releaseCleanup.resolve();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps simultaneous evaluation ownership separate', async () => {
    const releaseFirst = createDeferred<void>();
    const enteredFirst = createDeferred<void>();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const first = evaluateWithSource(
      {
        prompts: ['first'],
        providers: [
          providerOptions({
            cleanup: firstCleanup,
            call: () => {
              enteredFirst.resolve();
              return releaseFirst.promise;
            },
          }),
        ],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      },
      { cache: false },
    );
    await enteredFirst.promise;
    await evaluateWithSource(
      {
        prompts: ['second'],
        providers: [providerOptions({ cleanup: secondCleanup })],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      },
      { cache: false },
    );
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(firstCleanup).not.toHaveBeenCalled();
    releaseFirst.resolve();
    await first;
    expect(firstCleanup).toHaveBeenCalledOnce();
  });

  it('deduplicates batch and scope cleanup and awaits async hooks', async () => {
    const release = createDeferred<void>();
    const entered = createDeferred<void>();
    const cleanup = vi.fn(async () => {
      entered.resolve();
      await release.promise;
    });
    const provider = makeProvider(cleanup);
    let completed = false;
    const run = withProviderCleanup(async () => {
      trackProvider(provider);
      trackProvider(provider);
      await cleanupProvider(provider);
    }).then(() => {
      completed = true;
    });
    await entered.promise;
    expect(completed).toBe(false);
    release.resolve();
    await run;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('cleans every provider even when one synchronous hook throws', async () => {
    const error = new Error('cleanup failed');
    const second = makeProvider();
    await expect(
      withProviderCleanup(async () => {
        trackProvider(
          makeProvider(
            vi.fn(() => {
              throw error;
            }),
          ),
        );
        trackProvider(second);
      }),
    ).rejects.toBe(error);
    expect(second.cleanup).toHaveBeenCalledOnce();
  });

  it('preserves the original operation failure when cleanup also fails', async () => {
    const error = new Error('evaluation failed');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await expect(
      withProviderCleanup(async () => {
        trackProvider(
          makeProvider(
            vi.fn(() => {
              throw new Error('cleanup failed');
            }),
          ),
        );
        throw error;
      }),
    ).rejects.toBe(error);
    expect(warn).toHaveBeenCalledWith('Provider cleanup failed after evaluation error', {
      error: expect.any(Error),
    });
  });

  it('does not clean untracked process-registered providers', async () => {
    const provider = { ...makeProvider(), shutdown: vi.fn(async () => {}) };
    providerRegistry.register(provider);
    try {
      await withProviderCleanup(async () => {
        providerRegistry.unregister(provider);
      });
      expect(provider.cleanup).not.toHaveBeenCalled();
    } finally {
      providerRegistry.unregister(provider);
    }
  });
});
