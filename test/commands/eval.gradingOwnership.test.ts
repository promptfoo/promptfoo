import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { evaluateWithSource } from '../../src/evaluate';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { doEval } from '../../src/node/doEval';
import { getDefaultProviders } from '../../src/providers/defaults';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { loadDefaultConfig } from '../../src/util/config/default';
import { resolveConfigs } from '../../src/util/config/load';
import { writeMultipleOutputs } from '../../src/util/index';
import { mockProcessEnv } from '../util/utils';

import type {
  ApiModerationProvider,
  ApiProvider,
  Assertion,
  TestSuite,
} from '../../src/types/index';

mockProcessEnv({
  OPENAI_API_KEY: 'synthetic-moderation-routing-key',
  REPLICATE_API_KEY: undefined,
  REPLICATE_API_TOKEN: undefined,
});

const watcher = vi.hoisted(() => {
  const handlers = new Map<string, (path: string) => Promise<void>>();
  const instance = {
    on: vi.fn(),
    close: vi.fn(),
  };
  return { handlers, instance, watch: vi.fn() };
});

const mcp = vi.hoisted(() => ({
  initialize: vi.fn(),
  cleanup: vi.fn(),
  getAllTools: vi.fn(),
  callTool: vi.fn(),
}));
vi.mock('../../src/providers/mcp/client', () => ({
  MCPClient: class {
    initialize = mcp.initialize;
    cleanup = mcp.cleanup;
    getAllTools = mcp.getAllTools;
    callTool = mcp.callTool;
  },
}));
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
vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: vi.fn() }));
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

const rubric: Assertion = { type: 'llm-rubric', value: 'GRADER_B: the answer is target-B.' };

