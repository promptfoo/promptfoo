import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

// Setup common mocks
setupCommonMocks();

// Mock the matchers module
jest.mock('../../src/matchers', () => {
  const original = jest.requireActual('../../src/matchers');
  return {
    ...original,
    matchesClassification: jest.fn().mockImplementation((value, output, threshold) => {
      if (threshold === 0.7) {
        return Promise.resolve({
          pass: false,
          score: 0.4,
          reason: 'Classification failed with score 0.4',
        });
      }
      return Promise.resolve({
        pass: true,
        score: 0.8,
        reason: 'Classification successful with score 0.8',
      });
    }),
    matchesContextRelevance: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    matchesContextFaithfulness: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
  };
});

describe('Classifier assertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when classifier score is above threshold', async () => {
    const output = 'test response';
    const assertion: Assertion = {
      type: 'classifier',
      value: 'expected classification',
      threshold: 0.5,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output, cost: 0 },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: true,
    });
  });

  it('should fail when classifier score is below threshold', async () => {
    const output = 'test response';
    const assertion: Assertion = {
      type: 'classifier',
      value: 'expected classification',
      threshold: 0.7,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output, cost: 0 },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
    });
  });
});
