import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { matchesContextFaithfulness } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextFaithfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3\n',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. No. Yes.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when the faithfulness score is above the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3\n',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. No. Yes.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Faithfulness 0.67 is >= 0.5',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('should fail when the faithfulness score is below the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.7;

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. Yes. No.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.67 is < 0.7',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('tracks token usage for multiple API calls', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const result = await matchesContextFaithfulness(query, output, context, threshold);

    expect(result.tokensUsed).toEqual({
      total: 20,
      prompt: 10,
      completion: 10,
      cached: 0,
      completionDetails: expect.any(Object),
      numRequests: 0,
    });
  });

  describe('Array Context Support', () => {
    it('should handle array of context chunks', async () => {
      const query = 'What is the capital of France?';
      const output = 'Paris is the capital of France.';
      const contextChunks = [
        'Paris is the capital and largest city of France.',
        'France is located in Western Europe.',
        'The country has a rich cultural heritage.',
      ];
      const threshold = 0.5;

      const result = await matchesContextFaithfulness(query, output, contextChunks, threshold);

      // Should successfully process array context without errors
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(typeof result.pass).toBe('boolean');
      expect(result.reason).toBeDefined();
    });

    it('should handle single string context (backward compatibility)', async () => {
      const query = 'What is the capital of France?';
      const output = 'Paris is the capital of France.';
      const context = 'Paris is the capital and largest city of France.';
      const threshold = 0.5;

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Should successfully process string context without errors
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(typeof result.pass).toBe('boolean');
      expect(result.reason).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle response with no verdicts (apology message)', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2\nStatement 3\n',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output:
              'I apologize, but I cannot create statements or provide an analysis based on the given context.',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Should not return a perfect score of 1.0 when there are no verdicts
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Unable to determine faithfulness');
    });

    it('should handle response with no valid verdict format', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2\n',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'This is some random text without any verdict format.',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Should handle gracefully
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Unable to determine faithfulness');
    });

    it('should handle response with "verdict: no" format correctly', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2\nStatement 3\n',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Verdict: No\nVerdict: Yes\nVerdict: No',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Should calculate score based on "verdict: no" count
      // 2 "no" verdicts out of 3 statements = 2/3 unfaithful, so 1/3 = 0.33 faithful
      expect(result.score).toBeCloseTo(0.33, 1);
      expect(typeof result.pass).toBe('boolean');
    });

    it('should clamp score to [0, 1] when more verdicts than statements', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2', // 2 statements
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            // 4 "no" verdicts - more than statements
            output: 'Verdict: No\nVerdict: No\nVerdict: No\nVerdict: No',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Score should be clamped to 0, not negative
      // Without clamping: 1 - (4/2) = 1 - 2 = -1.0
      // With clamping: 0
      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should handle verdict format without space (verdict:no)', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Verdict:No\nVerdict:Yes', // No space after colon
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // 1 "no" out of 2 statements = 0.5 unfaithful = 0.5 faithful
      expect(result.score).toBeCloseTo(0.5, 1);
    });

    it('should handle inline verdicts with explanations from prompt example', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2\nStatement 3',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            // Format matching the prompt example with explanations
            output: `1. Statement 1.
Explanation: This can be inferred from the context. Verdict: Yes.
2. Statement 2.
Explanation: This cannot be inferred. Verdict: No.
3. Statement 3.
Explanation: This is supported. Verdict: Yes.`,
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // 1 "no" out of 3 statements = 1/3 unfaithful = 2/3 faithful ≈ 0.67
      expect(result.score).toBeCloseTo(0.67, 1);
      expect(result.pass).toBe(true);
    });

    it('should handle all yes verdicts returning perfect score', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2\nStatement 3',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Verdict: Yes\nVerdict: Yes\nVerdict: Yes',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // All yes = 0 "no" = 0 unfaithful = 1.0 faithful
      expect(result.score).toBe(1);
      expect(result.pass).toBe(true);
    });

    it('should reject ambiguous verdicts that are not yes or no', async () => {
      const query = 'Query text';
      const output = 'Output text';
      const context = 'Context text';
      const threshold = 0.5;

      vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() => {
          return Promise.resolve({
            output: 'Statement 1\nStatement 2\nStatement 3',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            // All ambiguous verdicts - should fail since regex only matches yes/no
            output: 'Verdict: Maybe\nVerdict: Unclear\nVerdict: Possibly',
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          });
        });

      vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Should fail since no valid yes/no verdicts found
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Unable to determine faithfulness');
    });
  });
});
