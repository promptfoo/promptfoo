import './setup';

import { randomUUID } from 'crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { mockApiProvider, resetMockProviders, toPrompt } from './helpers';

afterEach(async () => {
  resetMockProviders();
  vi.mocked(runExtensionHook).mockReset();
  vi.clearAllMocks();
  cliState.resume = false;
  cliState.basePath = '';
  cliState.webUI = false;
  await clearCache();
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('evaluator defaultTest merging', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockProviders();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
  });

  it('should merge defaultTest.options.provider with test case options', async () => {
    const mockProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('mock-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt {{text}}')],
      providers: [mockProvider],
      tests: [
        {
          vars: { text: 'Hello world' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: {
            embedding: {
              id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
              config: {
                region: 'us-east-1',
              },
            },
          },
        },
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // The evaluator should have processed the tests and merged defaultTest options
    expect(summary.results).toBeDefined();
    expect(summary.results.length).toBeGreaterThan(0);

    // Check that the test case has the merged options from defaultTest
    const processedTest = summary.results[0].testCase;
    expect(processedTest?.options?.provider).toEqual({
      embedding: {
        id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
        config: {
          region: 'us-east-1',
        },
      },
    });
  });

  it('should allow test case options to override defaultTest options', async () => {
    const mockProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('mock-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt {{text}}')],
      providers: [mockProvider],
      tests: [
        {
          vars: { text: 'Hello world' },
          options: {
            provider: 'openai:gpt-4',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output is correct',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: 'openai:gpt-3.5-turbo',
          transform: 'output.toUpperCase()',
        },
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Check that the test case options override defaultTest options
    const processedTest = summary.results[0].testCase;
    expect(processedTest?.options?.provider).toBe('openai:gpt-4');
    // But other defaultTest options should still be merged
    expect(processedTest?.options?.transform).toBe('output.toUpperCase()');
  });
});

describe('Evaluator with external defaultTest', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
  });

  it('should handle string defaultTest gracefully', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt {{var}}', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      defaultTest: 'file://path/to/defaultTest.yaml' as any, // String should have been resolved before reaching evaluator
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Should handle gracefully even if string wasn't resolved
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].vars).toEqual({ var: 'value' });
  });

  it('should apply object defaultTest properties correctly', async () => {
    const defaultTest = {
      assert: [{ type: 'equals' as const, value: 'expected' }],
      vars: { defaultVar: 'defaultValue' },
      options: { provider: 'test-provider' },
      metadata: { suite: 'test-suite' },
      threshold: 0.8,
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        { vars: { testVar: 'testValue' } },
        {
          vars: { testVar: 'override' },
          assert: [{ type: 'contains' as const, value: 'exp' }],
          threshold: 0.9,
        },
      ],
      defaultTest,
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // First test should inherit all defaultTest properties
    const firstResult = summary.results[0] as any;
    expect(firstResult.testCase.assert).toEqual(defaultTest.assert);
    expect(firstResult.testCase.vars).toEqual({
      defaultVar: 'defaultValue',
      testVar: 'testValue',
    });
    expect(firstResult.testCase.threshold).toBe(0.8);
    expect(firstResult.testCase.metadata).toEqual({ suite: 'test-suite' });

    // Second test should merge/override appropriately
    const secondResult = summary.results[1] as any;
    expect(secondResult.testCase.assert).toEqual([
      ...defaultTest.assert,
      { type: 'contains' as const, value: 'exp' },
    ]);
    expect(secondResult.testCase.threshold).toBe(0.9); // Override
  });

  it('should allow a test case to opt out of defaultTest assertions', async () => {
    const defaultTest = {
      assert: [{ type: 'equals' as const, value: 'expected' }],
      vars: { defaultVar: 'defaultValue' },
      options: { provider: 'default-provider' },
      metadata: { suite: 'test-suite' },
      threshold: 0.8,
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { testVar: 'testValue' },
          options: { disableDefaultAsserts: true },
          assert: [{ type: 'contains' as const, value: 'exp' }],
        },
      ],
      defaultTest,
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    const result = summary.results[0] as any;
    expect(result.testCase.assert).toEqual([{ type: 'contains' as const, value: 'exp' }]);
    expect(result.testCase.vars).toEqual({
      defaultVar: 'defaultValue',
      testVar: 'testValue',
    });
    expect(result.testCase.threshold).toBe(0.8);
    expect(result.testCase.metadata).toEqual({ suite: 'test-suite' });
    expect(result.testCase.options).toMatchObject({
      provider: 'default-provider',
      disableDefaultAsserts: true,
    });
  });

  it('should handle invariant check for defaultTest.assert array', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      defaultTest: {
        assert: 'not-an-array' as any, // Invalid type
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    // Should throw or handle gracefully
    await expect(evaluate(testSuite, evalRecord, {})).rejects.toThrow(
      'defaultTest.assert is not an array in test case #1',
    );
  });

  it('should correctly merge defaultTest with test case when defaultTest is object', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test {{var}}', label: 'test' }],
      tests: [
        {
          vars: { var: 'test1' },
          options: { transformVars: 'vars.transformed = true; return vars;' },
        },
      ],
      defaultTest: {
        vars: { defaultVar: 'default' },
        options: {
          provider: 'default-provider',
          transformVars: 'vars.defaultTransform = true; return vars;',
        },
        assert: [{ type: 'not-equals' as const, value: '' }],
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Test case transformVars should override defaultTest transformVars
    const result = summary.results[0] as any;
    expect(result.testCase.options?.transformVars).toBe('vars.transformed = true; return vars;');
    // But other options should be merged
    expect(result.testCase.options?.provider).toBe('default-provider');
  });

  it('should preserve metrics from existing prompts when resuming evaluation', async () => {
    // Store original resume state and ensure it's false
    const originalResume = cliState.resume;
    cliState.resume = false;

    try {
      // Create a test suite with 2 prompts and 1 test
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [
          { raw: 'Test prompt 1', label: 'test1' },
          { raw: 'Test prompt 2', label: 'test2' },
        ],
        tests: [{ vars: { var: 'value1' } }],
      };

      // Create initial eval record
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      // Simulate that the eval was already partially completed with some metrics
      const initialMetrics1 = {
        score: 10,
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 0,
        totalLatencyMs: 100,
        tokenUsage: createEmptyTokenUsage(),
        namedScores: {},
        namedScoresCount: {},
        cost: 0.001,
      };

      const initialMetrics2 = {
        score: 5,
        testPassCount: 0,
        testFailCount: 1,
        testErrorCount: 0,
        assertPassCount: 0,
        assertFailCount: 1,
        totalLatencyMs: 150,
        tokenUsage: createEmptyTokenUsage(),
        namedScores: {},
        namedScoresCount: {},
        cost: 0.002,
      };

      evalRecord.prompts = [
        {
          raw: 'Test prompt 1',
          label: 'test1',
          id: 'prompt-test1',
          provider: 'test-provider',
          metrics: { ...initialMetrics1 },
        },
        {
          raw: 'Test prompt 2',
          label: 'test2',
          id: 'prompt-test2',
          provider: 'test-provider',
          metrics: { ...initialMetrics2 },
        },
      ];
      evalRecord.persisted = true;

      // Enable resume mode
      cliState.resume = true;

      // Run evaluation with resume - this will run the test on both prompts
      await evaluate(testSuite, evalRecord, {});

      // Verify the prompts still exist and have the right IDs
      expect(evalRecord.prompts).toHaveLength(2);
      expect(evalRecord.prompts[0].id).toBe('prompt-test1');
      expect(evalRecord.prompts[1].id).toBe('prompt-test2');

      // Check that the prompts have preserved metrics
      // When resuming, the metrics should be accumulated with the initial values
      // The key test is that metrics are not reset to 0

      // For prompt 1 which had testPassCount=1 initially
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBeGreaterThanOrEqual(1);

      // For prompt 2, at least verify metrics exist and aren't completely reset
      expect(evalRecord.prompts[1].metrics).toBeDefined();

      // The combined pass/fail count should be greater than 0, showing metrics weren't reset
      const prompt2TotalTests =
        (evalRecord.prompts[1].metrics?.testPassCount || 0) +
        (evalRecord.prompts[1].metrics?.testFailCount || 0);
      expect(prompt2TotalTests).toBeGreaterThan(0);
    } finally {
      // Always restore original state
      cliState.resume = originalResume;
    }
  });

  it('should backfill legacy named score weights when resuming evaluation', async () => {
    const originalResume = cliState.resume;
    cliState.resume = false;

    try {
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [{ raw: 'Test prompt 1', label: 'test1' }],
        tests: [
          {
            assert: [
              {
                type: 'equals',
                value: 'Test output',
                metric: 'accuracy',
                weight: 3,
              },
              {
                type: 'contains',
                value: 'Missing output',
                metric: 'accuracy',
                weight: 1,
              },
            ],
          },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      evalRecord.prompts = [
        {
          raw: 'Test prompt 1',
          label: 'test1',
          id: 'prompt-test1',
          provider: 'test-provider',
          metrics: {
            score: 1,
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 1,
            assertFailCount: 0,
            totalLatencyMs: 100,
            tokenUsage: createEmptyTokenUsage(),
            namedScores: { accuracy: 1 },
            namedScoresCount: { accuracy: 1 },
            cost: 0.001,
          },
        },
      ];
      evalRecord.persisted = true;
      cliState.resume = true;

      await evaluate(testSuite, evalRecord, {});

      expect(evalRecord.prompts[0].metrics?.namedScores.accuracy).toBeCloseTo(4, 10);
      expect(evalRecord.prompts[0].metrics?.namedScoresCount.accuracy).toBe(3);
      expect(evalRecord.prompts[0].metrics?.namedScoreWeights?.accuracy).toBe(5);
    } finally {
      cliState.resume = originalResume;
    }
  });
});

