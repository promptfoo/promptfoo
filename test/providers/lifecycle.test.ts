import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import chokidar from 'chokidar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import * as esm from '../../src/esm';
import { evaluateWithSource } from '../../src/evaluate';
import logger from '../../src/logger';
import { doEval } from '../../src/node/doEval';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { cleanupProvider, trackProvider, withProviderCleanup } from '../../src/providers/lifecycle';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { VoiceCrescendoProvider } from '../../src/redteam/providers/voiceCrescendo/index';
import { clearConfigCache } from '../../src/util/config/default';
import { createDeferred } from '../util/utils';

import type { EvaluateTestSuite } from '../../src/types/index';
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

type StrategyProvider = ApiProvider & {
  getRedTeamProvider(): Promise<ApiProvider>;
  getScoringProvider(): Promise<ApiProvider>;
};

function loadStrategy(name: string, config: ProviderOptions['config']) {
  const id = 'promptfoo:redteam:' + name;
  return loadApiProvider(id, { options: { id, config } }) as Promise<StrategyProvider>;
}

function evaluateFixture(config: Omit<EvaluateTestSuite, 'prompts'> & { prompts?: string[] }) {
  return evaluateWithSource(
    {
      prompts: ['hello'],
      tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      ...config,
    },
    { cache: false },
  );
}

beforeEach(() => {
  vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
});

