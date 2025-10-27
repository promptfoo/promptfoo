import { evaluate } from '../../src/evaluator';

import type Eval from '../../src/models/eval';
import type { ApiProvider, EvaluateOptions, EvaluateResult, TestSuite } from '../../src/types/index';

describe('select-best context propagation integration', () => {
  let mockEval: any;
  let storedResults: EvaluateResult[];

  beforeEach(() => {
    // Create a results array that will be shared across all mock methods
    storedResults = [];

    // Create a mock eval that properly tracks results
    mockEval = {
      id: 'test-eval-id',
      addResult: jest.fn(async (result: EvaluateResult) => {
        storedResults.push(result);
      }),
      addPrompts: jest.fn(),
      fetchResultsByTestIdx: jest.fn((testIdx: number) => {
        return storedResults.filter((r) => r.testIdx === testIdx);
      }),
      setVars: jest.fn(),
      results: storedResults,
      prompts: [],
      persisted: false,
      config: {
        outputPath: undefined,
      },
    } as unknown as Eval;
  });

  it('should pass originalProvider context to grading provider in select-best', async () => {
    // Track whether the grading provider received originalProvider
    let receivedOriginalProvider: ApiProvider | undefined;

    // Create a custom grading provider that captures the context
    const gradingProvider: ApiProvider = {
      id: () => 'test-grading-provider',
      callApi: jest.fn(async (_prompt: string, context) => {
        // Capture the originalProvider from the context
        receivedOriginalProvider = context?.originalProvider;

        // Return a grading response that selects the first output
        return {
          output: JSON.stringify({
            reason: 'First output is best',
            bestIndex: 0,
          }),
          tokenUsage: {},
        };
      }),
    };

    // Create providers to be compared
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      callApi: jest.fn().mockResolvedValue({
        output: 'Response from provider 1',
        tokenUsage: {},
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      callApi: jest.fn().mockResolvedValue({
        output: 'Response from provider 2',
        tokenUsage: {},
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { input: 'test' },
          options: {
            provider: gradingProvider,
          },
          assert: [
            {
              type: 'select-best',
              value: 'Select the most helpful response',
            },
          ],
        },
      ],
    };

    const options: EvaluateOptions = {
      maxConcurrency: 1,
    };

    // Run evaluation
    await evaluate(testSuite, mockEval, options);

    // Verify the grading provider was called
    expect(gradingProvider.callApi).toHaveBeenCalled();

    // Verify originalProvider was passed to the grading provider
    // In select-best, the originalProvider should be the first provider being graded
    expect(receivedOriginalProvider).toBeDefined();
    expect(receivedOriginalProvider?.id()).toBe('provider-1');

    // Verify evaluation completed successfully
    expect(mockEval.addResult).toHaveBeenCalled();

    // After select-best grading, results are updated in place
    // Check the stored results (which should now have updated success/score)
    expect(storedResults).toHaveLength(2);
    expect(storedResults[0].testIdx).toBe(0);
    expect(storedResults[1].testIdx).toBe(0);

    // The first output should be marked as best (bestIndex: 0)
    expect(storedResults[0].success).toBe(true);
    expect(storedResults[0].score).toBe(1);

    // The second output should not be best
    expect(storedResults[1].success).toBe(false);
    expect(storedResults[1].score).toBe(0);
  });

  it('should handle select-best with single provider', async () => {
    // Create a grading provider
    const gradingProvider: ApiProvider = {
      id: () => 'test-grading-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify({
          reason: 'Output is good',
          bestIndex: 0,
        }),
        tokenUsage: {},
      }),
    };

    const provider1: ApiProvider = {
      id: () => 'provider-1',
      callApi: jest.fn().mockResolvedValue({
        output: 'Response from provider 1',
        tokenUsage: {},
      }),
    };

    // With single provider, select-best won't be triggered (requires at least 2 outputs)
    const testSuite: TestSuite = {
      providers: [provider1],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { input: 'test' },
          options: {
            provider: gradingProvider,
          },
          assert: [
            {
              type: 'select-best',
              value: 'Select the most helpful response',
            },
          ],
        },
      ],
    };

    const options: EvaluateOptions = {
      maxConcurrency: 1,
    };

    // Run evaluation - should complete without throwing
    await expect(evaluate(testSuite, mockEval, options)).resolves.not.toThrow();

    // Verify evaluation completed with one result
    expect(mockEval.addResult).toHaveBeenCalled();
  });

  it('should pass originalProvider from first result in select-best comparison', async () => {
    let receivedContext: any;

    // Create a grading provider that captures the full context
    const gradingProvider: ApiProvider = {
      id: () => 'test-grading-provider',
      callApi: jest.fn(async (_prompt: string, context) => {
        receivedContext = context;

        // Return a grading response selecting the middle option
        return {
          output: JSON.stringify({
            reason: 'Middle output is best',
            bestIndex: 1,
          }),
          tokenUsage: {},
        };
      }),
    };

    const provider1: ApiProvider = {
      id: () => 'provider-1',
      callApi: jest.fn().mockResolvedValue({
        output: 'Response from provider 1',
        tokenUsage: {},
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      callApi: jest.fn().mockResolvedValue({
        output: 'Response from provider 2',
        tokenUsage: {},
      }),
    };

    const provider3: ApiProvider = {
      id: () => 'provider-3',
      callApi: jest.fn().mockResolvedValue({
        output: 'Response from provider 3',
        tokenUsage: {},
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2, provider3],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { input: 'test' },
          options: {
            provider: gradingProvider,
          },
          assert: [
            {
              type: 'select-best',
              value: 'Select the most helpful response',
            },
          ],
        },
      ],
    };

    const options: EvaluateOptions = {
      maxConcurrency: 1,
    };

    // Run evaluation
    await evaluate(testSuite, mockEval, options);

    // Verify grading provider was called
    expect(gradingProvider.callApi).toHaveBeenCalled();

    // The grading provider should receive originalProvider from the first result
    expect(receivedContext?.originalProvider).toBeDefined();
    expect(receivedContext.originalProvider.id()).toBe('provider-1');

    // Verify results were added for all three providers
    expect(mockEval.addResult).toHaveBeenCalledTimes(3);

    // Verify the middle provider (provider2) was marked as best (bestIndex: 1)
    expect(storedResults).toHaveLength(3);
    expect(storedResults[0].success).toBe(false); // provider-1: not best
    expect(storedResults[0].score).toBe(0);
    expect(storedResults[1].success).toBe(true); // provider-2: best
    expect(storedResults[1].score).toBe(1);
    expect(storedResults[2].success).toBe(false); // provider-3: not best
    expect(storedResults[2].score).toBe(0);
  });
});
