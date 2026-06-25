import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import {
  __buildTestsFromSuiteForTests,
  __resolveRuntimeGradingProviderReferencesForTests,
  evaluate,
} from '../../src/evaluator';
import Eval from '../../src/models/eval';
import {
  type ApiProvider,
  type CompletedPrompt,
  type EvaluateSummaryV3,
  type TestSuite,
} from '../../src/types/index';
import { loadScenarioConfigs } from '../../src/util/config/scenarioMatrix';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator scenarios and conversations', () => {
  it('materializes scenario test files above the JavaScript argument limit', () => {
    const testSuite = {
      providers: [],
      prompts: [],
      scenarios: [
        {
          config: [{}],
          tests: Array.from({ length: 150_000 }, () => ({})),
        },
      ],
    } as TestSuite;

    expect(__buildTestsFromSuiteForTests(testSuite)).toHaveLength(150_000);
  });

  it('evaluate with scenarios', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Hola mundo',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Bonjour le monde',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }}')],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
                expectedHelloWorld: 'Hola mundo',
              },
            },
            {
              vars: {
                language: 'French',
                expectedHelloWorld: 'Bonjour le monde',
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'equals',
                  value: '{{expectedHelloWorld}}',
                },
              ],
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Hola mundo');
    expect(summary.results[1].response?.output).toBe('Bonjour le monde');
  });

  it('rejects unexpanded $values refs in scenario config', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn<ApiProvider['callApi']>(),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }}')],
      scenarios: [
        {
          config: [{ $values: 'file://matrix.yaml' } as never],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await expect(evaluate(testSuite, evalRecord, {})).rejects.toThrow(
      /Unexpanded scenario config \$values reference/,
    );
    expect(mockApiProvider.callApi).not.toHaveBeenCalled();
  });

  it('uses scenario source env when resolving scenario grading providers', async () => {
    const scenarios = await loadScenarioConfigs(
      [
        {
          config: [{ options: { provider: 'echo' } }],
          tests: [{}],
        },
      ],
      '',
      { GRADER_TOKEN: 'source-env' },
    );
    const testSuite = {
      providers: [],
      prompts: [],
      env: { GRADER_TOKEN: 'suite-env' },
      scenarios,
    } as TestSuite;
    const [testCase] = __buildTestsFromSuiteForTests(testSuite);

    __resolveRuntimeGradingProviderReferencesForTests(testCase, Object.create(null), testSuite);

    expect(testCase.options?.provider).toEqual({
      id: 'echo',
      env: { GRADER_TOKEN: 'source-env' },
    });
  });

  it('does not serialize valid cyclic scenario provider state in invariant messages', async () => {
    const client: { self?: unknown } = {};
    client.self = client;
    const scenarioProvider = {
      id: () => 'cyclic-scenario-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'ok',
        tokenUsage: { total: 1, prompt: 1, completion: 0, cached: 0, numRequests: 1 },
      }),
      client,
    } as ApiProvider;
    const testSuite: TestSuite = {
      providers: [scenarioProvider],
      prompts: [toPrompt('Test prompt')],
      scenarios: [{ config: [{ provider: scenarioProvider }], tests: [{}] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});

    expect(scenarioProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('resolves string and options-object provider overrides from scenario rows', async () => {
    const suiteProvider: ApiProvider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'suite' }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProvider],
      prompts: [toPrompt('{{case}}')],
      scenarios: [
        {
          config: [
            { vars: { case: 'string' }, provider: 'echo' },
            {
              vars: { case: 'object' },
              provider: { id: 'echo', label: 'scenario-echo' },
            },
            { vars: { case: 'suite' } },
          ],
          tests: [{}],
        },
        {
          config: [{ vars: { case: 'test' } }],
          tests: [{ provider: 'echo' }],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.results.map((result) => result.response?.output)).toEqual([
      'string',
      'object',
      'suite',
      'test',
    ]);
    expect(suiteProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('runs a scenario provider override once without changing normal suite fanout', async () => {
    const calls: string[] = [];
    const makeProvider = (id: string): ApiProvider => ({
      id: () => id,
      callApi: vi.fn(async (_prompt, context) => {
        calls.push(`${id}:${context?.originalProvider?.id()}`);
        return { output: id };
      }),
    });
    const suiteProviderA = makeProvider('suite-a');
    const suiteProviderB = makeProvider('suite-b');
    const scenarioProvider = makeProvider('scenario-override');
    const testSuite: TestSuite = {
      providers: [suiteProviderA, suiteProviderB],
      prompts: [toPrompt('{{kind}}')],
      scenarios: [
        {
          config: [
            { vars: { kind: 'override' }, provider: scenarioProvider },
            { vars: { kind: 'normal' } },
          ],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(calls).toEqual(['scenario-override:suite-a', 'suite-a:suite-a', 'suite-b:suite-b']);
    expect(summary.results.map((result) => result.response?.output)).toEqual([
      'scenario-override',
      'suite-a',
      'suite-b',
    ]);
    expect(scenarioProvider.callApi).toHaveBeenCalledTimes(1);
    expect(suiteProviderA.callApi).toHaveBeenCalledTimes(1);
    expect(suiteProviderB.callApi).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a scenario override for fuzzy or duplicate suite-provider IDs', async () => {
    const suiteProviders: ApiProvider[] = ['openai', 'openai:gpt-4', 'openai'].map((id) => ({
      id: () => id,
      callApi: vi.fn().mockResolvedValue({ output: id }),
    }));
    const originalProviders: string[] = [];
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-override',
      callApi: vi.fn(async (_prompt, context) => {
        originalProviders.push(context?.originalProvider?.id() ?? 'missing');
        return { output: 'scenario-override' };
      }),
    };
    const testSuite: TestSuite = {
      providers: suiteProviders,
      prompts: [toPrompt('Prompt')],
      scenarios: [{ config: [{ provider: scenarioProvider }], tests: [{}] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(originalProviders).toEqual(['openai']);
    expect(scenarioProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.results).toHaveLength(1);
  });

  it('preserves distinct prompt coverage while deduplicating scenario overrides', async () => {
    const suiteProviderA: ApiProvider = {
      id: () => 'suite-a',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-a' }),
    };
    const suiteProviderB: ApiProvider = {
      id: () => 'suite-b',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-b' }),
    };
    const calls: Array<{ originalProvider: string; prompt: string }> = [];
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-override',
      callApi: vi.fn(async (prompt, context) => {
        calls.push({
          originalProvider: context?.originalProvider?.id() ?? 'missing',
          prompt,
        });
        return { output: prompt };
      }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProviderA, suiteProviderB],
      prompts: [toPrompt('one'), toPrompt('two')],
      providerPromptMap: {
        'suite-a': ['one'],
        'suite-b': ['two'],
      },
      scenarios: [{ config: [{ provider: scenarioProvider }], tests: [{}] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(calls).toEqual([
      { originalProvider: 'suite-a', prompt: 'one' },
      { originalProvider: 'suite-b', prompt: 'two' },
    ]);
    expect(summary.results).toHaveLength(2);
  });

  it('applies provider filters before appending scenario override prompt columns', async () => {
    const suiteProviderA: ApiProvider = {
      id: () => 'suite-a',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-a' }),
    };
    const suiteProviderB: ApiProvider = {
      id: () => 'suite-b',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-b' }),
    };
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-override',
      callApi: vi.fn(async (prompt) => ({ output: prompt })),
    };
    const testSuite: TestSuite = {
      providers: [suiteProviderA, suiteProviderB],
      prompts: [toPrompt('one'), toPrompt('two')],
      providerPromptMap: {
        'suite-a': ['one'],
        'suite-b': ['two'],
      },
      scenarios: [
        {
          config: [{ provider: scenarioProvider, providers: ['suite-a'] }],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].provider.id).toBe('scenario-override');
    expect(summary.results[0].prompt.raw).toBe('one');
    const scenarioPrompts = summary.prompts.filter(
      (prompt: CompletedPrompt) => prompt.provider === 'scenario-override',
    );
    expect(scenarioPrompts).toEqual([expect.objectContaining({ raw: 'one' })]);
  });

  it('applies filter ranges before appending scenario override prompt columns', async () => {
    const suiteProvider: ApiProvider = {
      id: () => 'suite-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-provider' }),
    };
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-override',
      callApi: vi.fn().mockResolvedValue({ output: 'scenario-override' }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProvider],
      prompts: [toPrompt('only')],
      scenarios: [
        {
          config: [{ provider: scenarioProvider }, {}],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { filterRange: '1:2', maxConcurrency: 1 });
    const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].provider.id).toBe('suite-provider');
    expect(scenarioProvider.callApi).not.toHaveBeenCalled();
    expect(
      summary.prompts.filter((prompt: CompletedPrompt) => prompt.provider === 'scenario-override'),
    ).toEqual([]);
  });

  it('attributes scenario override results to the override provider while preserving the suite slot context', async () => {
    const suiteProviderA: ApiProvider = {
      id: () => 'suite-a',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-a' }),
    };
    const suiteProviderB: ApiProvider = {
      id: () => 'suite-b',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-b' }),
    };
    const originalProviders: string[] = [];
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-override',
      callApi: vi.fn(async (_prompt, context) => {
        originalProviders.push(context?.originalProvider?.id() ?? 'missing');
        return { output: 'scenario-override' };
      }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProviderA, suiteProviderB],
      prompts: [toPrompt('eligible')],
      providerPromptMap: {
        'suite-a': ['not-eligible'],
        'suite-b': ['eligible'],
      },
      scenarios: [
        {
          config: [{ provider: scenarioProvider }],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(originalProviders).toEqual(['suite-b']);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].provider.id).toBe('scenario-override');
    expect(summary.results[0].response?.output).toBe('scenario-override');
  });

  it('does not multiply scenario override repeats and variable combinations by suite providers', async () => {
    const suiteProviderA: ApiProvider = {
      id: () => 'suite-a',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-a' }),
    };
    const suiteProviderB: ApiProvider = {
      id: () => 'suite-b',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-b' }),
    };
    const scenarioProvider: ApiProvider = {
      id: () => 'scenario-override',
      callApi: vi.fn().mockResolvedValue({ output: 'scenario-override' }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProviderA, suiteProviderB],
      prompts: [toPrompt('{{value}}')],
      scenarios: [
        {
          config: [
            {
              provider: scenarioProvider,
              vars: { value: ['one', 'two'] },
              options: { repeat: 2 },
            },
          ],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(scenarioProvider.callApi).toHaveBeenCalledTimes(4);
    expect(suiteProviderA.callApi).not.toHaveBeenCalled();
    expect(suiteProviderB.callApi).not.toHaveBeenCalled();
    expect(summary.results).toHaveLength(4);
  });

  it('preserves top-level provider override fanout for wrapper compatibility', async () => {
    const suiteProviderA: ApiProvider = {
      id: () => 'suite-a',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-a' }),
    };
    const suiteProviderB: ApiProvider = {
      id: () => 'suite-b',
      callApi: vi.fn().mockResolvedValue({ output: 'suite-b' }),
    };
    const originalProviders: string[] = [];
    const wrapperProvider: ApiProvider = {
      id: () => 'wrapper',
      callApi: vi.fn(async (_prompt, context) => {
        originalProviders.push(context?.originalProvider?.id() ?? 'missing');
        return { output: 'wrapper' };
      }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProviderA, suiteProviderB],
      prompts: [toPrompt('Prompt')],
      tests: [{ provider: wrapperProvider }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(originalProviders).toEqual(['suite-a', 'suite-b']);
    expect(wrapperProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.results).toHaveLength(2);
  });

  it('rejects malformed scenario provider overrides before executing providers', async () => {
    const suiteProvider: ApiProvider = {
      id: () => 'suite-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'suite' }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProvider],
      prompts: [toPrompt('Test prompt')],
      scenarios: [
        {
          config: [{ provider: { config: { marker: 'missing-id' } } as never }],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await expect(evaluate(testSuite, evalRecord, {})).rejects.toThrow(
      /Provider object must have an 'id' field/,
    );
    expect(suiteProvider.callApi).not.toHaveBeenCalled();
  });

  it('does not execute raw provider refs from unnormalized top-level test data', async () => {
    const suiteProvider: ApiProvider = {
      id: () => 'suite-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'suite' }),
    };
    const testSuite: TestSuite = {
      providers: [suiteProvider],
      prompts: [toPrompt('Prompt')],
      tests: [{ provider: 'echo' }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.results[0].response?.output).toBe('suite');
    expect(suiteProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('applies repeat from scenario config options', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      scenarios: [
        {
          config: [{ options: { repeat: 3 } }],
          tests: [{}],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { repeat: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(summary.results).toHaveLength(3);
  });

  it('lets scenario test options.repeat override scenario config options.repeat', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      scenarios: [
        {
          config: [{ options: { repeat: 5 } }],
          tests: [{ options: { repeat: 2 } }],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { repeat: 1 });
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.results).toHaveLength(2);
  });

  it('evaluate with scenarios and multiple vars', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Spanish Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Spanish Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'French Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'French Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }} {{ greeting }}')],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: ['Spanish', 'French'],
                greeting: ['Hola', 'Bonjour'],
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'equals',
                  value: '{{language}} {{greeting}}',
                },
              ],
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Spanish Hola');
    expect(summary.results[1].response?.output).toBe('Spanish Bonjour');
    expect(summary.results[2].response?.output).toBe('French Hola');
    expect(summary.results[3].response?.output).toBe('French Bonjour');
  });

  it('evaluate with scenarios and defaultTest', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello, World',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        metadata: { defaultKey: 'defaultValue' },
        assert: [
          {
            type: 'starts-with',
            value: 'Hello',
          },
        ],
      },
      scenarios: [
        {
          config: [{ metadata: { configKey: 'configValue' } }],
          tests: [{ metadata: { testKey: 'testValue' } }],
        },
        {
          config: [
            {
              assert: [
                {
                  type: 'contains',
                  value: ',',
                },
              ],
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'icontains',
                  value: 'world',
                },
              ],
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
      stats: {
        successes: 2,
        failures: 0,
      },
      results: expect.arrayContaining([
        expect.objectContaining({
          gradingResult: expect.objectContaining({
            componentResults: expect.arrayContaining([expect.anything()]),
          }),
        }),
        expect.objectContaining({
          gradingResult: expect.objectContaining({
            componentResults: expect.arrayContaining([
              expect.anything(),
              expect.anything(),
              expect.anything(),
            ]),
          }),
        }),
      ]),
    });

    expect(summary.results[0].testCase.metadata).toEqual({
      defaultKey: 'defaultValue',
      configKey: 'configValue',
      testKey: 'testValue',
      conversationId: '__scenario_0__', // Auto-generated for scenario isolation
    });

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it('should maintain separate conversation histories between scenarios without explicit conversationId', async () => {
    // This test verifies the fix for GitHub issue #384:
    // Scenarios should have isolated _conversation state by default
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}Previous: {{ completion.input }} -> {{ completion.output }}\n{% endfor %}Current: {{ question }}',
          label: 'Conversation test',
        },
      ],
      scenarios: [
        {
          // First scenario - conversation about books
          config: [{}],
          tests: [
            { vars: { question: 'Recommend a sci-fi book' } },
            { vars: { question: 'Tell me more about it' } },
          ],
        },
        {
          // Second scenario - conversation about recipes
          // Should NOT include history from first scenario
          config: [{}],
          tests: [
            { vars: { question: 'Suggest a pasta recipe' } },
            { vars: { question: 'How long does it take?' } },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);

    // First scenario, first question - no history
    const firstCall = mockApiProvider.callApi.mock.calls[0][0];
    expect(firstCall).toContain('Current: Recommend a sci-fi book');
    expect(firstCall).not.toContain('Previous:');

    // First scenario, second question - should have first scenario's history
    const secondCall = mockApiProvider.callApi.mock.calls[1][0];
    expect(secondCall).toContain('Previous: ');
    expect(secondCall).toContain('Recommend a sci-fi book');
    expect(secondCall).toContain('Current: Tell me more about it');

    // Second scenario, first question - should NOT have first scenario's history
    // This is the key assertion that verifies the fix for issue #384
    const thirdCall = mockApiProvider.callApi.mock.calls[2][0];
    expect(thirdCall).toContain('Current: Suggest a pasta recipe');
    expect(thirdCall).not.toContain('Previous:');
    expect(thirdCall).not.toContain('sci-fi');
    expect(thirdCall).not.toContain('Recommend');

    // Second scenario, second question - should only have second scenario's history
    const fourthCall = mockApiProvider.callApi.mock.calls[3][0];
    expect(fourthCall).toContain('Previous: ');
    expect(fourthCall).toContain('Suggest a pasta recipe');
    expect(fourthCall).toContain('Current: How long does it take?');
    expect(fourthCall).not.toContain('sci-fi');
  });

  it('should allow scenarios to share conversation history with explicit conversationId', async () => {
    // This test verifies that users can still explicitly share conversations across scenarios
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}Previous: {{ completion.input }}\n{% endfor %}Current: {{ question }}',
          label: 'Conversation test',
        },
      ],
      scenarios: [
        {
          config: [{}],
          tests: [
            {
              vars: { question: 'Question from scenario 1' },
              metadata: { conversationId: 'shared-conversation' },
            },
          ],
        },
        {
          config: [{}],
          tests: [
            {
              vars: { question: 'Question from scenario 2' },
              metadata: { conversationId: 'shared-conversation' },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);

    // First scenario - no history
    const firstCall = mockApiProvider.callApi.mock.calls[0][0];
    expect(firstCall).not.toContain('Previous:');

    // Second scenario - SHOULD have first scenario's history because they share conversationId
    const secondCall = mockApiProvider.callApi.mock.calls[1][0];
    expect(secondCall).toContain('Previous: ');
    expect(secondCall).toContain('Question from scenario 1');
  });
});
