import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesClassification } from '../../src/matchers/classification';
import { HuggingfaceTextClassificationProvider } from '../../src/providers/huggingface';
import { withProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import { createMockProvider } from '../factories/provider';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type {
  ApiProvider,
  GradingConfig,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../../src/types/index';

describe('matchesClassification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  class TestGrader implements ApiProvider {
    async callApi(): Promise<ProviderResponse> {
      throw new Error('Not implemented');
    }

    async callClassificationApi(): Promise<ProviderClassificationResponse> {
      return {
        classification: {
          classA: 0.6,
          classB: 0.5,
        },
      };
    }

    id(): string {
      return 'TestClassificationProvider';
    }
  }

  it('should pass when the classification score is above the threshold', async () => {
    const expected = 'classA';
    const output = 'Sample output';
    const threshold = 0.5;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: true,
      reason: `Classification ${expected} has score 0.60 >= ${threshold}`,
      score: 0.6,
    });
  });

  it.each([
    { threshold: 0.5, pass: true, comparison: '>=' },
    { threshold: 0.75, pass: false, comparison: '<' },
  ])(
    'preserves token usage for a fractional verdict with pass=$pass',
    async ({ threshold, pass, comparison }) => {
      const response: ProviderClassificationResponse = {
        classification: { classA: 0.625 },
        tokenUsage: {
          prompt: 12,
          completion: 4,
          numRequests: 1,
          completionDetails: { reasoning: 2 },
          incurredTokenUsage: { total: 16, prompt: 12, completion: 4, numRequests: 1 },
        },
      };
      const provider = Object.assign(createMockProvider(), {
        callClassificationApi: vi.fn().mockResolvedValue(response),
      });

      await expect(
        matchesClassification('classA', 'Sample output', threshold, { provider }),
      ).resolves.toEqual({
        pass,
        score: 0.625,
        reason: `Classification classA has score 0.63 ${comparison} ${threshold}`,
        tokensUsed: {
          total: 16,
          prompt: 12,
          completion: 4,
          cached: 0,
          numRequests: 1,
          completionDetails: { reasoning: 2 },
          incurredTokenUsage: { total: 16, prompt: 12, completion: 4, numRequests: 1 },
        },
      });
    },
  );

  it('preserves cached tokens without recording a new classification request', async () => {
    const response: ProviderClassificationResponse = {
      classification: { classA: 0.625 },
      tokenUsage: { prompt: 12, completion: 4, cached: 16, numRequests: 0 },
    };
    const provider = Object.assign(createMockProvider(), {
      callClassificationApi: vi.fn().mockResolvedValue(response),
    });

    await expect(
      matchesClassification(undefined, 'Sample output', 0.5, { provider }),
    ).resolves.toEqual({
      pass: true,
      score: 0.625,
      reason: 'Maximum classification score 0.63 >= 0.5',
      tokensUsed: {
        total: 0,
        prompt: 12,
        completion: 4,
        cached: 16,
        numRequests: 0,
        completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
      },
    });
  });

  it.each([
    { response: { error: 'Request timed out' }, reason: 'Request timed out' },
    { response: {}, reason: 'Unknown error fetching classification' },
    { response: { classification: {} }, reason: 'No classification scores returned' },
  ])('retains reported usage when grading fails: $reason', async ({ response, reason }) => {
    const classificationResponse: ProviderClassificationResponse = {
      ...response,
      tokenUsage: { total: 16, prompt: 12, completion: 4, numRequests: 1 },
    };
    const provider = Object.assign(createMockProvider(), {
      callClassificationApi: vi.fn().mockResolvedValue(classificationResponse),
    });

    await expect(
      matchesClassification('classA', 'Sample output', 0.5, { provider }),
    ).resolves.toEqual({
      pass: false,
      score: 0,
      reason,
      tokensUsed: {
        total: 16,
        prompt: 12,
        completion: 4,
        cached: 0,
        numRequests: 1,
        completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
      },
      metadata: { graderError: true },
    });
  });

  it('preserves the result shape for providers with undefined token usage', async () => {
    const response: ProviderClassificationResponse = {
      classification: { classA: 0.625 },
      tokenUsage: undefined,
    };
    const provider = Object.assign(createMockProvider(), {
      callClassificationApi: vi.fn().mockResolvedValue(response),
    });

    await expect(
      matchesClassification('classA', 'Sample output', 0.5, { provider }),
    ).resolves.toEqual({
      pass: true,
      score: 0.625,
      reason: 'Classification classA has score 0.63 >= 0.5',
    });
  });

  it('records classification providers beneath the grading trace', async () => {
    const provider = new TestGrader();
    const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
      async ({ callContext }, invoke) => invoke(callContext),
    );

    await withProviderCallTracingContext(
      {
        getActiveTraceparent: () => undefined,
        withGraderSpan: async (_options, invoke) => invoke(),
        withProviderSpan: providerSpan,
      },
      () => matchesClassification('classA', 'sample output', 0.5, { provider }),
    );

    expect(providerSpan).toHaveBeenCalledWith(
      expect.objectContaining({ provider, role: 'grader', promptLabel: 'classification' }),
      expect.any(Function),
    );
  });

  it('should fail when the classification score is below the threshold', async () => {
    const expected = 'classA';
    const output = 'Different output';
    const threshold = 0.9;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: false,
      reason: `Classification ${expected} has score 0.60 < ${threshold}`,
      score: 0.6,
    });
  });

  it('should pass when the maximum classification score is above the threshold with undefined expected', async () => {
    const expected = undefined;
    const output = 'Sample output';
    const threshold = 0.55;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: true,
      reason: `Maximum classification score 0.60 >= ${threshold}`,
      score: 0.6,
    });
  });

  it('should fail with a maximum-score reason when expected is undefined', async () => {
    const output = 'Sample output';
    const threshold = 0.9;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    await expect(matchesClassification(undefined, output, threshold, grading)).resolves.toEqual({
      pass: false,
      reason: `Maximum classification score 0.60 < ${threshold}`,
      score: 0.6,
    });
  });

  it.each([undefined, 'harmful'])(
    'tags an empty classification as a grader failure with expected %s',
    async (expected) => {
      const grading: GradingConfig = {
        provider: Object.assign(createMockProvider({ id: 'empty-classification-provider' }), {
          callClassificationApi: vi.fn().mockResolvedValue({ classification: {} }),
        }),
      };

      await expect(matchesClassification(expected, 'Sample output', 0.5, grading)).resolves.toEqual(
        {
          pass: false,
          reason: 'No classification scores returned',
          score: 0,
          metadata: { graderError: true },
          tokensUsed: {
            cached: 0,
            completion: 0,
            completionDetails: {
              acceptedPrediction: 0,
              reasoning: 0,
              rejectedPrediction: 0,
            },
            numRequests: 0,
            prompt: 0,
            total: 0,
          },
        },
      );
    },
  );

  it('treats an absent label in a nonempty classification as a valid negative verdict', async () => {
    await expect(
      matchesClassification('harmful', 'Sample output', 0.5, { provider: new TestGrader() }),
    ).resolves.toEqual({
      pass: false,
      score: 0,
      reason: 'Classification harmful has score 0.00 < 0.5',
    });
  });

  it('tags a provider error as a grader failure instead of a legitimate score', async () => {
    const grading: GradingConfig = {
      provider: Object.assign(createMockProvider({ id: 'broken-classification-provider' }), {
        callClassificationApi: vi.fn().mockResolvedValue({ error: 'Request timed out' }),
      }),
    };

    await expect(matchesClassification('classA', 'Sample output', 0.5, grading)).resolves.toEqual({
      pass: false,
      score: 0,
      reason: 'Request timed out',
      tokensUsed: expect.any(Object),
      metadata: { graderError: true },
    });
  });

  it('should use the overridden classification grading config', async () => {
    const expected = 'classA';
    const output = 'Sample output';
    const threshold = 0.5;

    const grading: GradingConfig = {
      provider: {
        id: 'hf:text-classification:foobar',
      },
    };

    const mockCallApi = vi.spyOn(
      HuggingfaceTextClassificationProvider.prototype,
      'callClassificationApi',
    );
    mockCallApi.mockImplementation(function (this: HuggingfaceTextClassificationProvider) {
      return Promise.resolve({
        classification: { [expected]: 0.6 },
      });
    });

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: true,
      reason: `Classification ${expected} has score 0.60 >= ${threshold}`,
      score: 0.6,
    });
    expect(mockCallApi).toHaveBeenCalledWith('Sample output');

    mockCallApi.mockRestore();
  });
});
