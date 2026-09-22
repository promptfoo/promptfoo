import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { evaluateWithSource } from '../../src/evaluate';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { doEval } from '../../src/node/doEval';
import { getDefaultProviders, setDefaultCompletionProviders } from '../../src/providers/defaults';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { checkCloudPermissions } from '../../src/util/cloud';
import { loadDefaultConfig } from '../../src/util/config/default';
import { resolveConfigs } from '../../src/util/config/load';
import { writeMultipleOutputs } from '../../src/util/index';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, Assertion, TestSuite } from '../../src/types/index';

mockProcessEnv({ OPENAI_API_KEY: 'synthetic-default-provider-key' });

const watcher = vi.hoisted(() => {
  const handlers = new Map<string, (path: string) => Promise<void>>();
  const instance = {
    on: vi.fn(),
    close: vi.fn(),
  };
  return { handlers, instance, watch: vi.fn() };
});

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

vi.mock('chokidar', () => ({ default: { watch: watcher.watch } }));
vi.mock('../../src/globalConfig/accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/globalConfig/accounts')>()),
  getAuthor: vi.fn(() => null),
}));
vi.mock('../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/cloud')>()),
  checkCloudPermissions: vi.fn(),
}));
vi.mock('../../src/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/share')>()),
  isSharingEnabled: vi.fn(() => false),
}));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));
vi.mock('../../src/providers/defaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/defaults')>()),
  getDefaultProviders: vi.fn(),
}));
vi.mock('../../src/providers/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/index')>()),
  loadApiProvider: vi.fn(),
  loadApiProviders: vi.fn(),
}));
vi.mock('../../src/util/config/default', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/config/default')>()),
  loadDefaultConfig: vi.fn(),
  clearConfigCache: vi.fn(),
}));
vi.mock('../../src/util/config/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/config/load')>()),
  resolveConfigs: vi.fn(),
}));
vi.mock('../../src/util/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/index')>()),
  setupEnv: vi.fn(),
  writeMultipleOutputs: vi.fn(),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function useActualDefaultProviders() {
  const actual = await vi.importActual<typeof import('../../src/providers/defaults')>(
    '../../src/providers/defaults',
  );
  vi.mocked(getDefaultProviders).mockImplementation(actual.getDefaultProviders);
}

const rubric: Assertion = { type: 'llm-rubric', value: 'GRADER_B: the answer is target-B.' };

// Where the shared provider appears does not matter: an overlapping evaluation keeps it
// alive whether it is a target, a suite grader or a global default.
const positions: {
  name: string;
  configure: (suite: TestSuite, shared: ApiProvider) => void | Promise<void>;
  entry?: 'public' | 'direct';
  outcome?: 'error' | 'abort';
}[] = [
  {
    name: 'watch target and grader',
    configure: (suite, shared) => {
      suite.providers = [shared];
      suite.defaultTest = { options: { provider: shared }, assert: [rubric] };
    },
  },
  {
    name: 'global default grader',
    entry: 'public',
    configure: async (suite, shared) => {
      await useActualDefaultProviders();
      await setDefaultCompletionProviders(shared);
      suite.tests = [{ assert: [rubric] }];
    },
  },
  {
    name: 'direct test grader failure',
    entry: 'direct',
    outcome: 'error',
    configure: (suite, shared) => {
      suite.tests = [{ options: { provider: shared }, assert: [rubric] }];
    },
  },
  {
    name: 'public test grader cancellation',
    entry: 'public',
    outcome: 'abort',
    configure: (suite, shared) => {
      suite.tests = [{ options: { provider: shared }, assert: [rubric] }];
    },
  },
];

