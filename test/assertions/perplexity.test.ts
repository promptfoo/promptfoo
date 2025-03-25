import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

// Setup common mocks
setupCommonMocks();

// Mock the perplexity module
jest.mock('../../src/assertions/perplexity', () => ({
  handlePerplexity: jest.fn().mockImplementation(({ assertion }) => {
    const perplexity = 5;
    const pass = assertion.threshold ? perplexity <= assertion.threshold : true;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Perplexity ${perplexity.toFixed(2)} is greater than threshold ${assertion.threshold}`,
      assertion,
    };
  }),
}));

describe('Perplexity assertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when perplexity is below threshold', async () => {
    const output = 'test output';
    const assertion: Assertion = {
      type: 'perplexity',
      threshold: 10,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: {
        output,
        logProbs: [-0.5, -0.3, -0.2],
        cost: 0,
      },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: true,
      score: 1,
    });
  });

  it('should fail when perplexity is above threshold', async () => {
    // For this test, override the mock to return a failing result
    require('../../src/assertions/perplexity').handlePerplexity.mockImplementationOnce(
      ({ assertion }) => ({
        pass: false,
        score: 0,
        reason: `Perplexity 5.00 is greater than threshold ${assertion.threshold}`,
        assertion,
      }),
    );

    const output = 'test output';
    const assertion: Assertion = {
      type: 'perplexity',
      threshold: 3,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: {
        output,
        logProbs: [-0.5, -0.3, -0.2],
        cost: 0,
      },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
    });
  });
});
