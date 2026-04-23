import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { DEFAULT_MAX_CONCURRENCY } from '../../src/constants';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, mockApiProvider2, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator options and hooks', () => {
  it('should use the options from the test if they exist', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
          options: {
            transform: 'output + " postprocessed"',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('should apply prompt config to provider call', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: 'You are a helpful math tutor. Solve {{problem}}',
          label: 'Math problem',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'math_response',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    final_answer: { type: 'string' },
                  },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
              },
            },
          },
        },
      ],
      tests: [{ vars: { problem: '8x + 31 = 2' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledWith(
      'You are a helpful math tutor. Solve 8x + 31 = 2',
      expect.objectContaining({
        prompt: expect.objectContaining({
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'math_response',
                schema: {
                  type: 'object',
                  properties: { final_answer: { type: 'string' } },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
                strict: true,
              },
            },
          },
        }),
      }),
      undefined,
    );
  });

  it('should apply dynamic prompt function config to provider call', async () => {
    const mockDynamicConfigProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockDynamicConfigProvider],
      prompts: [
        {
          raw: 'ignored by prompt function',
          label: 'Dynamic prompt with config',
          config: {
            temperature: 0.1,
            top_p: 0.9,
          },
          function: async () => ({
            prompt: 'Solve this problem: {{problem}}',
            config: {
              temperature: 0.3,
              response_format: { type: 'json_object' },
            },
          }),
        },
      ],
      tests: [
        {
          vars: { problem: '8x + 31 = 2' },
          options: { temperature: 0.7 },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockDynamicConfigProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockDynamicConfigProvider.callApi).toHaveBeenCalledWith(
      'Solve this problem: 8x + 31 = 2',
      expect.objectContaining({
        prompt: expect.objectContaining({
          config: {
            temperature: 0.7,
            top_p: 0.9,
            response_format: { type: 'json_object' },
          },
        }),
      }),
      undefined,
    );
  });

  it('should call runExtensionHook with correct parameters at appropriate times', async () => {
    const mockExtension = 'file:./path/to/extension.js:extensionFunction';
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }}')],
      tests: [
        {
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        },
      ],
      extensions: [mockExtension],
    };

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockClear();
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // Check if runExtensionHook was called 4 times (beforeAll, beforeEach, afterEach, afterAll)
    expect(mockedRunExtensionHook).toHaveBeenCalledTimes(4);
    // Check beforeAll call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      1,
      [mockExtension],
      'beforeAll',
      expect.objectContaining({ suite: testSuite }),
    );

    // Check beforeEach call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      2,
      [mockExtension],
      'beforeEach',
      expect.objectContaining({
        test: expect.objectContaining({
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        }),
      }),
    );

    // Check afterEach call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      3,
      [mockExtension],
      'afterEach',
      expect.objectContaining({
        test: expect.objectContaining({
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        }),
        result: expect.objectContaining({
          success: true,
          score: 1,
          response: expect.objectContaining({
            output: 'Test output',
          }),
        }),
      }),
    );

    // Check afterAll call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      4,
      [mockExtension],
      'afterAll',
      expect.objectContaining({
        prompts: expect.arrayContaining([
          expect.objectContaining({
            raw: 'Test prompt {{ var1 }}',
            metrics: expect.objectContaining({
              assertPassCount: 1,
              assertFailCount: 0,
            }),
          }),
          expect.objectContaining({
            raw: 'Test prompt {{ var1 }}',
            metrics: expect.objectContaining({
              assertPassCount: 1,
              assertFailCount: 0,
            }),
          }),
        ]),
        results: expect.any(Array),
        suite: testSuite,
      }),
    );
  });

  it('forwards structured progress metadata with stable completed counts', async () => {
    const delayedProvider = (label: string): ApiProvider =>
      ({
        id: () => 'echo',
        label,
        callApi: async (prompt: string) => {
          const delayMs = prompt.includes('two') ? 10 : prompt.includes('three') ? 20 : 30;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return { output: prompt };
        },
      }) as ApiProvider;

    const progressCallback = vi.fn();
    const testSuite: TestSuite = {
      providers: [delayedProvider('fast-model'), delayedProvider('slow-model')],
      prompts: [toPrompt('item={{item}}')],
      tests: [
        {
          vars: { item: 'one' },
          providers: ['fast-model'],
          assert: [{ type: 'contains', value: 'one' }],
        },
        {
          vars: { item: 'two' },
          providers: ['fast-model'],
          assert: [{ type: 'contains', value: 'two' }],
        },
        {
          vars: { item: 'three' },
          providers: ['slow-model'],
          assert: [{ type: 'contains', value: 'three' }],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      progressCallback,
      showProgressBar: false,
    });

    const completionCalls = progressCallback.mock.calls.filter((call) => call[3]);

    expect(progressCallback).toHaveBeenCalledTimes(3);
    expect(completionCalls).toHaveLength(3);
    expect(completionCalls.map((call) => call.length)).toEqual([6, 6, 6]);
    expect(
      completionCalls.map(([completed, _total, _index, evalStep, _metrics, progress]) => ({
        completed,
        label: evalStep?.provider?.label,
        outcome: progress?.outcome,
        providerTotal: progress?.providerTotal,
      })),
    ).toEqual([
      { completed: 1, label: 'fast-model', outcome: 'pass', providerTotal: 2 },
      { completed: 2, label: 'slow-model', outcome: 'pass', providerTotal: 1 },
      { completed: 3, label: 'fast-model', outcome: 'pass', providerTotal: 2 },
    ]);
  });

  it('announces the exact run plan before executing any tests', async () => {
    const onPlan = vi.fn().mockImplementation(() => {
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
    });
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {
      onPlan,
      showProgressBar: false,
    });

    expect(onPlan).toHaveBeenCalledWith({
      evalCount: 1,
      comparisonCount: 0,
      totalCount: 1,
      providerTotals: { 'test-provider': 1 },
      concurrency: DEFAULT_MAX_CONCURRENCY,
    });
  });

  it('should handle multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider2],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider2.callApi).toHaveBeenCalledTimes(1);
  });
});
