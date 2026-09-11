import { describe, expect, it, vi } from 'vitest';
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

  it('should fail cleanly when expected is undefined and no scores are returned', async () => {
    const grading: GradingConfig = {
      provider: Object.assign(createMockProvider({ id: 'empty-classification-provider' }), {
        callClassificationApi: vi.fn().mockResolvedValue({ classification: {} }),
      }),
    };

    await expect(matchesClassification(undefined, 'Sample output', 0.5, grading)).resolves.toEqual({
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
    });
  });

  it('tags a transport error as a grader failure, never invertible into a pass', async () => {
    const grading: GradingConfig = {
      provider: Object.assign(createMockProvider({ id: 'broken-classification-provider' }), {
        callClassificationApi: vi.fn().mockResolvedValue({ error: 'Simulated timeout' }),
      }),
    };

    const result = await matchesClassification('harmful', 'Sample output', 0.5, grading);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('Simulated timeout');
    expect(result.metadata?.graderError).toBe(true);
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