describe('defaultTest normalization for extensions', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
  });

  it('should initialize defaultTest when undefined and extensions are present', async () => {
    const mockExtension = 'file://test-extension.js';
    let capturedSuite: TestSuite | undefined;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        capturedSuite = (context as { suite: TestSuite }).suite;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      // No defaultTest defined
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedSuite).toBeDefined();
    expect(capturedSuite!.defaultTest).toBeDefined();
    expect(capturedSuite!.defaultTest).toEqual({ assert: [] });
  });

  it('should initialize defaultTest.assert when defaultTest exists but assert is undefined', async () => {
    const mockExtension = 'file://test-extension.js';
    let capturedSuite: TestSuite | undefined;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        capturedSuite = (context as { suite: TestSuite }).suite;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      defaultTest: {
        vars: { defaultVar: 'defaultValue' },
        // No assert defined
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedSuite).toBeDefined();
    expect(capturedSuite!.defaultTest).toBeDefined();
    const defaultTest = capturedSuite!.defaultTest as Record<string, unknown>;
    expect(defaultTest.vars).toEqual({ defaultVar: 'defaultValue' });
    expect(defaultTest.assert).toEqual([]);
  });

  it('should preserve existing defaultTest.assert when extensions are present', async () => {
    const mockExtension = 'file://test-extension.js';
    let capturedSuite: TestSuite | undefined;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        capturedSuite = (context as { suite: TestSuite }).suite;
      }
      return context;
    });

    const existingAssertions = [
      { type: 'contains' as const, value: 'expected' },
      { type: 'not-contains' as const, value: 'unexpected' },
    ];

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      defaultTest: {
        assert: existingAssertions,
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedSuite).toBeDefined();
    const defaultTest = capturedSuite!.defaultTest as Record<string, unknown>;
    expect(defaultTest.assert).toBe(existingAssertions); // Same reference
    expect(defaultTest.assert).toHaveLength(2);
  });

  it('should not modify defaultTest when no extensions are present', async () => {
    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockClear();

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      // No extensions
      // No defaultTest
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // runExtensionHook should still be called (with empty/undefined extensions)
    // but the beforeAll hook call should receive the original suite without normalization
    const beforeAllCall = mockedRunExtensionHook.mock.calls.find((call) => call[1] === 'beforeAll');
    expect(beforeAllCall).toBeDefined();
    const suite = (beforeAllCall?.[2] as { suite: TestSuite } | undefined)?.suite;
    expect(suite?.defaultTest).toBeUndefined();
  });

  it('should allow extensions to push to defaultTest.assert safely', async () => {
    const mockExtension = 'file://test-extension.js';

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        // Simulate what an extension would do - push to assert array
        // This should work because defaultTest.assert is guaranteed to be an array
        const suite = (context as { suite: TestSuite }).suite;
        const defaultTest = suite.defaultTest as Exclude<typeof suite.defaultTest, string>;
        defaultTest!.assert!.push({ type: 'is-json' as const });
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      // No defaultTest - will be initialized by evaluator
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // The assertion added by the extension should be present in the results
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.results[0].testCase.assert).toContainEqual({ type: 'is-json' });
  });
});
