import { describe, expect, it, vi } from 'vitest';
import { handleConversationRelevance } from '../../src/external/assertions/deepeval';
import { createMockProvider as createFactoryProvider } from '../factories/provider';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

const createMockProvider = (output: string, reason?: string) =>
  createFactoryProvider({
    response: {
      output: JSON.stringify({
        verdict: output,
        ...(output === 'no' && {
          reason: reason || 'Response is completely irrelevant to the message input',
        }),
      }),
      tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
    },
  });

// Mock getAndCheckProvider
vi.mock('../../src/matchers/providers', async () => {
  const actual = await vi.importActual('../../src/matchers/providers');
  return {
    ...actual,
    getAndCheckProvider: vi.fn().mockImplementation((_type, provider) => {
      return provider;
    }),
  };
});

const defaultParams = {
  baseType: 'conversation-relevance' as const,
  assertionValueContext: {
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
    const smartMockProvider = createFactoryProvider({
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(async (prompt) => {
        // Check if the prompt contains the math question and Paris response
        const hasIrrelevantResponse =
          (prompt as string).includes('2+2') && (prompt as string).includes('Paris');
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
      }),
    });

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
      assertionValueContext: {
        ...defaultParams.assertionValueContext,
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
      assertionValueContext: {
        ...defaultParams.assertionValueContext,
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

  // https://github.com/promptfoo/promptfoo/issues/10141
  it('should use the DeepEval default threshold when threshold is omitted for Issue #10141', async () => {
    const provider = createMockProvider('no');
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
      },
      prompt: 'What is the weather like?',
      outputString: 'The capital of France is Paris.',
      test: {
        vars: {},
        options: { provider },
      },
    };

    const result = await handleConversationRelevance(params);

    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('should preserve an explicit zero threshold', async () => {
    const provider = createMockProvider('no');
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0,
      },
      prompt: 'What is the weather like?',
      outputString: 'The capital of France is Paris.',
      test: {
        vars: {},
        options: { provider },
      },
    };

    const result = await handleConversationRelevance(params);

    expect(result.score).toBe(0);
    expect(result.pass).toBe(true);
  });

  it('should honor an omitted threshold for a negated assertion', async () => {
    const provider = createMockProvider('no');
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'not-conversation-relevance',
      },
      inverse: true,
      prompt: 'What is the weather like?',
      outputString: 'The capital of France is Paris.',
      test: {
        vars: {},
        options: { provider },
      },
    };

    const result = await handleConversationRelevance(params);

    expect(result.score).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('should not pass a negated assertion when the conversation grader fails', async () => {
    const provider = createFactoryProvider({ response: { error: 'grader unavailable' } });
    const result = await handleConversationRelevance({
      ...defaultParams,
      assertion: { type: 'not-conversation-relevance' },
      inverse: true,
      prompt: 'What is the weather like?',
      outputString: 'The capital of France is Paris.',
      test: { vars: {}, options: { provider } },
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('grader unavailable');
    expect(result.metadata).toEqual({ graderError: true });
  });

  it('should not pass a negated assertion when the conversation grader returns an invalid verdict', async () => {
    const provider = createMockProvider('maybe');
    const result = await handleConversationRelevance({
      ...defaultParams,
      assertion: { type: 'not-conversation-relevance' },
      inverse: true,
      prompt: 'What is the weather like?',
      outputString: 'The capital of France is Paris.',
      test: { vars: {}, options: { provider } },
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('invalid verdict');
    expect(result.metadata).toEqual({ graderError: true });
  });

  it('should preserve prior conversation-grader usage when a later window fails', async () => {
    const provider = createFactoryProvider({
      callApi: vi
        .fn<ApiProvider['callApi']>()
        .mockResolvedValueOnce({
          output: JSON.stringify({ verdict: 'yes' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        })
        .mockResolvedValueOnce({
          error: 'grader unavailable',
          tokenUsage: { total: 12, prompt: 7, completion: 5 },
        }),
    });

    const result = await handleConversationRelevance({
      ...defaultParams,
      assertion: { type: 'not-conversation-relevance' },
      inverse: true,
      prompt: 'Second question',
      outputString: 'Second answer',
      test: {
        vars: {
          _conversation: [
            { input: 'First question', output: 'First answer' },
            { input: 'Second question', output: 'Second answer' },
          ],
        },
        options: { provider },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.tokensUsed).toMatchObject({ total: 22, prompt: 12, completion: 10 });
  });
});
