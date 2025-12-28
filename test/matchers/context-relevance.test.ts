import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesContextRelevance } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextRelevance (RAGAS Context Relevance)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate relevance using line-based sentence splitting', async () => {
    const input = 'What is the capital of France?';
    const context =
      'Paris is the capital of France.\nFrance is in Europe.\nThe weather is nice today.';
    const threshold = 0.3;

    // Mock LLM extracting 1 relevant sentence
    const mockCallApi = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Paris is the capital of France',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    // Context has 3 lines, LLM extracts 1 → score = 1/3 ≈ 0.33
    expect(result.score).toBeCloseTo(0.33, 2);
    expect(result.pass).toBe(true); // 0.33 >= 0.3
    expect(result.reason).toContain('Context relevance');
    expect(result.metadata?.extractedSentences).toEqual(['Paris is the capital of France']);
    expect(result.metadata?.totalContextUnits).toBe(3);
    expect(result.metadata?.relevantSentenceCount).toBe(1);
  });

  it('should handle insufficient information responses', async () => {
    const input = 'What is quantum computing?';
    const context =
      'Paris is the capital of France. France is in Europe. The weather is nice today.';
    const threshold = 0.5;

    // Mock LLM returning insufficient information
    const mockCallApi = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Insufficient Information',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
    expect(result.metadata?.insufficientInformation).toBe(true);
    expect(result.metadata?.extractedSentences).toEqual([]);
    expect(result.metadata?.relevantSentenceCount).toBe(0);
  });

  it('should handle multiple extracted sentences', async () => {
    const input = 'Tell me about France and Germany';
    const context =
      'Paris is the capital of France.\nBerlin is the capital of Germany.\nThe weather is nice.\nFrance and Germany are in Europe.';
    const threshold = 0.5;

    // Mock LLM extracting 3 relevant sentences (with newlines)
    const mockCallApi = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        output:
          'Paris is the capital of France.\nBerlin is the capital of Germany.\nFrance and Germany are in Europe.',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    // Context has 4 lines, LLM extracts 3 → score = 3/4 = 0.75
    expect(result.score).toBe(0.75);
    expect(result.pass).toBe(true);
    expect(result.metadata?.totalContextUnits).toBe(4);
    expect(result.metadata?.relevantSentenceCount).toBe(3);
    expect(result.metadata?.extractedSentences).toHaveLength(3);
  });

  describe('Formatted Document Test', () => {
    it('should handle formatted documents better than naive line splitting', async () => {
      const query = 'Who does the leave policy apply to?';
      const formattedPolicyContext = `Company Leave Policy & Guidelines

HR System **May 2024**

Scope and Applicability
The revised leave policy is applicable from 1st May 2024. The scope of this policy covers
entitlement and guidelines for all categories of leaves in the office. This policy will
include people transferred into the office under all incoming structured programs, short-
term/permanent transfers

All permanent employees i.e. Engineering Team, Business Services Team and includes all employees who go out of office on Cross Office Staffing

This policy will include people transferred into the office under all incoming structured programs, short term / permanent transfers

This policy excludes all staff going on any outgoing structured programs, short term/ permanent transfers, people going out of office under any of the other global mobility programs`;

      // Mock LLM extracting multiple relevant lines (formatted with line breaks)
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            'All permanent employees i.e. Engineering Team, Business Services Team\nThis policy will include people transferred into the office under all incoming structured programs\nThe scope of this policy covers entitlement and guidelines for all categories of leaves in the office',
          tokenUsage: { total: 15, prompt: 10, completion: 5 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, formattedPolicyContext, 0.1);

      // Formatted policy context has many lines, demonstrates improvement from chunk-based approach
      expect(result.score).toBeGreaterThan(0.05); // Much better than original 0.05
      expect(result.pass).toBe(true);
      expect(result.metadata?.totalContextUnits).toBeGreaterThan(5); // Many lines in policy
      expect(result.metadata?.relevantSentenceCount).toBe(3);

      // Still better than original 0.05, but chunk-based approach is even better
    });
  });

  describe('Chunk-Based Context (New Feature)', () => {
    it('should handle array of context chunks', async () => {
      const query = 'What are the benefits of RAG systems?';
      const contextChunks = [
        'RAG systems improve factual accuracy by incorporating external knowledge sources.',
        'They reduce hallucinations in large language models through grounded responses.',
        'RAG enables up-to-date information retrieval beyond training data cutoffs.',
        'The weather forecast shows rain this weekend.', // Irrelevant chunk
      ];
      const threshold = 0.5;

      // Mock LLM extracting 3 relevant chunks out of 4 total (with line breaks)
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output:
            'RAG systems improve factual accuracy by incorporating external knowledge sources.\nThey reduce hallucinations in large language models through grounded responses.\nRAG enables up-to-date information retrieval beyond training data cutoffs.',
          tokenUsage: { total: 20, prompt: 10, completion: 10 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, contextChunks, threshold);

      // With 4 chunks total and 3 relevant = 3/4 = 0.75
      expect(result.score).toBe(0.75);
      expect(result.pass).toBe(true);
      expect(result.metadata?.totalContextUnits).toBe(4);
      expect(result.metadata?.contextUnits).toEqual(contextChunks);
      expect(result.metadata?.relevantSentenceCount).toBe(3);
    });

    it('should handle single string context (backward compatibility)', async () => {
      const query = 'What is the capital of France?';
      const context =
        'Paris is the capital of France.\nFrance is in Europe.\nThe weather is nice today.';
      const threshold = 0.3;

      // Mock LLM extracting 1 relevant sentence
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'Paris is the capital of France',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, threshold);

      // Should work exactly like before with line-based splitting
      expect(result.score).toBeCloseTo(0.33, 2);
      expect(result.pass).toBe(true);
      expect(result.metadata?.totalContextUnits).toBe(3); // 3 lines
      expect(result.metadata?.relevantSentenceCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context', async () => {
      const query = 'What is the answer?';
      const context = '';

      // Mock response for empty context
      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'Insufficient Information',
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, 0.5);

      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
      expect(result.metadata?.totalContextSentences).toBe(0);
      expect(result.metadata?.insufficientInformation).toBe(true);
    });

    it('should handle very short context', async () => {
      const query = 'What is the answer?';
      const context = 'The answer is 42.';

      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'The answer is 42',
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, 0.5);

      expect(result.score).toBe(1.0); // 1 extracted / 1 total = 1.0
      expect(result.pass).toBe(true);
    });

    it('should handle malformed sentences gracefully', async () => {
      const query = 'Test query';
      const context = 'Fragment without end Proper sentence. Another fragment';

      const mockCallApi = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          output: 'Proper sentence',
          tokenUsage: { total: 5, prompt: 3, completion: 2 },
        });
      });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextRelevance(query, context, 0.5);

      // Should still work with semantic sentence splitting
      expect(result.score).toBeGreaterThan(0);
      expect(result.metadata?.totalContextSentences).toBeGreaterThan(0);
      expect(result.metadata?.relevantSentenceCount).toBe(1);
    });
  });
});
