import { handleVerdict } from '../../src/assertions/verdict';
import {
  DiscreteScale,
  LikertScale,
  BooleanScale,
  createScale,
} from '../../src/assertions/verdict/scales';
import { createUnit } from '../../src/assertions/verdict/units';
import type { AssertionParams, AssertionValueFunctionContext } from '../../src/types';

// Mock provider responses
jest.mock('../../src/matchers', () => ({
  getAndCheckProvider: jest.fn().mockResolvedValue({
    callApi: jest.fn().mockResolvedValue({
      output: 'yes',
      tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
    }),
  }),
}));

jest.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: jest.fn().mockResolvedValue({
    gradingProvider: 'openai:gpt-4',
  }),
}));

describe('Verdict Assertion', () => {
  const mockTest = {
    vars: { input: 'test input' },
  };

  const mockProviderResponse = {
    error: undefined,
    output: 'test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
  };

  const mockContext: AssertionValueFunctionContext = {
    prompt: 'test prompt',
    test: mockTest,
    logProbs: undefined,
    provider: undefined,
    providerResponse: mockProviderResponse,
    vars: mockTest.vars,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Scale Types', () => {
    test('DiscreteScale validation', () => {
      const scale = new DiscreteScale(['red', 'green', 'blue']);
      expect(scale.validate('red')).toBe(true);
      expect(scale.validate('yellow')).toBe(false);
      expect(scale.includes('green')).toBe(true);
    });

    test('LikertScale validation', () => {
      const scale = new LikertScale(1, 5);
      expect(scale.validate(3)).toBe(true);
      expect(scale.validate(0)).toBe(false);
      expect(scale.validate(6)).toBe(false);
      expect(scale.includes(5)).toBe(true);
    });

    test('BooleanScale validation', () => {
      const scale = new BooleanScale();
      expect(scale.validate(true)).toBe(true);
      expect(scale.validate(false)).toBe(true);
      expect(scale.validate('yes' as any)).toBe(false);
    });

    test('createScale from array', () => {
      const scale = createScale(['a', 'b', 'c']);
      expect(scale).toBeInstanceOf(DiscreteScale);
      expect(scale.validate('a')).toBe(true);
    });

    test('createScale from range', () => {
      const scale = createScale([1, 7]);
      expect(scale).toBeInstanceOf(LikertScale);
      expect(scale.validate(4)).toBe(true);
    });
  });

  describe('Basic Verdict Assertions', () => {
    test('simple string prompt', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: 'Is this output correct?',
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'The answer is 42',
        outputString: 'The answer is 42',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      const result = await handleVerdict(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toBe('Choice: yes');
    });

    test('categorical verdict', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: {
            type: 'categorical',
            prompt: 'What color is the sky?',
            categories: ['blue', 'red', 'green'],
          },
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'The sky is blue',
        outputString: 'The sky is blue',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      // Mock provider to return 'blue'
      const { getAndCheckProvider } = require('../../src/matchers');
      getAndCheckProvider.mockResolvedValueOnce({
        callApi: jest.fn().mockResolvedValue({
          output: 'blue',
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
        }),
      });

      const result = await handleVerdict(params);
      expect(result.pass).toBe(true); // Custom categories are considered pass
      expect(result.score).toBe(1);
      expect(result.reason).toContain('Choice: blue');
    });

    test('likert scale verdict', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: {
            type: 'likert',
            prompt: 'Rate the quality from 1-5',
            scale: [1, 5],
          },
          threshold: 3,
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'High quality output',
        outputString: 'High quality output',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      // Mock provider to return score 4
      const { getAndCheckProvider } = require('../../src/matchers');
      getAndCheckProvider.mockResolvedValueOnce({
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ score: 4, explanation: 'Good quality' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
        }),
      });

      const result = await handleVerdict(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(4);
      expect(result.reason).toBe('Score: 4');
    });
  });

  describe('Unit Types', () => {
    test('createUnit creates correct unit types', () => {
      const judgeUnit = createUnit('judge', { prompt: 'Rate this' });
      expect(judgeUnit.type).toBe('judge');

      const categoricalUnit = createUnit('categorical', {
        prompt: 'Choose one',
        categories: ['a', 'b'],
      });
      expect(categoricalUnit.type).toBe('categorical-judge');

      const maxPoolUnit = createUnit('max-pool', {});
      expect(maxPoolUnit.type).toBe('max-pool');
    });
  });

  describe('Pipeline Execution', () => {
    test('simple pipeline with layer and aggregation', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: {
            pipeline: [
              {
                layer: {
                  units: [
                    {
                      type: 'categorical',
                      prompt: 'Is this correct?',
                      categories: ['yes', 'no'],
                    },
                  ],
                  repeat: 3,
                },
              },
              {
                type: 'max-pool',
              },
            ],
          },
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'The answer is correct',
        outputString: 'The answer is correct',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      // Mock all 3 calls to return 'yes'
      const { getAndCheckProvider } = require('../../src/matchers');
      getAndCheckProvider.mockResolvedValue({
        callApi: jest
          .fn()
          .mockResolvedValueOnce({
            output: 'yes',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          })
          .mockResolvedValueOnce({
            output: 'yes',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          })
          .mockResolvedValueOnce({
            output: 'yes',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
      });

      const result = await handleVerdict(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toContain('Majority vote: yes (3/3 votes)');
    });

    test('pipeline with verification', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: {
            pipeline: [
              {
                type: 'categorical',
                prompt: 'Is this accurate?',
                categories: ['accurate', 'inaccurate'],
              },
              {
                type: 'verify',
                prompt: 'Verify the previous assessment',
              },
            ],
          },
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'Scientific explanation',
        outputString: 'Scientific explanation',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      // Mock provider responses
      const { getAndCheckProvider } = require('../../src/matchers');
      getAndCheckProvider.mockResolvedValue({
        callApi: jest
          .fn()
          .mockResolvedValueOnce({
            output: 'accurate',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          })
          .mockResolvedValueOnce({
            output: 'valid',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
      });

      const result = await handleVerdict(params);
      expect(result.pass).toBe(true);
      expect(result.verdictDetails?.executionTrace).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    test('handles invalid assertion value', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: 123, // Invalid - should be string or object
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'test',
        outputString: 'test',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      await expect(handleVerdict(params)).rejects.toThrow(
        'verdict assertion must have a string or object value',
      );
    });

    test('handles provider errors gracefully', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: 'Is this correct?',
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'test',
        outputString: 'test',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      // Mock provider error
      const { getAndCheckProvider } = require('../../src/matchers');
      getAndCheckProvider.mockResolvedValueOnce({
        callApi: jest.fn().mockResolvedValue({
          error: 'API error',
        }),
      });

      const result = await handleVerdict(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('judge unit failed: API error');
    });

    test('handles aggregation with no results', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: {
            type: 'max-pool',
          },
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'test',
        outputString: 'test',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      const result = await handleVerdict(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('MaxPoolUnit requires at least one result');
    });
  });

  describe('Token Usage Tracking', () => {
    test('tracks token usage across pipeline', async () => {
      const params: AssertionParams = {
        assertion: {
          type: 'verdict',
          value: {
            pipeline: [
              {
                layer: {
                  units: [
                    {
                      type: 'categorical',
                      prompt: 'Test prompt',
                      categories: ['yes', 'no'],
                    },
                  ],
                  repeat: 2,
                },
              },
              {
                type: 'max-pool',
              },
            ],
          },
        },
        baseType: 'verdict',
        context: mockContext,
        inverse: false,
        output: 'test',
        outputString: 'test',
        providerResponse: mockProviderResponse,
        test: mockTest,
        latencyMs: 100,
      };

      // Mock provider for 2 categorical calls
      const { getAndCheckProvider } = require('../../src/matchers');
      getAndCheckProvider.mockResolvedValue({
        callApi: jest
          .fn()
          .mockResolvedValueOnce({
            output: 'yes',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          })
          .mockResolvedValueOnce({
            output: 'yes',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
      });

      const result = (await handleVerdict(params)) as any;
      expect(result.tokensUsed).toBeDefined();
      expect(result.tokensUsed?.total).toBe(20); // 2 calls with 10 tokens each
      expect(result.tokensUsed?.numRequests).toBe(2); // 2 categorical judgments
    });
  });
});
