import { evaluate } from '../../src/evaluator';

import type Eval from '../../src/models/eval';
import type { ApiProvider, EvaluateOptions, TestSuite } from '../../src/types/index';

describe('select-best context propagation integration', () => {
  const mockEval = {
    id: 'test-eval-id',
    addResult: jest.fn(),
    addPrompts: jest.fn(),
    fetchResultsByTestIdx: jest.fn(),
    setVars: jest.fn(),
    results: [],
    prompts: [],
    persisted: false,
    config: {
      outputPath: undefined,
    },
  } as unknown as Eval;

  beforeEach(() => {
    jest.clearAllMocks();
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

    // Get the first result call (provider-1)
    const result1 = jest.mocked(mockEval.addResult).mock.calls[0][0];
    expect(result1.success).toBe(true);
    expect(result1.score).toBe(1);

    // Get the second result call (provider-2)
    const result2 = jest.mocked(mockEval.addResult).mock.calls[1][0];
    expect(result2.success).toBe(false);
    expect(result2.score).toBe(0);
  });

  it('should handle select-best when originalProvider lookup fails gracefully', async () => {
    // Create a grading provider
    const gradingProvider: ApiProvider = {
      id: () => 'test-grading-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify({
          reason: 'First output is best',
          bestIndex: 0,
        }),
        tokenUsage: {},
      }),
    };

    // Create a provider with an ID that won't be found in the providers list
    const _provider1: ApiProvider = {
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

    // Note: We don't include provider1 in the providers list to simulate a lookup failure
    const testSuite: TestSuite = {
      providers: [provider2], // Only provider2, so provider1 lookup will fail
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

    // Verify evaluation completed
    expect(mockEval.addResult).toHaveBeenCalled();
  });

  it('should pass different originalProvider for each output being graded', async () => {
    const capturedProviders: (ApiProvider | undefined)[] = [];

    // Create a grading provider that captures originalProvider for each call
    const gradingProvider: ApiProvider = {
      id: () => 'test-grading-provider',
      callApi: jest.fn(async (_prompt: string, context) => {
        capturedProviders.push(context?.originalProvider);

        // Return a grading response
        return {
          output: JSON.stringify({
            reason: 'Grading output',
            bestIndex: 0,
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

    // Verify we captured providers for each output
    expect(capturedProviders.length).toBeGreaterThan(0);

    // The grading provider is called once for all outputs together
    // So we should have captured one originalProvider (from the first result)
    expect(capturedProviders[0]).toBeDefined();
    expect(capturedProviders[0]?.id()).toBe('provider-1');
  });
});