describe('evaluation ownership of supplied grading providers', () => {
  const priorCliState = {
    config: cliState.config,
    basePath: cliState.basePath,
    resume: cliState.resume,
    retryMode: cliState.retryMode,
    _retryErrorResultIds: cliState._retryErrorResultIds,
    maxConcurrency: cliState.maxConcurrency,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const actualProviders = await vi.importActual<typeof import('../../src/providers/index')>(
      '../../src/providers/index',
    );
    vi.mocked(loadApiProviders).mockImplementation(actualProviders.loadApiProviders);
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('Unexpected network request'));
    cliState.config = undefined;
    cliState.basePath = '';
    cliState.resume = false;
    cliState.retryMode = false;
    cliState._retryErrorResultIds = undefined;
    watcher.handlers.clear();
    watcher.instance.on.mockImplementation(
      (event: string, callback: (path: string) => Promise<void>) => {
        watcher.handlers.set(event, callback);
        return watcher.instance;
      },
    );
    watcher.watch.mockReturnValue(watcher.instance);
    watcher.instance.close.mockResolvedValue(undefined);
    vi.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    vi.mocked(loadApiProvider).mockImplementation(async (id) => {
      throw new Error(`Unexpected provider construction: ${id}`);
    });
    const unused: ApiProvider = {
      id: () => 'unused-default-provider',
      callApi: async () => {
        throw new Error('Unexpected default grading call');
      },
    };
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: unused,
      gradingJsonProvider: unused,
      gradingProvider: unused,
      moderationProvider: unused,
      suggestionsProvider: unused,
      synthesizeProvider: unused,
    });
  });

  afterEach(async () => {
    Object.assign(cliState, priorCliState);
    watcher.handlers.clear();
    await setDefaultCompletionProviders(undefined as unknown as ApiProvider);
    vi.resetAllMocks();
  });

  it('makes concurrent grading calls wait for an earlier cleanup, even one that rejects', async () => {
    const cleanupStarted = deferred();
    const finishCleanup = deferred();
    let cleaning = false;
    const callsDuringCleanup: string[] = [];
    const shared = {
      id: () => 'released-shared-provider',
      callApi: vi.fn(async (prompt: string) => {
        if (cleaning) {
          callsDuringCleanup.push(prompt);
        }
        return {
          output: prompt.includes('GRADER_B') ? '{"pass":true,"score":1,"reason":"ok"}' : prompt,
        };
      }),
      cleanup: vi.fn(async () => {
        cleaning = true;
        cleanupStarted.resolve();
        await finishCleanup.promise;
        cleaning = false;
        throw new Error('Synthetic cleanup failure');
      }),
    } satisfies ApiProvider;
    const target = {
      id: () => 'borrower-target',
      callApi: vi.fn(async () => ({ output: 'target-B' })),
    } satisfies ApiProvider;
    vi.mocked(resolveConfigs).mockImplementationOnce(async () => {
      const config = {};
      cliState.config = config;
      return {
        config,
        basePath: '',
        testSuite: { providers: [shared], prompts: [{ raw: 'A', label: 'A' }], tests: [{}] },
      };
    });
    const owner = doEval(
      { write: false, table: false, share: false, cache: false },
      {},
      'owner.mjs',
      { showProgressBar: false },
    );
    void owner.catch(() => {});
    let borrower: Promise<Eval> | undefined;
    try {
      await cleanupStarted.promise;
      await useActualDefaultProviders();
      await setDefaultCompletionProviders(shared);
      // Two tests grade concurrently with the default grader whose cleanup is still running.
      borrower = evaluate(
        {
          providers: [target],
          prompts: [{ raw: 'TARGET_B', label: 'B' }],
          tests: [{ assert: [rubric] }, { assert: [rubric] }],
        },
        new Eval({}),
        { maxConcurrency: 2, showProgressBar: false },
      );
      for (let i = 0; i < 10; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(shared.callApi).toHaveBeenCalledOnce();
      finishCleanup.resolve();
      await owner;
      expect((await (await borrower).toEvaluateSummary()).stats.successes).toBe(2);
      expect(shared.callApi).toHaveBeenCalledTimes(3);
      expect(callsDuringCleanup).toEqual([]);
    } finally {
      finishCleanup.resolve();
      await Promise.allSettled([owner, ...(borrower ? [borrower] : [])]);
    }
  });

  it.each(['success', 'error'] as const)(
    'keeps a resolved shared target alive through pending setup: %s',
    async (outcome) => {
      const firstStarted = deferred();
      const finishFirst = deferred();
      const setupStarted = deferred();
      const finishSetup = deferred();
      const setupError = new Error(`Pending setup ${outcome}`);
      let closed = false;
      const target = {
        id: () => 'shared-pending-setup-target',
        callApi: vi.fn(async (prompt: string) => {
          if (prompt === 'A') {
            firstStarted.resolve();
            await finishFirst.promise;
          }
          expect(closed).toBe(false);
          return { output: prompt };
        }),
        cleanup: vi.fn(() => {
          closed = true;
        }),
      } satisfies ApiProvider;
      const grader = {
        id: () => 'borrowed-pending-setup-grader',
        callApi: vi.fn(async () => ({
          output: '{"pass":true,"score":1,"reason":"setup survived"}',
        })),
        cleanup: vi.fn(),
      } satisfies ApiProvider;
      const suites: TestSuite[] = ['A', 'B'].map((prompt) => ({
        providers: [target],
        prompts: [{ raw: prompt, label: prompt }],
        tests: [{ assert: [{ type: 'llm-rubric', value: 'Valid answer', provider: grader }] }],
      }));
      vi.mocked(resolveConfigs).mockImplementation(async () => {
        const testSuite = suites.shift();
        if (!testSuite) {
          throw new Error('Unexpected setup evaluation');
        }
        const config = { outputPath: ['pending-setup.json'] };
        cliState.config = config;
        return { config, testSuite, basePath: '' };
      });
      let cloudChecks = 0;
      vi.mocked(checkCloudPermissions).mockImplementation(async () => {
        if (++cloudChecks === 2) {
          setupStarted.resolve();
          await finishSetup.promise;
          if (outcome === 'error') {
            throw setupError;
          }
        }
      });
      const pending: ReturnType<typeof doEval>[] = [];
      const run = () => {
        const result = doEval(
          { write: false, table: false, share: false, cache: false },
          {},
          'pending-setup.mjs',
          { maxConcurrency: 1, showProgressBar: false },
        );
        pending.push(result);
        void result.catch(() => {});
        return result;
      };
      try {
        const first = run();
        await Promise.race([
          firstStarted.promise,
          first.then(() => {
            throw new Error('First evaluation skipped its target');
          }),
        ]);
        const second = run();
        await Promise.race([
          setupStarted.promise,
          second.then(() => {
            throw new Error('Second evaluation skipped pending setup');
          }),
        ]);
        finishFirst.resolve();
        expect((await (await first).toEvaluateSummary()).stats.successes).toBe(1);
        expect(target.cleanup).not.toHaveBeenCalled();
        expect(closed).toBe(false);
        finishSetup.resolve();
        if (outcome === 'success') {
          expect((await (await second).toEvaluateSummary()).stats.successes).toBe(1);
          expect(target.callApi.mock.calls.map(([prompt]) => prompt)).toEqual(['A', 'B']);
        } else {
          await expect(second).rejects.toBe(setupError);
          expect(target.callApi.mock.calls.map(([prompt]) => prompt)).toEqual(['A']);
        }
        expect(target.cleanup).toHaveBeenCalledTimes(1);
        expect(target.cleanup).toHaveBeenCalledWith({ reason: 'evaluation-complete' });
        expect(grader.cleanup).not.toHaveBeenCalled();
      } finally {
        finishFirst.resolve();
        finishSetup.resolve();
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(['success', 'failure'] as const)(
    'keeps public provider setup alive through another evaluator failure: %s',
    async (outcome) => {
      const entered = deferred();
      const finish = deferred();
      const setupError = new Error('public provider setup failed');
      const otherError = new Error('other evaluation configuration failed');
      let closed = false;
      const resource = {
        shutdown: vi.fn(async () => {
          closed = true;
          if (outcome === 'failure') {
            throw new Error('cleanup must not replace setup error');
          }
        }),
      };
      const target: ApiProvider = {
        id: () => 'public-setup-resource',
        callApi: vi.fn(async () => {
          expect(closed).toBe(false);
          return { output: 'setup survived' };
        }),
      };
      vi.mocked(loadApiProviders).mockImplementationOnce(async () => {
        // Model a constructor that registers a process resource before asynchronous connection.
        providerRegistry.register(resource);
        entered.resolve();
        await finish.promise;
        if (outcome === 'failure') {
          throw setupError;
        }
        return [target];
      });
      vi.mocked(resolveConfigs).mockRejectedValueOnce(otherError);
      const pending = evaluateWithSource(
        { providers: [target], prompts: ['setup'], tests: [{ vars: {} }] },
        { cache: false, showProgressBar: false },
      );
      void pending.catch(() => {});
      try {
        await Promise.race([
          entered.promise,
          pending.then(() => {
            throw new Error('public evaluation skipped setup');
          }),
        ]);
        await expect(
          doEval(
            { write: false, table: false, share: false, cache: false },
            {},
            'failed-setup.mjs',
            { showProgressBar: false },
          ),
        ).rejects.toBe(otherError);
        expect(resource.shutdown).not.toHaveBeenCalled();
        finish.resolve();
        if (outcome === 'failure') {
          await expect(pending).rejects.toBe(setupError);
          expect(target.callApi).not.toHaveBeenCalled();
        } else {
          const result = await pending;
          expect((await result.toEvaluateSummary()).results[0]).toMatchObject({
            success: true,
            response: { output: 'setup survived' },
          });
        }
        expect(resource.shutdown).toHaveBeenCalledTimes(1);
      } finally {
        finish.resolve();
        await Promise.allSettled([pending]);
        providerRegistry.unregister(resource);
      }
    },
  );

  it.each(positions)(
    'keeps $name alive until the last overlapping run finishes',
    async ({ configure, entry, outcome }) => {
      const cancellation = new AbortController();
      const originalFailure = new Error('borrowed grader failed');
      const startedA = deferred();
      const startedB = deferred();
      const finishA = deferred();
      const finishB = deferred();
      const active = new Set<AbortController>();
      const aborted: string[] = [];
      const calls: string[] = [];
      const hold = async (name: 'A' | 'B') => {
        const controller = new AbortController();
        active.add(controller);
        const onAbort = () => {
          aborted.push(name);
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        (name === 'A' ? startedA : startedB).resolve();
        try {
          await (name === 'A' ? finishA : finishB).promise;
          controller.signal.throwIfAborted();
        } finally {
          controller.signal.removeEventListener('abort', onAbort);
          active.delete(controller);
        }
      };
      const shared = {
        id: () => 'shared-transport',
        callApi: vi.fn(async (prompt: string) => {
          calls.push(prompt);
          if (prompt === 'TARGET_A') {
            await hold('A');
            return { output: 'target-A' };
          }
          expect(prompt === 'TARGET_B' || prompt.includes('GRADER_B')).toBe(true);
          await hold('B');
          if (outcome === 'error') {
            throw originalFailure;
          }
          if (outcome === 'abort') {
            cancellation.signal.throwIfAborted();
          }
          return {
            output:
              prompt === 'TARGET_B'
                ? 'target-B'
                : '{"pass":true,"score":1,"reason":"shared grader completed"}',
          };
        }),
        // Model a transport-owning provider such as MCP: cleanup closes active work.
        // It intentionally has no Sage-specific request-ownership protection.
        cleanup: vi.fn(async () => {
          for (const controller of active) {
            controller.abort(new Error('Shared transport closed during a request'));
          }
        }),
      } satisfies ApiProvider;
      const idle = {
        id: () => 'initial-target',
        callApi: vi.fn(async () => ({ output: 'initial' })),
        cleanup: vi.fn(async () => {}),
      } satisfies ApiProvider;
      const other = {
        id: () => 'other-target',
        callApi: vi.fn(async () => ({ output: 'target-B' })),
        cleanup: vi.fn(async () => {}),
      } satisfies ApiProvider;
      const suite = (provider: ApiProvider, raw: string): TestSuite => ({
        providers: [provider],
        prompts: [{ raw, label: raw }],
        tests: [{ vars: {} }],
      });
      const suiteB = suite(other, 'TARGET_B');
      await configure(suiteB, shared);
      const suites = [suite(idle, 'INITIAL'), suite(shared, 'TARGET_A'), suiteB];
      vi.mocked(resolveConfigs).mockImplementation(async () => {
        const testSuite = suites.shift();
        if (!testSuite) {
          throw new Error('Unexpected extra evaluation');
        }
        const config = {
          defaultTest: testSuite.defaultTest,
          outputPath: ['in-memory-results.json'],
        };
        cliState.config = config;
        return { config, testSuite, basePath: '' };
      });
      const pending: Promise<void>[] = [];
      try {
        const initial = await doEval(
          { watch: true, write: false, table: false, share: false, cache: false },
          {},
          'ownership.mjs',
          { maxConcurrency: 1, showProgressBar: false },
        );
        expect((await initial.toEvaluateSummary()).stats.successes).toBe(1);
        expect(idle.cleanup).toHaveBeenCalledTimes(1);
        vi.mocked(writeMultipleOutputs).mockClear();
        const onChange = watcher.handlers.get('change');
        expect(onChange).toBeDefined();
        const runA = onChange!('ownership.mjs');
        pending.push(runA);
        void runA.catch(() => {});
        await Promise.race([
          startedA.promise,
          runA.then(() => {
            throw new Error('Run A finished without starting the shared target request');
          }),
        ]);
        let returnedB: Eval | undefined;
        const runB = entry
          ? (entry === 'public'
              ? evaluateWithSource(
                  {
                    providers: suiteB.providers,
                    prompts: ['TARGET_B'],
                    tests: suiteB.tests,
                    defaultTest: suiteB.defaultTest,
                    scenarios: suiteB.scenarios,
                    env: suiteB.env,
                  },
                  {
                    cache: false,
                    maxConcurrency: 1,
                    showProgressBar: false,
                    abortSignal: cancellation.signal,
                  },
                )
              : evaluate(suiteB, new Eval({}), {
                  maxConcurrency: 1,
                  showProgressBar: false,
                  abortSignal: cancellation.signal,
                })
            ).then((result) => {
              returnedB = result;
            })
          : onChange!('ownership.mjs');
        pending.push(runB);
        void runB.catch(() => {});
        await Promise.race([
          startedB.promise,
          runB.then(() => {
            throw new Error('Run B finished without starting the shared provider request');
          }),
        ]);

        finishA.resolve();
        await runA;
        expect(active.size).toBeGreaterThan(0);
        expect(aborted).toEqual([]);
        expect(shared.cleanup).not.toHaveBeenCalled();
        expect(writeMultipleOutputs).toHaveBeenCalledTimes(1);

        if (outcome === 'abort') {
          cancellation.abort(new Error('caller canceled grading'));
        }
        finishB.resolve();
        await runB;
        expect(aborted).toEqual([]);
        expect(active.size).toBe(0);
        expect(shared.cleanup).toHaveBeenCalledExactlyOnceWith({ reason: 'evaluation-complete' });
        expect(writeMultipleOutputs).toHaveBeenCalledTimes(entry ? 1 : 2);
        const resultA = vi.mocked(writeMultipleOutputs).mock.calls[0][1];
        const resultB = returnedB ?? vi.mocked(writeMultipleOutputs).mock.calls[1][1];
        for (const [record, output] of [
          [resultA, 'target-A'],
          [resultB, 'target-B'],
        ] as const) {
          const summary = await record.toEvaluateSummary();
          expect(summary.results).toHaveLength(1);
          if (record === resultB && outcome) {
            expect(summary.results[0].success).toBe(false);
            if (outcome === 'error') {
              expect(summary.results[0].error).toContain(originalFailure.message);
            }
          } else {
            expect(summary.results[0]).toMatchObject({ success: true, response: { output } });
            expect(summary.results[0].error).toBeUndefined();
          }
        }
        expect(calls[0]).toBe('TARGET_A');
        expect(calls.length).toBeGreaterThanOrEqual(2);
      } finally {
        finishA.resolve();
        finishB.resolve();
        await Promise.allSettled(pending);
      }
    },
  );
});
