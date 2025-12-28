import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesContextRecall } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'foo [Attributed]\nbar [Not attributed]\nbaz [Attributed]\n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when the recall score is above the threshold', async () => {
    const context = 'Context text';
    const groundTruth = 'Ground truth text';
    const threshold = 0.5;

    const mockCallApi = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'foo [Attributed]\nbar [Not attributed]\nbaz [Attributed]\n',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextRecall(context, groundTruth, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Recall 0.67 is >= 0.5',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
      metadata: {
        sentenceAttributions: expect.arrayContaining([
          expect.objectContaining({
            sentence: expect.any(String),
            attributed: expect.any(Boolean),
          }),
        ]),
        totalSentences: 3,
        attributedSentences: 2,
        score: expect.closeTo(0.67, 0.01),
      },
    });
  });

  it('should fail when the recall score is below the threshold', async () => {
    const context = 'Context text';
    const groundTruth = 'Ground truth text';
    const threshold = 0.9;

    const mockCallApi = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'foo [Attributed]\nbar [Not attributed]\nbaz [Attributed]',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextRecall(context, groundTruth, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Recall 0.67 is < 0.9',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
      metadata: {
        sentenceAttributions: expect.arrayContaining([
          expect.objectContaining({
            sentence: expect.any(String),
            attributed: expect.any(Boolean),
          }),
        ]),
        totalSentences: 3,
        attributedSentences: 2,
        score: expect.closeTo(0.67, 0.01),
      },
    });
  });

  it('should return detailed metadata with sentence attributions', async () => {
    const context = 'The capital of France is Paris. It has the Eiffel Tower.';
    const groundTruth =
      'Paris is the capital of France. The Eiffel Tower is located there. London is the capital of UK.';
    const threshold = 0.6;

    const mockCallApi = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        output:
          'Paris is the capital of France. [Attributed]\nThe Eiffel Tower is located there. [Attributed]\nLondon is the capital of UK. [Not attributed]',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRecall(context, groundTruth, threshold);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.sentenceAttributions).toHaveLength(3);
    expect(result.metadata?.sentenceAttributions[0]).toEqual({
      sentence: 'Paris is the capital of France',
      attributed: true,
    });
    expect(result.metadata?.sentenceAttributions[1]).toEqual({
      sentence: 'The Eiffel Tower is located there',
      attributed: true,
    });
    expect(result.metadata?.sentenceAttributions[2]).toEqual({
      sentence: 'London is the capital of UK',
      attributed: false,
    });
    expect(result.metadata?.totalSentences).toBe(3);
    expect(result.metadata?.attributedSentences).toBe(2);
    expect(result.metadata?.score).toBeCloseTo(0.67, 2);
    expect(result.pass).toBe(true);
  });

  describe('Preamble Filtering (Issue #1506)', () => {
    it('should ignore preamble text and only count classification lines', async () => {
      const context = 'The service owner must sign the DR plan.';
      const groundTruth = 'The signature from the service owner on the DR plan is requested.';
      const threshold = 0.9;

      // Simulate LLM output with preamble text before the classification
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            'Let me analyze each sentence in the answer.\n\n' +
            '1. The signature from the service owner on the DR plan is requested. The context clearly states this requirement. [Attributed]',
          tokenUsage: { total: 20, prompt: 10, completion: 10 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRecall(context, groundTruth, threshold);

      // Should be 1.0 (1/1 attributed) not 0.5 (1/2) due to preamble being ignored
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.metadata?.totalSentences).toBe(1);
      expect(result.metadata?.attributedSentences).toBe(1);
    });

    it('should handle multi-line preamble with explanation text', async () => {
      const context = 'Albert Einstein was born in Germany.';
      const groundTruth = 'Einstein was German. He won the Nobel Prize.';
      const threshold = 0.4;

      // Simulate verbose LLM output with multiple preamble lines
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            "I'll analyze each sentence to determine if it can be attributed to the context.\n" +
            '\n' +
            'Here is my analysis:\n' +
            '\n' +
            '1. Einstein was German. This can be inferred from the context. [Attributed]\n' +
            '2. He won the Nobel Prize. There is no mention of this in the context. [Not Attributed]',
          tokenUsage: { total: 30, prompt: 15, completion: 15 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRecall(context, groundTruth, threshold);

      // Should be 0.5 (1/2) not lower due to preamble lines being counted
      expect(result.score).toBe(0.5);
      expect(result.metadata?.totalSentences).toBe(2);
      expect(result.metadata?.attributedSentences).toBe(1);
      expect(result.pass).toBe(true);
    });

    it('should handle case-insensitive attribution markers', async () => {
      const context = 'Test context';
      const groundTruth = 'Test ground truth';
      const threshold = 0.5;

      // Test various case combinations
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            '1. First sentence [ATTRIBUTED]\n' +
            '2. Second sentence [not attributed]\n' +
            '3. Third sentence [Attributed]',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRecall(context, groundTruth, threshold);

      // All 3 lines should be recognized as classification lines
      expect(result.metadata?.totalSentences).toBe(3);
      // Case-insensitive matching: [ATTRIBUTED] and [Attributed] both count as attributed
      // Line 1: [ATTRIBUTED] - counted as attributed
      // Line 2: [not attributed] - NOT counted as attributed (contains "not")
      // Line 3: [Attributed] - counted as attributed
      expect(result.metadata?.attributedSentences).toBe(2);
    });

    it('should return score 0 when LLM returns no classification lines', async () => {
      const context = 'Test context';
      const groundTruth = 'Test ground truth';
      const threshold = 0.5;

      // LLM returns only explanation without any classification markers
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            'I cannot determine if the statements are attributed to the context.\n' +
            'The context does not provide enough information.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRecall(context, groundTruth, threshold);

      expect(result.score).toBe(0);
      expect(result.metadata?.totalSentences).toBe(0);
      expect(result.pass).toBe(false);
    });
  });

  describe('Array Context Support', () => {
    it('should handle array of context chunks', async () => {
      const contextChunks = [
        'Paris is the capital of France and has many landmarks.',
        'The Eiffel Tower is a famous iron lattice tower in Paris.',
        'France is located in Western Europe.',
      ];
      const groundTruth = 'Paris is the capital of France. The Eiffel Tower is located there.';
      const threshold = 0.5;

      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            'Paris is the capital of France [Attributed]\nThe Eiffel Tower is located there [Attributed]',
          tokenUsage: { total: 15, prompt: 8, completion: 7 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRecall(contextChunks, groundTruth, threshold);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1.0); // 2/2 sentences attributed
      expect(result.reason).toContain('Recall 1.00 is >= 0.5');

      // Verify that context chunks were joined and included in the LLM prompt
      const callArgs = mockCallApi.mock.calls[0];
      const prompt = callArgs[0];
      expect(prompt).toContain(contextChunks.join('\n\n'));
    });

    it('should handle single string context (backward compatibility)', async () => {
      const context = 'Paris is the capital of France. The Eiffel Tower is located there.';
      const groundTruth = 'Paris is the capital of France. The Eiffel Tower is located there.';
      const threshold = 0.8;

      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            'Paris is the capital of France [Attributed]\nThe Eiffel Tower is located there [Attributed]',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRecall(context, groundTruth, threshold);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1.0);

      // Should work exactly like before with string context
      const callArgs = mockCallApi.mock.calls[0];
      const prompt = callArgs[0];
      expect(prompt).toContain(context);
    });
  });
});
