import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesContextFaithfulness } from '../../src/matchers/rag';
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

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

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

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

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

  it('should fail when no verdict markers are returned', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

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
          output:
            'I apologize, but I cannot create statements or provide an analysis based on the given context.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.00 is < 0.5',
      score: 0,
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

  it('should clamp score when verdict count exceeds statement count', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

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
          output: 'verdict: no\nverdict: no\nverdict: no\nverdict: no\nverdict: no',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.00 is < 0.5',
      score: 0,
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

  describe('verdict format robustness', () => {
    // The grader's few-shot teaches a period-delimited final line
    // ("...in order: No. No. Yes."), but models commonly deviate — enumerating
    // the list, separating with commas, or adding prose. The score must stay
    // correct (supported statements / total) across these variations.
    const mockTwoCalls = (statements: string, verdicts: string) => {
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            output: statements,
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            output: verdicts,
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          }),
        );
      const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
      callApiSpy.mockReset();
      callApiSpy.mockImplementation(mockCallApi);
    };

    it('scores an enumerated final verdict list correctly (all statements supported => 1.0)', async () => {
      // Final verdicts as "1. Yes." … "5. Yes." — every statement is supported, so
      // the score must be 1.0. The old split('.')-and-substring parser turned each
      // "N." enumeration number into a non-"yes" segment and scored a perfect
      // answer 0.0.
      mockTwoCalls(
        'Statement 1\nStatement 2\nStatement 3\nStatement 4\nStatement 5',
        'Final verdict for each statement in order:\n1. Yes.\n2. Yes.\n3. Yes.\n4. Yes.\n5. Yes.',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBeCloseTo(1, 5);
      expect(result.pass).toBe(true);
    });

    it('scores a comma-separated final verdict list correctly (Yes, No, Yes => 0.67)', async () => {
      // Commas instead of periods previously collapsed the whole line into one
      // segment that contained "yes", scoring 1.0 and hiding the "No".
      mockTwoCalls(
        'Statement 1\nStatement 2\nStatement 3',
        'Final verdict for each statement in order: Yes, No, Yes',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBeCloseTo(2 / 3, 5);
      expect(result.pass).toBe(true);
    });

    it('does not count the word "yes" inside a "No" verdict explanation (both No => 0.0)', async () => {
      // A "No" verdict whose text contains the substring "yes" must not be counted
      // as supported. Both statements are unsupported, so the score must be 0.0;
      // the old parser scored 0.5 because the "yes" substring matched.
      mockTwoCalls(
        'Statement 1\nStatement 2',
        'Final verdict for each statement in order: No, the context never mentions yes. No.',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBeCloseTo(0, 5);
      expect(result.pass).toBe(false);
    });

    it('scores the taught period-delimited format correctly (regression guard)', async () => {
      // The canonical few-shot format ("...in order: Yes. No. Yes.") must keep
      // scoring correctly through the token parser: 2 of 3 supported => 0.67.
      mockTwoCalls(
        'Statement 1\nStatement 2\nStatement 3',
        'Final verdict for each statement in order: Yes. No. Yes.',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBeCloseTo(2 / 3, 5);
      expect(result.pass).toBe(true);
    });

    it('clamps to 0 when more "no" verdicts are emitted than statements', async () => {
      // Three "no" tokens against two statements yields a raw score of 1 - 3/2 =
      // -0.5; it must clamp to 0 (and fail), exercising the [0, 1] clamp on the
      // token-parsing path (the existing clamp test only covers the else branch).
      mockTwoCalls(
        'Statement 1\nStatement 2',
        'Final verdict for each statement in order: No. No. No.',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
    });

    it('ignores yes/no substrings inside larger words via word boundaries', async () => {
      // Only the standalone "Yes" is a verdict; "yesterday" and "cannot" must not
      // match, so the single statement is supported => 1.0.
      mockTwoCalls(
        'Statement 1',
        'Final verdict for each statement in order: Yes. Yesterday the report cannot be verified.',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBeCloseTo(1, 5);
      expect(result.pass).toBe(true);
    });

    it('KNOWN LIMITATION: a standalone "no" in a "Yes" verdict explanation is over-counted', async () => {
      // Verdicts are counted globally (not per statement), so a standalone "no"
      // word inside a supported statement's explanation is counted as unsupported:
      // "Yes. There is no doubt." -> tokens [yes, no] -> 1 - 1/1 = 0. This is an
      // accepted tradeoff of the conservative "count no" heuristic — graders are
      // instructed to emit a bare yes/no per statement. Documented here so a future
      // change that improves it has to flip this assertion intentionally.
      mockTwoCalls(
        'Statement 1',
        'Final verdict for each statement in order: Yes. There is no doubt.',
      );

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', 0.5);
      expect(result.score).toBe(0);
    });
  });
});
