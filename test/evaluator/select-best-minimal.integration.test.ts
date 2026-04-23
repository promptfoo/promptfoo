import { describe, expect, it, vi } from 'vitest';
import { runCompareAssertion } from '../../src/assertions/index';
import { createMockProvider, createProviderResponse } from '../factories/provider';

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
    const gradingProvider = createMockProvider({
      id: 'test-grading-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(async (_prompt, context) => {
        capturedContext = context;
        return {
          output: '0', // Select first option
          tokenUsage: {},
        };
      }),
    });

    const originalProvider = createMockProvider({
      id: 'original-provider',
      response: createProviderResponse({ output: '', tokenUsage: {} }),
    });

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
