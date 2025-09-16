import { matchesContextRelevance } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextRelevance (RAGAS Context Relevance)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should calculate relevance using semantic sentence splitting', async () => {
    const input = 'What is the capital of France?';
    const context = 'Paris is the capital of France. France is in Europe. The weather is nice today.';
    const threshold = 0.3;

    // Mock LLM extracting 1 relevant sentence
    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Paris is the capital of France',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    // Context has 3 semantic sentences, LLM extracts 1 → score = 1/3 ≈ 0.33
    expect(result.score).toBeCloseTo(0.33, 2);
    expect(result.pass).toBe(true); // 0.33 >= 0.3
    expect(result.reason).toContain('Context relevance');
    expect(result.metadata?.extractedSentences).toEqual(['Paris is the capital of France']);
    expect(result.metadata?.totalContextSentences).toBe(3);
    expect(result.metadata?.relevantSentenceCount).toBe(1);
    expect(result.metadata?.ragasMethod).toBe('context-relevance');
  });

  it('should handle insufficient information responses', async () => {
    const input = 'What is quantum computing?';
    const context = 'Paris is the capital of France. France is in Europe. The weather is nice today.';
    const threshold = 0.5;

    // Mock LLM returning insufficient information
    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Insufficient Information',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
    expect(result.metadata?.insufficientInformation).toBe(true);
    expect(result.metadata?.extractedSentences).toEqual([]);
    expect(result.metadata?.relevantSentenceCount).toBe(0);
  });

  it('should handle multiple extracted sentences', async () => {
    const input = 'Tell me about France and Germany';
    const context = 'Paris is the capital of France. Berlin is the capital of Germany. The weather is nice. France and Germany are in Europe.';
    const threshold = 0.5;

    // Mock LLM extracting 3 relevant sentences
    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Paris is the capital of France. Berlin is the capital of Germany. France and Germany are in Europe.',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    // Context has 4 semantic sentences, LLM extracts 3 → score = 3/4 = 0.75
    expect(result.score).toBe(0.75);
    expect(result.pass).toBe(true);
    expect(result.metadata?.totalContextSentences).toBe(4);
    expect(result.metadata?.relevantSentenceCount).toBe(3);
    expect(result.metadata?.extractedSentences).toHaveLength(3);
  });

  describe('BCG Policy Document Test (Original User Issue)', () => {
    it('should handle formatted documents much better than naive line splitting', async () => {
      const query = 'Who does the India Leave Policy apply to?';
      const bcgPolicyContext = `India Leave Policy & Guidelines

India System **May 2024**

Scope and Applicability
The revised leave policy is applicable from 1st May 2024. The scope of this policy covers
entitlement and guidelines for all categories of leaves in the India office. This policy will
include people transferred into India under all incoming structured programs, short-
term/permanent transfers

All permanent employees of BCG India i.e. Consulting Team, Business Services Team and includes all employees of BCG India who go out of India on Cross Office Staffing

This policy will include people transferred into India under all incoming structured programs, short term / permanent transfers

This policy excludes all staff going on any outgoing structured programs, short term/ permanent transfers, people going out of India under any of the other global mobility programs`;

      // Mock LLM extracting 3 relevant sentences (what user expected)
      const mockCallApi = jest.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'All permanent employees of BCG India i.e. Consulting Team, Business Services Team and includes all employees of BCG India who go out of India on Cross Office Staffing. This policy will include people transferred into India under all incoming structured programs, short term / permanent transfers. The scope of this policy covers entitlement and guidelines for all categories of leaves in the India office.',
          tokenUsage: { total: 15, prompt: 10, completion: 5 },
        });
      });

      jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, bcgPolicyContext, 0.7);

      // With semantic splitting, this actually gets 4 extracted / 4 total = 1.0 (much better than 0.05)
      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.metadata?.totalContextSentences).toBe(4); // Semantic sentences, not 7+ lines
      expect(result.metadata?.relevantSentenceCount).toBe(4);

      // This would achieve the user's goal of getting 0.7+ instead of 0.05
      expect(result.score).toBeGreaterThan(0.7);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context', async () => {
      const query = 'What is the answer?';
      const context = '';

      // Mock response for empty context
      const mockCallApi = jest.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'Insufficient Information',
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        });
      });

      jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, 0.5);

      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
      expect(result.metadata?.totalContextSentences).toBe(0);
      expect(result.metadata?.insufficientInformation).toBe(true);
    });

    it('should handle very short context', async () => {
      const query = 'What is the answer?';
      const context = 'The answer is 42.';

      const mockCallApi = jest.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'The answer is 42',
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        });
      });

      jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, 0.5);

      expect(result.score).toBe(1.0); // 1 extracted / 1 total = 1.0
      expect(result.pass).toBe(true);
    });

    it('should handle malformed sentences gracefully', async () => {
      const query = 'Test query';
      const context = 'Fragment without end Proper sentence. Another fragment';

      const mockCallApi = jest.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'Proper sentence',
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        });
      });

      jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, 0.5);

      // Should still work with semantic sentence splitting
      expect(result.score).toBeGreaterThan(0);
      expect(result.metadata?.totalContextSentences).toBeGreaterThan(0);
      expect(result.metadata?.relevantSentenceCount).toBe(1);
    });
  });
});