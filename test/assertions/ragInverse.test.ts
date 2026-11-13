import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { createMockProvider } from '../factories/provider';

import type { ProviderResponse } from '../../src/types/index';

const tokenUsage = { total: 1, prompt: 1, completion: 0 };

async function grade(
  inverse: boolean,
  vector: number[],
  response: ProviderResponse = { output: 'Generated question' },
) {
  const provider = createMockProvider({
    response: { ...response, tokenUsage },
    callEmbeddingApi: async (text) => ({
      embedding: text === 'Original question' ? [1, 0] : vector,
      tokenUsage,
    }),
  });
  return runAssertion({
    assertion: { type: inverse ? 'not-answer-relevance' : 'answer-relevance' },
    prompt: 'Original question',
    providerResponse: { output: 'Unrelated answer' },
    test: { options: { provider } },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('answer relevance inverse scoring', () => {
  it.each([
    { vector: [-1, 0], positiveScore: -1, inverseScore: 1, positivePass: false },
    { vector: [0, 1], positiveScore: 0, inverseScore: 1, positivePass: false },
    { vector: [1, 0], positiveScore: 1, inverseScore: 0, positivePass: true },
    { vector: [3, 4], positiveScore: 0.6, inverseScore: 0.4, positivePass: true },
  ])(
    'bounds the inverted score for cosine similarity $positiveScore',
    async ({ vector, positiveScore, inverseScore, positivePass }) => {
      const positive = await grade(false, vector);
      const inverse = await grade(true, vector);

      expect(positive).toMatchObject({ pass: positivePass, score: positiveScore });
      expect(inverse).toEqual({
        ...positive,
        assertion: { type: 'not-answer-relevance' },
        pass: !positivePass,
        score: inverseScore,
      });
      expect(inverse.tokensUsed).toMatchObject({ total: 7, prompt: 7, completion: 0 });
      expect(inverse.metadata).toMatchObject({ averageSimilarity: positiveScore, threshold: 0.5 });
      expect(inverse.metadata?.generatedQuestions).toHaveLength(3);
    },
  );

  it('does not invert a grader error into a pass', async () => {
    expect(await grade(true, [-1, 0], { error: 'Grader unavailable' })).toMatchObject({
      pass: false,
      score: 0,
      reason: 'Grader unavailable',
      metadata: { graderError: true },
      tokensUsed: tokenUsage,
    });
  });
});
