import { describe, expect, it, vi } from 'vitest';
import { runCompareAssertion } from '../../src/assertions/index';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  CallApiContextParams,
} from '../../src/types/index';

describe('select-best context propagation', () => {
  it('should pass context with originalProvider to grading provider', async () => {
    let capturedContext: CallApiContextParams | undefined;

    // Create a grading provider that captures the context
    const gradingProvider: ApiProvider = {
      id: () => 'test-grading-provider',
      callApi: vi.fn(async (_prompt: string, context) => {
        capturedContext = context;
        return {
          output: '0', // Select first option
          tokenUsage: {},
        };
      }),
    };

    const originalProvider: ApiProvider = {
      id: () => 'original-provider',
      callApi: vi.fn().mockResolvedValue({ output: '', tokenUsage: {} }),
    };

    const test: AtomicTestCase = {
      vars: { foo: 'bar' },
      options: {
        provider: gradingProvider,
      },
    };

    const assertion: Assertion = {
      type: 'select-best',
      value: 'Pick the best output',
    };

    const outputs = ['Output 1', 'Output 2'];

    const contextToPass: CallApiContextParams = {
      originalProvider,
      prompt: { raw: 'test prompt', label: 'test' },
      vars: { foo: 'bar' },
    };

    // Call runCompareAssertion with context
    await runCompareAssertion(test, assertion, outputs, contextToPass);

    // Verify the grading provider was called
    expect(gradingProvider.callApi).toHaveBeenCalled();

    // Verify it received the context with originalProvider
    expect(capturedContext).toBeDefined();
    expect(capturedContext?.originalProvider).toBeDefined();
    expect(capturedContext?.originalProvider?.id()).toBe('original-provider');
  });
});
