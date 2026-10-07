import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssertionsResult } from '../../src/assertions/assertionsResult';
import { withCacheEnabled } from '../../src/cache';
import { matchesClassification } from '../../src/matchers/classification';
import { HuggingfaceTextClassificationProvider } from '../../src/providers/huggingface';
import { OpenAiDecisionsProvider } from '../../src/providers/openai/decisions';
import { withProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import { fetchWithRetries } from '../../src/util/fetch/index';
import { accumulateGradingTokenUsage, createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { createMockProvider } from '../factories/provider';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type {
  ApiProvider,
  GradingConfig,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../../src/types/index';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

describe('matchesClassification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
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

  it.each(
    [
      { response: { error: 'Request timed out' }, reason: 'Request timed out' },
      { response: {}, reason: 'Unknown error fetching classification' },
      { response: { classification: {} }, reason: 'No classification scores returned' },
    ].flatMap((testCase) => [false, true].map((cached) => ({ ...testCase, cached }))),
  )(
    'retains reported usage when grading fails: $reason (cached=$cached)',
    async ({ response, reason, cached }) => {
      const classificationResponse: ProviderClassificationResponse = {
        ...response,
        cached,
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
        metadata: { graderError: true, ...(cached && { cachedResponse: true }) },
      });
    },
  );

  it.each([
    { verdict: 'passing', threshold: 0.5, refusal: false, pass: true },
    { verdict: 'failing', threshold: 0.9, refusal: false, pass: false },
    { verdict: 'refusal', threshold: 0.5, refusal: true, pass: false },
  ])(
    'accounts for real cached Decisions classifications with a $verdict verdict',
    async ({ verdict, threshold, refusal, pass }) => {
      vi.mocked(fetchWithRetries).mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'classification-fixture',
            answers: [
              refusal
                ? { name: 'classification', type: 'refusal' }
                : {
                    name: 'classification',
                    type: 'choice',
                    choice: 'safe',
                    confidence: 0.625,
                    probabilities: [
                      { value: 'safe', probability: 0.625 },
                      { value: 'unsafe', probability: 0.375 },
                    ],
                  },
            ],
            usage: { input_tokens: 9, output_tokens: 1, total_tokens: 10 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const provider = new OpenAiDecisionsProvider('classification-fixture', {
        config: {
          apiKey: 'fixture-key',
          instructions: 'Classify the output.',
          labels: ['safe', 'unsafe'],
        },
      });

      await withCacheEnabled(true, async () => {
        const output = `Classification accounting fixture: ${verdict}`;
        const fresh = await matchesClassification('safe', output, threshold, { provider });
        const cached = await matchesClassification('safe', output, threshold, { provider });
        expect(fetchWithRetries).toHaveBeenCalledTimes(1);

        const assertionsResult = new AssertionsResult();
        assertionsResult.addResult({ index: 0, result: fresh });
        assertionsResult.addResult({ index: 1, result: cached });
        const result = await assertionsResult.testResult();
        const accounting = createEmptyTokenUsage();
        accumulateGradingTokenUsage(accounting, result.tokensUsed, {
          cached: result.metadata?.cachedResponse,
        });

        expect(accounting).toMatchObject({
          assertions: { total: 20, cached: 10, numRequests: 2 },
          incurredTokenUsage: { assertions: { total: 10, numRequests: 1 } },
        });
        expect(result.metadata?.cachedResponse).toBeUndefined();
        expect(cached).toMatchObject({
          pass,
          score: refusal ? 0 : 0.625,
          metadata: { cachedResponse: true, ...(refusal && { graderError: true }) },
        });
        expect(fresh.metadata?.cachedResponse).toBeUndefined();
        if (refusal) {
          expect(fresh.metadata?.graderError).toBe(true);
          expect(cached.reason).toContain('refused to classify');
        }
      });
    },
  );

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