// Each fixture is public configuration consumed by the real evaluator and matchers.
// The test never calls or inspects the ownership collector.
const positions: {
  name: string;
  configure: (suite: TestSuite, shared: ApiProvider) => void;
  entry?: 'public' | 'direct';
  outcome?: 'error' | 'abort';
}[] = [
  {
    name: 'top-level and grader identity control',
    configure: (suite, shared) => {
      suite.providers = [shared];
      suite.defaultTest = { options: { provider: shared }, assert: [rubric] };
    },
  },
  {
    name: 'default typed text grader with unused lazy alternatives',
    entry: 'public',
    configure: (suite, shared) => {
      suite.defaultTest = {
        options: {
          provider: {
            text: shared,
            embedding: 'unused-embedding-provider',
            classification: { id: 'unused-classification-provider', config: { unused: true } },
          },
        },
        assert: [rubric],
      };
    },
  },
  {
    name: 'test options grader',
    entry: 'direct',
    configure: (suite, shared) => {
      suite.tests = [{ options: { provider: shared }, assert: [rubric] }];
    },
  },
  {
    name: 'scenario config grader',
    configure: (suite, shared) => {
      suite.tests = [];
      suite.scenarios = [
        { config: [{ options: { provider: shared } }], tests: [{ assert: [rubric] }] },
      ];
    },
  },
  {
    name: 'scenario test classification grader',
    configure: (suite, shared) => {
      suite.tests = [];
      suite.scenarios = [
        {
          config: [{}],
          tests: [
            {
              options: { provider: { classification: shared } },
              assert: [{ type: 'classifier', value: 'safe', threshold: 0.5 }],
            },
          ],
        },
      ];
    },
  },
  {
    name: 'default assertion grader',
    configure: (suite, shared) => {
      suite.defaultTest = { assert: [{ ...rubric, provider: shared }] };
    },
  },
  {
    name: 'default assertion-set grader',
    configure: (suite, shared) => {
      suite.defaultTest = {
        assert: [{ type: 'assert-set', assert: [{ ...rubric, provider: shared }] }],
      };
    },
  },
  {
    name: 'test assertion overrides unused lazy test options',
    configure: (suite, shared) => {
      suite.tests = [
        {
          options: { provider: 'unused-overridden-provider' },
          assert: [{ ...rubric, provider: shared }],
        },
      ];
    },
  },
  {
    name: 'test assertion-set embedding grader',
    entry: 'direct',
    configure: (suite, shared) => {
      suite.tests = [
        {
          assert: [
            {
              type: 'assert-set',
              assert: [
                {
                  type: 'similar',
                  value: 'target-B',
                  threshold: 0.9,
                  provider: { embedding: shared },
                },
              ],
            },
          ],
        },
      ];
    },
  },
  {
    name: 'scenario config assertion-set grader',
    configure: (suite, shared) => {
      suite.tests = [];
      suite.scenarios = [
        {
          config: [{ assert: [{ type: 'assert-set', assert: [{ ...rubric, provider: shared }] }] }],
          tests: [{}],
        },
      ];
    },
  },
  {
    name: 'scenario test assertion moderation grader',
    configure: (suite, shared) => {
      suite.tests = [];
      suite.scenarios = [
        {
          config: [{}],
          tests: [{ assert: [{ type: 'moderation', provider: { moderation: shared } }] }],
        },
      ];
    },
  },
  {
    name: 'default provider target override and implicit grader',
    configure: (suite, shared) => {
      suite.defaultTest = { provider: shared, assert: [rubric] };
    },
  },
  {
    name: 'test provider target override',
    configure: (suite, shared) => {
      suite.tests = [{ provider: shared }];
    },
  },
  {
    name: 'scenario config provider target override',
    configure: (suite, shared) => {
      suite.tests = [];
      suite.scenarios = [{ config: [{ provider: shared }], tests: [{}] }];
    },
  },
  {
    name: 'direct borrowed grader failure',
    entry: 'direct',
    outcome: 'error',
    configure: (suite, shared) => {
      suite.tests = [{ options: { provider: shared }, assert: [rubric] }];
    },
  },
  {
    name: 'public borrowed grader cancellation',
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
    mcp.initialize.mockResolvedValue(undefined);
    mcp.cleanup.mockResolvedValue(undefined);
    mcp.getAllTools.mockReturnValue([]);
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

  afterEach(() => {
    Object.assign(cliState, priorCliState);
    watcher.handlers.clear();
    vi.resetAllMocks();
  });

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

  it('leaves a sequential supplied MCP grader open for its caller', async () => {
    let closed = false;
    const tools = [
      {
        name: 'grade',
        description: 'Return the grade',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
    mcp.getAllTools.mockImplementation(() => (closed ? [] : tools));
    mcp.cleanup.mockImplementation(async () => {
      closed = true;
    });
    mcp.callTool.mockImplementation(async () => {
      expect(closed).toBe(false);
      return { content: [{ type: 'text', text: '{"pass":true,"score":1,"reason":"tool grade"}' }] };
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'grade-call',
                  type: 'function',
                  function: { name: 'grade', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    });
    const grader = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { apiKey: 'synthetic-no-network', mcp: { enabled: true } },
    });
    const target = {
      id: () => 'sequential-mcp-target',
      callApi: vi.fn(async () => ({ output: 'target' })),
      cleanup: vi.fn(() => {
        throw new Error('nonfatal synchronous target cleanup');
      }),
    } satisfies ApiProvider;
    let run = 0;
    vi.mocked(resolveConfigs).mockImplementation(async () => {
      const config = {};
      cliState.config = config;
      return {
        config,
        basePath: '',
        testSuite: {
          providers: [target],
          prompts: [{ raw: `uncached-${++run}`, label: 'sequential' }],
          tests: [
            { assert: [{ type: 'llm-rubric', value: 'Use the grade tool', provider: grader }] },
          ],
        },
      };
    });
    try {
      for (let i = 0; i < 2; i++) {
        const result = await doEval(
          { write: false, table: false, share: false, cache: false },
          {},
          'sequential-mcp.mjs',
          { maxConcurrency: 1, showProgressBar: false },
        );
        expect((await result.toEvaluateSummary()).results[0]).toMatchObject({ success: true });
        expect(target.cleanup).toHaveBeenCalledTimes(i + 1);
        expect(mcp.cleanup).not.toHaveBeenCalled();
      }
      const requestBodies = vi
        .mocked(fetchWithCache)
        .mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
      expect(requestBodies).toHaveLength(2);
      for (const body of requestBodies) {
        expect(body.tools).toContainEqual(
          expect.objectContaining({ function: expect.objectContaining({ name: 'grade' }) }),
        );
      }
      expect(mcp.callTool).toHaveBeenCalledTimes(2);
      expect(mcp.initialize).toHaveBeenCalledTimes(1);
    } finally {
      await grader.cleanup();
    }
    expect(mcp.cleanup).toHaveBeenCalledTimes(1);
  });

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
        callEmbeddingApi: vi.fn(async () => {
          calls.push('embedding');
          await hold('B');
          return { embedding: [1, 0] };
        }),
        callClassificationApi: vi.fn(async () => {
          calls.push('classification');
          await hold('B');
          return { classification: { safe: 1 } };
        }),
        callModerationApi: vi.fn(async () => {
          calls.push('moderation');
          await hold('B');
          return { flags: [] };
        }),
        // Model a transport-owning provider such as MCP: cleanup closes active work.
        // It intentionally has no Sage-specific request-ownership protection.
        cleanup: vi.fn(async () => {
          for (const controller of active) {
            controller.abort(new Error('Shared transport closed during a request'));
          }
        }),
      } satisfies ApiModerationProvider;
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
      configure(suiteB, shared);
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
        expect(loadApiProvider).not.toHaveBeenCalled();
      } finally {
        finishA.resolve();
        finishB.resolve();
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(['success', 'rejection'])(
    'reuses Q cleanup registered while P cleanup awaits its %s',
    async (outcome) => {
      const pStarted = deferred();
      const finishP = deferred();
      const qStarted = deferred();
      const finishQ = deferred();
      const configuredC = deferred();
      const events: string[] = [];
      const p = {
        id: () => 'sequential-cleanup-P',
        callApi: vi.fn(async () => ({ output: 'target-A' })),
        cleanup: vi.fn(async () => {
          pStarted.resolve();
          await finishP.promise;
          events.push('P:cleanup:end');
        }),
      } satisfies ApiProvider;
      let qCleanups = 0;
      const q = {
        id: () => 'sequential-cleanup-Q',
        callApi: vi.fn(async function (this: ApiProvider, prompt: string) {
          expect(this).toBe(q);
          events.push(`Q:call:${prompt}`);
          return {
            output: prompt.includes('GRADE_A')
              ? '{"pass":true,"score":1,"reason":"Q graded A"}'
              : prompt,
          };
        }),
        cleanup: vi.fn(async () => {
          if (++qCleanups === 1) {
            events.push('Q:cleanup:start');
            qStarted.resolve();
            await finishQ.promise;
            events.push('Q:cleanup:settled');
            if (outcome === 'rejection') {
              throw new Error('Synthetic Q cleanup rejection');
            }
          }
        }),
      } satisfies ApiProvider;
      const suites: TestSuite[] = [
        {
          providers: [p],
          prompts: [{ raw: 'A', label: 'A' }],
          tests: [{ assert: [{ type: 'llm-rubric', value: 'GRADE_A', provider: q }] }],
        },
        { providers: [q], prompts: [{ raw: 'B', label: 'B' }], tests: [{}] },
        { providers: [q], prompts: [{ raw: 'C', label: 'C' }], tests: [{}] },
      ];
      vi.mocked(resolveConfigs).mockImplementation(async () => {
        const testSuite = suites.shift();
        if (!testSuite) {
          throw new Error('Unexpected evaluation');
        }
        if (testSuite.prompts[0].raw === 'C') {
          configuredC.resolve();
        }
        const config = { outputPath: ['sequential-cleanup.json'] };
        cliState.config = config;
        return { config, testSuite, basePath: '' };
      });
      const pending: ReturnType<typeof doEval>[] = [];
      const run = () => {
        const result = doEval(
          { write: false, table: false, share: false, cache: false },
          {},
          'sequential-cleanup.mjs',
          { maxConcurrency: 1, showProgressBar: false },
        );
        pending.push(result);
        void result.catch(() => {});
        return result;
      };
      try {
        const runA = run();
        await Promise.race([
          pStarted.promise,
          runA.then(() => {
            throw new Error('A completed without entering P cleanup');
          }),
        ]);
        const runB = run();
        await Promise.race([
          qStarted.promise,
          runB.then(() => {
            throw new Error('B completed without entering Q cleanup');
          }),
        ]);
        finishP.resolve();
        // Drain the already-released P continuation while the first Q cleanup is held.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(q.cleanup).toHaveBeenCalledTimes(1);
        run();
        await configuredC.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(events).not.toContain('Q:call:C');
        finishQ.resolve();
        const results = await Promise.all(pending);
        expect(events.indexOf('Q:cleanup:settled')).toBeLessThan(events.indexOf('Q:call:C'));
        expect(p.cleanup).toHaveBeenCalledTimes(1);
        expect(q.cleanup).toHaveBeenCalledTimes(2);
        expect(writeMultipleOutputs).toHaveBeenCalledTimes(3);
        for (const result of results) {
          const summary = await result.toEvaluateSummary();
          expect(summary.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
        }
      } finally {
        finishP.resolve();
        finishQ.resolve();
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(['success', 'rejection'])(
    'waits for pending cleanup before reusing a provider after cleanup %s',
    async (outcome) => {
      const cleanupStarted = deferred();
      const finishCleanup = deferred();
      const configuredB = deferred();
      const events: string[] = [];
      let cleanupCount = 0;
      const shared = {
        id: () => 'async-cleanup-provider',
        callApi: vi.fn(async (prompt: string) => {
          events.push(`call:${prompt}`);
          return { output: prompt };
        }),
        cleanup: vi.fn(async () => {
          if (++cleanupCount === 1) {
            events.push('cleanup:A:start');
            cleanupStarted.resolve();
            await finishCleanup.promise;
            events.push('cleanup:A:end');
            if (outcome === 'rejection') {
              throw new Error('Synthetic cleanup failure');
            }
          } else {
            events.push('cleanup:B');
          }
        }),
      } satisfies ApiProvider;
      const other = {
        id: () => 'later-provider',
        callApi: vi.fn(async (prompt: string) => ({ output: prompt })),
        cleanup: vi.fn(async () => {
          events.push('cleanup:later');
        }),
      } satisfies ApiProvider;
      const suites: TestSuite[] = [
        { providers: [other], prompts: [{ raw: 'initial', label: 'initial' }], tests: [{}] },
        { providers: [shared, other], prompts: [{ raw: 'A', label: 'A' }], tests: [{}] },
        { providers: [shared], prompts: [{ raw: 'B', label: 'B' }], tests: [{}] },
      ];
      vi.mocked(resolveConfigs).mockImplementation(async () => {
        const testSuite = suites.shift();
        if (!testSuite) {
          throw new Error('Unexpected evaluation');
        }
        const config = { outputPath: ['cleanup-reuse.json'] };
        cliState.config = config;
        if (testSuite.prompts[0].raw === 'B') {
          configuredB.resolve();
        }
        return { config, testSuite, basePath: '' };
      });
      const pending: Promise<void>[] = [];
      try {
        await doEval(
          { watch: true, write: false, table: false, share: false },
          {},
          'cleanup-reuse.mjs',
          { maxConcurrency: 1, showProgressBar: false },
        );
        events.length = 0;
        other.cleanup.mockClear();
        vi.mocked(writeMultipleOutputs).mockClear();
        const onChange = watcher.handlers.get('change')!;
        const runA = onChange('cleanup-reuse.mjs');
        pending.push(runA);
        void runA.catch(() => {});
        await Promise.race([
          cleanupStarted.promise,
          runA.then(() => {
            throw new Error('A finished without cleanup');
          }),
        ]);
        const runB = onChange('cleanup-reuse.mjs');
        pending.push(runB);
        void runB.catch(() => {});
        await Promise.race([
          configuredB.promise,
          runB.then(() => {
            throw new Error('B finished without loading its configuration');
          }),
        ]);
        // Let the already-delivered reload advance while A's cleanup is held.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(events).not.toContain('call:B');
        finishCleanup.resolve();
        await Promise.all([runA, runB]);
        expect(events.indexOf('cleanup:A:end')).toBeLessThan(events.indexOf('call:B'));
        expect(shared.cleanup).toHaveBeenCalledTimes(2);
        expect(other.cleanup).toHaveBeenCalledTimes(1);
        expect(events).toContain('cleanup:later');
        expect(writeMultipleOutputs).toHaveBeenCalledTimes(2);
        for (const [, record] of vi.mocked(writeMultipleOutputs).mock.calls) {
          const summary = await record.toEvaluateSummary();
          expect(summary.stats.failures).toBe(0);
          expect(summary.stats.errors).toBe(0);
          expect(summary.stats.successes).toBeGreaterThan(0);
        }
      } finally {
        finishCleanup.resolve();
        await Promise.allSettled(pending);
      }
    },
  );
});
