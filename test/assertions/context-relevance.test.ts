import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

setupCommonMocks();

// Mock the matchers module for context-relevance
jest.mock('../../src/matchers', () => {
  const actual = jest.requireActual('../../src/matchers');
  return {
    ...actual,
    matchesContextRelevance: jest
      .fn()
      .mockImplementation((query: string, context: string, output: string, threshold?: number) => {
        if (threshold && threshold > 0.8) {
          return Promise.resolve({
            pass: false,
            score: 0.7,
            reason: 'Context relevance score 0.7 is below threshold 0.8',
          });
        }
        return Promise.resolve({
          pass: true,
          score: 0.9,
          reason: 'Output is relevant to the context',
        });
      }),
  };
});

describe('Context relevance assertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when all required vars are present and context is relevant', async () => {
    const assertion: Assertion = {
      type: 'context-relevance',
      threshold: 0.7,
    };
    const test: AtomicTestCase = {
      vars: {
        query: 'What is the capital of France?',
        context: 'Paris is the capital of France.',
      },
    } as AtomicTestCase;

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test,
      providerResponse: { output: 'The capital of France is Paris.' },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.9,
      reason: 'Output is relevant to the context',
    });
  });

  it('should fail when context relevance score is below threshold', async () => {
    const assertion: Assertion = {
      type: 'context-relevance',
      threshold: 0.9, // Higher threshold
    };
    const test: AtomicTestCase = {
      vars: {
        query: 'What is the capital of France?',
        context: 'Paris is the capital of France.',
      },
    } as AtomicTestCase;

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test,
      providerResponse: { output: 'The capital of France is Paris.' },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0.7,
      reason: 'Context relevance score 0.7 is below threshold 0.8',
    });
  });

  it('should throw an error when vars object is missing', async () => {
    const assertion: Assertion = {
      type: 'context-relevance',
      threshold: 0.7,
    };
    const test: AtomicTestCase = {} as AtomicTestCase;

    await expect(
      runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test,
        providerResponse: { output: 'Some output' },
      }),
    ).rejects.toThrow('context-relevance assertion type must have a vars object');
  });

  it('should throw an error when query var is missing', async () => {
    const assertion: Assertion = {
      type: 'context-relevance',
      threshold: 0.7,
    };
    const test: AtomicTestCase = {
      vars: {
        context: 'Paris is the capital of France.',
      },
    } as AtomicTestCase;

    await expect(
      runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test,
        providerResponse: { output: 'Some output' },
      }),
    ).rejects.toThrow('context-relevance assertion type must have a query var');
  });

  it('should throw an error when context var is missing', async () => {
    const assertion: Assertion = {
      type: 'context-relevance',
      threshold: 0.7,
    };
    const test: AtomicTestCase = {
      vars: {
        query: 'What is the capital of France?',
      },
    } as AtomicTestCase;

    await expect(
      runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test,
        providerResponse: { output: 'Some output' },
      }),
    ).rejects.toThrow('context-relevance assertion type must have a context var');
  });
});
