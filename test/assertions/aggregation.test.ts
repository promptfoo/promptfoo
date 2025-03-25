import { runAssertions } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

setupCommonMocks();

describe('Assertion score aggregation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should calculate simple average for assertions without weights', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        assert: [
          {
            type: 'equals',
            value: 'Hello world', // Will fail (score = 0)
          },
          {
            type: 'contains',
            value: 'there', // Will pass (score = 1)
          },
          {
            type: 'contains',
            value: 'Hi', // Will pass (score = 1)
          },
        ],
      } as AtomicTestCase,
      providerResponse: { output: 'Hi there' },
    });

    // Average: (0 + 1 + 1) / 3 = 0.667
    expect(result.score).toBeCloseTo(0.667, 2);
    expect(result.pass).toBe(true);
  });

  it('should handle weighted assertions', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        assert: [
          {
            type: 'equals',
            value: 'Hello world', // Will fail (score = 0)
            weight: 2, // Double weight
          },
          {
            type: 'contains',
            value: 'there', // Will pass (score = 1)
            weight: 1,
          },
          {
            type: 'contains',
            value: 'Hi', // Will pass (score = 1)
            weight: 1,
          },
        ],
      } as AtomicTestCase,
      providerResponse: { output: 'Hi there' },
    });

    // Weighted Average: (0*2 + 1*1 + 1*1) / (2+1+1) = 0.5
    expect(result.score).toBeCloseTo(0.5, 2);
    expect(result.pass).toBe(true);
  });

  it('should handle an assertion with threshold 1', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            threshold: 1, // Requires exact match
          },
        ],
      } as AtomicTestCase,
      providerResponse: { output: 'Hi there' },
    });

    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('should handle an assertion with threshold 0', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            threshold: 0, // Will pass regardless of score
          },
        ],
      } as AtomicTestCase,
      providerResponse: { output: 'Hi there' },
    });

    expect(result.score).toBe(0);
    expect(result.pass).toBe(true); // Should pass because threshold is 0
  });

  it('should handle named scores for metrics', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        assert: [
          {
            type: 'equals',
            value: 'Hello',
            metric: 'greeting',
          },
          {
            type: 'contains',
            value: 'there',
            metric: 'informality',
          },
        ],
      } as AtomicTestCase,
      providerResponse: { output: 'Hi there' },
    });

    expect(result.namedScores).toEqual({
      greeting: 0,
      informality: 1,
    });
  });

  it('should use max score for multiple assertions with same metric', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        assert: [
          {
            type: 'equals',
            value: 'Hello',
            metric: 'greeting',
          },
          {
            type: 'equals',
            value: 'Hi',
            metric: 'greeting',
          },
          {
            type: 'contains',
            value: 'there',
            metric: 'context',
          },
          {
            type: 'contains',
            value: 'world',
            metric: 'context',
          },
        ],
      } as AtomicTestCase,
      providerResponse: { output: 'Hi there' },
    });

    // For greeting, max(0, 1) = 1
    // For context, max(1, 0) = 1
    expect(result.namedScores).toEqual({
      greeting: 1,
      context: 1,
    });
  });

  it('should handle nested assert-set with metrics', async () => {
    const metric = 'The best metric';
    const output = 'Expected output';
    const test: AtomicTestCase = {
      assert: [
        {
          type: 'assert-set',
          metric,
          threshold: 0.5,
          assert: [
            {
              type: 'equals',
              value: 'Hello world',
              weight: 2,
            },
            {
              type: 'contains',
              value: 'Expected',
              weight: 1,
            },
          ],
        },
      ],
    } as AtomicTestCase;

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });

    // Weighted Average in the assert-set: (0*2 + 1*1) / (2+1) = 0.333
    // But it passes because threshold is 0.5 and the score should be the threshold
    expect(result.namedScores).toEqual({
      [metric]: 0.5,
    });
  });
});