afterEach(() => {
  redteamProviderManager.clearProvider();
  redteamProviderManager.setRateLimitRegistry(undefined);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('provider cleanup ownership', () => {
  it.each([false, true])(
    'cleans real config providers and leaves borrowed instances open (setupFails=%s)',
    async (setupFails) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-do-eval-cleanup-'));
      const cacheEnabled = isCacheEnabled();
      const previousExitCode = process.exitCode;
      const cleanup = vi.fn().mockResolvedValue(undefined);
      const call = vi.fn();
      const borrowed = makeProvider();
      try {
        const evaluation = doEval(
          { write: false, share: false, table: false, progressBar: false },
          {
            prompts: ['hello'],
            // File-config types omit the caller instances accepted by the runtime loader.
            providers: [providerOptions({ cleanup, call }), borrowed as unknown as ProviderOptions],
            tests: setupFails
              ? path.join(directory, 'missing-tests.json')
              : [{ assert: [{ type: 'equals', value: 'ok' }] }],
          },
          undefined,
          { eventSource: 'library', cache: false },
        );
        if (setupFails) {
          await expect(evaluation).rejects.toThrow('missing-tests.json');
          expect(call).not.toHaveBeenCalled();
        } else {
          const results = await (await evaluation).getResults();
          expect(results.map((result) => result.success)).toEqual([true, true]);
          expect(call).toHaveBeenCalledOnce();
        }
        expect(cleanup).toHaveBeenCalledOnce();
        expect(borrowed.cleanup).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(previousExitCode);
      } finally {
        process.exitCode = previousExitCode;
        if (cacheEnabled) {
          enableCache();
        }
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('cleans fresh config providers after every real watch evaluation', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-do-eval-watch-'));
    const configPath = path.join(directory, 'promptfooconfig.json');
    const cacheEnabled = isCacheEnabled();
    const previousExitCode = process.exitCode;
    try {
      const watcher = new EventEmitter();
      vi.spyOn(chokidar, 'watch').mockReturnValue(watcher as ReturnType<typeof chokidar.watch>);
      const FixtureProvider = await esm.importModule(providerPath);
      // JSON cannot carry the fixture's cleanup callback; observe the real instances here.
      const cleanup = vi.spyOn(FixtureProvider.prototype, 'cleanup').mockResolvedValue(undefined);
      const call = vi.spyOn(FixtureProvider.prototype, 'callApi');
      const config = {
        prompts: ['first'],
        providers: [providerOptions()],
        tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
      };
      fs.writeFileSync(configPath, JSON.stringify(config));
      const result = await doEval(
        { watch: true, write: false, share: false, table: false, progressBar: false },
        {},
        configPath,
        { eventSource: 'library', cache: false },
      );
      expect((await result.getResults()).map((row) => row.success)).toEqual([true]);
      expect(cleanup).toHaveBeenCalledOnce();

      config.prompts = ['second'];
      fs.writeFileSync(configPath, JSON.stringify(config));
      const [onChange] = watcher.listeners('change');
      expect(onChange).toBeTypeOf('function');
      await onChange(configPath);

      expect(call.mock.calls.map(([prompt]) => prompt)).toEqual(['first', 'second']);
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(cleanup.mock.contexts).toEqual(call.mock.contexts);
      expect(cleanup.mock.contexts[1]).not.toBe(cleanup.mock.contexts[0]);
      expect(process.exitCode).toBe(previousExitCode);
    } finally {
      process.exitCode = previousExitCode;
      clearConfigCache();
      if (cacheEnabled) {
        enableCache();
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['caller-owned', 'evaluation-owned', 'nested-owner', 'preloaded'] as const)(
    'preserves %s strategy delegate ownership across real evaluations',
    async (ownership) => {
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
      const strategy = await loadStrategy('crescendo', strategyConfig.config);
      const evaluations = async () => {
        const runs = ownership === 'evaluation-owned' ? 1 : 2;
        const passes = [];
        for (let run = 0; run < runs; run++) {
          const result = await evaluateFixture({
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
          });
          passes.push(result.prompts[0].metrics?.testPassCount);
        }
        expect(passes).toEqual(Array(runs).fill(1));
        if (ownership !== 'evaluation-owned') {
          expect(cleanup).not.toHaveBeenCalled();
        }
      };
      if (ownership === 'preloaded') {
        await strategy.getRedTeamProvider();
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
    },
  );

  it.each(['crescendo', 'custom', 'voice-crescendo'])(
    'releases only configured %s delegates through public terminal cleanup',
    async (name) => {
      const cleanup = vi.fn();
      const borrowed = makeProvider();
      const loaded: ApiProvider =
        name === 'voice-crescendo'
          ? new VoiceCrescendoProvider({ injectVar: 'query' })
          : await loadStrategy(name, {
              strategyText: 'local strategy',
              redteamProvider: providerOptions({ cleanup }),
            });
      const strategy = loaded as StrategyProvider;
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
    },
  );

  it.each(['supplied', 'cached'] as const)(
    'keeps %s delegates borrowed when a strategy is disposed',
    async (source) => {
      const borrowed = makeProvider();
      if (source === 'cached') {
        await redteamProviderManager.setProvider(borrowed);
      }
      const strategy = await loadStrategy('custom', {
        strategyText: 'local strategy',
        ...(source === 'supplied' ? { redteamProvider: borrowed } : {}),
      });
      await strategy.getRedTeamProvider();
      await strategy.getScoringProvider();
      expect(strategy.cleanup).toBeTypeOf('function');
      await strategy.cleanup!();
      expect(borrowed.cleanup).not.toHaveBeenCalled();
      await expect(borrowed.callApi('still usable')).resolves.toMatchObject({ output: 'ok' });
    },
  );

  it('settles every strategy delegate cleanup and reports a failure', async () => {
    const error = new Error('delegate cleanup failed');
    const cleanup = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const strategy = await loadStrategy('custom', {
      strategyText: 'local strategy',
      redteamProvider: providerOptions({ cleanup }),
    });
    await strategy.getRedTeamProvider();
    await strategy.getScoringProvider();
    expect(strategy.cleanup).toBeTypeOf('function');
    await expect(strategy.cleanup!()).rejects.toBe(error);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('disposes a pending delegate after public terminal cleanup instead of returning it', async () => {
    const load = createDeferred<void>();
    const started = createDeferred<void>();
    const cleaned = createDeferred<void>();
    const cleanup = vi.fn(() => cleaned.resolve());
    const strategy = await loadStrategy('crescendo', {
      redteamProvider: providerOptions({
        cleanup,
        waitForLoad: () => {
          started.resolve();
          return load.promise;
        },
      }),
    });
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
          const result = await evaluateFixture({
            providers: [caller],
          });
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
      await evaluateFixture({
        providers: [provider],
      });
      expect(provider.shutdown).not.toHaveBeenCalled();
      expect(provider.cleanup).not.toHaveBeenCalled();
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

  it('retains a failed registered shutdown for global cleanup retry', async () => {
    const error = new Error('resource is still open');
    const close = vi.fn();
    const provider = {
      ...makeProvider(),
      shutdown: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockImplementation(async () => close()),
    };
    providerRegistry.register(provider);
    try {
      await expect(
        withProviderCleanup(async () => {
          trackProvider(provider);
        }),
      ).rejects.toBe(error);
      expect(provider.shutdown).toHaveBeenCalledOnce();
      expect(provider.cleanup).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect.soft(providerRegistry.has(provider)).toBe(true);

      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledTimes(2);
      expect(close).toHaveBeenCalledOnce();
      expect(providerRegistry.has(provider)).toBe(false);
    } finally {
      providerRegistry.unregister(provider);
    }
  });

  it.each([false, true])(
    'deduplicates targeted shutdown without removing re-registration (reregister=%s)',
    async (reregister) => {
      const release = createDeferred<void>();
      const provider = {
        ...makeProvider(),
        shutdown: vi.fn().mockReturnValueOnce(release.promise).mockResolvedValue(undefined),
      };
      providerRegistry.register(provider);
      const pending = providerRegistry.shutdown(provider);
      try {
        expect(providerRegistry.has(provider)).toBe(false);
        await providerRegistry.shutdown(provider);
        expect(provider.shutdown).toHaveBeenCalledOnce();
        if (reregister) {
          providerRegistry.register(provider);
        }
        release.resolve();
        await pending;
        expect(providerRegistry.has(provider)).toBe(reregister);

        await providerRegistry.shutdownAll();
        expect(provider.shutdown).toHaveBeenCalledTimes(reregister ? 2 : 1);
        expect(providerRegistry.has(provider)).toBe(false);
      } finally {
        release.resolve();
        await pending;
        providerRegistry.unregister(provider);
      }
    },
  );

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

  it('cleans a lazily constructed grading provider', async () => {
    const cleanup = vi.fn();
    const result = await evaluateFixture({
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
    });
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
    await evaluateFixture({
      providers: [target],
      tests: [
        {
          options: { provider: { text: grader } },
          assert: [{ type: 'llm-rubric', value: 'ok' }],
        },
      ],
    });
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans constructed test providers when a later test cannot load', async () => {
    const cleanup = vi.fn();
    await expect(
      evaluateFixture({
        providers: ['echo'],
        tests: [
          { provider: providerOptions({ cleanup }) },
          { provider: providerOptions({ fail: true }) },
        ],
      }),
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
    const first = evaluateFixture({
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
    });
    await enteredFirst.promise;
    const second = await evaluateFixture({
      prompts: ['second'],
      providers: [providerOptions({ cleanup: secondCleanup })],
    });
    expect(second.prompts[0].metrics?.testPassCount).toBe(1);
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(firstCleanup).not.toHaveBeenCalled();
    releaseFirst.resolve();
    expect((await first).prompts[0].metrics?.testPassCount).toBe(1);
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

  it.each([false, true])(
    'drains failed cleanup and preserves operation errors (operationThrows=%s)',
    async (operationThrows) => {
      const cleanupError = new Error('cleanup failed');
      const operationError = new Error('evaluation failed');
      const second = makeProvider();
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      await expect(
        withProviderCleanup(async () => {
          trackProvider(
            makeProvider(
              vi.fn(() => {
                throw cleanupError;
              }),
            ),
          );
          trackProvider(second);
          if (operationThrows) {
            throw operationError;
          }
        }),
      ).rejects.toBe(operationThrows ? operationError : cleanupError);
      expect(second.cleanup).toHaveBeenCalledOnce();
      if (operationThrows) {
        expect(warn).toHaveBeenCalledWith('Provider cleanup failed after evaluation error', {
          error: cleanupError,
        });
      }
    },
  );
});
