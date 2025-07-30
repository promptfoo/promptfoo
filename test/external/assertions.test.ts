import { handleConversationRelevance } from '../../src/external/assertions/deepeval';
import type { AssertionParams, AtomicTestCase, ApiProvider } from '../../src/types';

const createMockProvider = (output: string, reason?: string): ApiProvider => ({
  id: () => 'mock',
  callApi: async () => ({
    output: JSON.stringify({
      verdict: output,
      ...(output === 'no' && {
        reason: reason || 'Response is completely irrelevant to the message input',
      }),
    }),
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
  }),
});

// Mock getAndCheckProvider
jest.mock('../../src/matchers', () => ({
  ...jest.requireActual('../../src/matchers'),
  getAndCheckProvider: jest.fn().mockImplementation((type, provider) => {
    return provider;
  }),
}));

const defaultParams = {
  baseType: 'conversation-relevance' as const,
  context: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: createMockProvider('yes'),
    providerResponse: { output: 'hello world' },
  },
  output: 'hello world',
  providerResponse: { output: 'hello world' },
  test: {
    vars: {},
    options: {
      provider: createMockProvider('yes'),
    },
  } as AtomicTestCase,
  inverse: false,
};

describe('handleConversationRelevance', () => {
  it('should handle single message pairs', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
      },
      prompt: 'What is the weather like?',
      outputString: 'The weather is sunny today.',
      test: {
        vars: {},
        options: {
          provider: createMockProvider('yes'),
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should ignore outputString when _conversation is present and non-empty', async () => {
    const conversation = [{ input: 'Hi', output: 'Hello! How can I help you?' }];

    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
      },
      prompt: 'This should be ignored',
      outputString: 'This should be ignored',
      test: {
        vars: {
          _conversation: conversation,
        },
        options: {
          provider: createMockProvider('yes'),
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should evaluate sliding windows in a conversation', async () => {
    const conversation = [
      { input: 'Hi', output: 'Hello! How can I help you?' },
      { input: 'What is the weather like?', output: 'The weather is sunny today.' },
      {
        input: 'What should I wear?',
        output: 'Given the sunny weather, you might want to wear light clothes.',
      },
      { input: 'Thanks!', output: "You're welcome! Enjoy the sunshine!" },
      { input: 'What is 2+2?', output: 'The capital of France is Paris.' }, // Irrelevant response
    ];

    // Create a smart mock provider that only fails for the math/Paris response
    const smartMockProvider: ApiProvider = {
      id: () => 'mock',
      callApi: async (prompt: string) => {
        // Check if the prompt contains the math question and Paris response
        const hasIrrelevantResponse = prompt.includes('2+2') && prompt.includes('Paris');
        return {
          output: JSON.stringify({
            verdict: hasIrrelevantResponse ? 'no' : 'yes',
            ...(hasIrrelevantResponse && {
              reason:
                'The response about Paris is completely unrelated to the mathematical question about 2+2',
            }),
          }),
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        };
      },
    };

    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.85, // Score will be 0.8 (4/5), so threshold > 0.8 to fail
        config: {
          windowSize: 3,
        },
      },
      outputString: 'This should be ignored',
      test: {
        vars: {
          _conversation: conversation,
        },
        options: {
          provider: smartMockProvider,
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(1);
    expect(result.reason).toContain('The response about Paris is completely unrelated');
  });

  it('should handle conversations shorter than window size', async () => {
    const shortConversation = [
      { input: 'Hi', output: 'Hello! How can I help you?' },
      { input: 'What is the weather like?', output: 'The weather is sunny today.' },
    ];

    const params: AssertionParams = {
      ...defaultParams,
      context: {
        ...defaultParams.context,
        provider: createMockProvider('yes'),
      },
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
        config: {
          windowSize: 5,
        },
      },
      outputString: 'This should be ignored',
      test: {
        vars: {
          _conversation: shortConversation,
        },
        options: {
          provider: createMockProvider('yes'),
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should use default window size when not specified', async () => {
    const conversation = [
      { input: 'Hi', output: 'Hello! How can I help you?' },
      { input: 'What is the weather like?', output: 'The weather is sunny today.' },
      {
        input: 'What should I wear?',
        output: 'Given the sunny weather, you might want to wear light clothes.',
      },
      { input: 'Thanks!', output: "You're welcome! Enjoy the sunshine!" },
    ];

    const params: AssertionParams = {
      ...defaultParams,
      context: {
        ...defaultParams.context,
        provider: createMockProvider('yes'),
      },
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
      },
      outputString: 'This should be ignored',
      test: {
        vars: {
          _conversation: conversation,
        },
        options: {
          provider: createMockProvider('yes'),
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('pass');
  });

  it('should use outputString when _conversation is empty', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
      },
      prompt: 'What is the weather like?',
      outputString: 'The weather is sunny today.',
      test: {
        vars: {
          _conversation: [], // Empty conversation array
        },
        options: {
          provider: createMockProvider('yes'),
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should use outputString when _conversation is undefined', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
      },
      prompt: 'What is the weather like?',
      outputString: 'The weather is sunny today.',
      test: {
        vars: {
          // _conversation is not defined
        },
        options: {
          provider: createMockProvider('yes'),
        },
      },
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });
});
