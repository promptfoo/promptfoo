import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesGEval } from '../../src/matchers/llmGrading';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesGEval', () => {
  let originalCallApi: typeof DefaultGradingProvider.callApi;

  beforeEach(() => {
    originalCallApi = DefaultGradingProvider.callApi;

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(async (prompt) => {
      if (prompt.includes('generate 3-4 concise evaluation steps')) {
        return {
          output: '{"steps": ["Check clarity", "Evaluate coherence", "Assess grammar"]}',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        };
      } else {
        return {
          output: '{"score": 8, "reason": "The response is well-structured and clear"}',
          tokenUsage: { total: 15, prompt: 8, completion: 7 },
        };
      }
    });
  });

  afterEach(() => {
    DefaultGradingProvider.callApi = originalCallApi;
  });

  it('should properly evaluate with default prompts', async () => {
    const criteria = 'Evaluate coherence and clarity';
    const input = 'Test input';
    const output = 'Test output';
    const threshold = 0.7;

    const result = await matchesGEval(criteria, input, output, threshold);

    expect(result).toEqual({
      pass: true,
      score: 0.8,
      reason: 'The response is well-structured and clear',
      tokensUsed: expect.any(Object),
    });

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['positive', 'the answer should contain harmful or inappropriate content'],
    ['negated', 'the answer should not contain harmful or inappropriate content'],
  ])('should render observed-condition scoring for %s criteria', async (_, criteria) => {
    await matchesGEval(criteria, 'Test input', 'Test output', 0.7);

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledTimes(2);
    expect(DefaultGradingProvider.callApi).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(criteria),
      expect.any(Object),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(criteria),
      expect.any(Object),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'the condition described by the Evaluation Criteria is fully and clearly observed in the Reply',
      ),
      expect.any(Object),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('and 0 indicates that it is not observed at all'),
      expect.any(Object),
    );
  });

  it('should handle custom rubric prompts', async () => {
    vi.resetAllMocks();

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => ({
        output: '{"steps": ["Custom step 1", "Custom step 2"]}',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      }))
      .mockImplementationOnce(() => ({
        output: '{"score": 8, "reason": "Custom evaluation complete", "pass": true}',
        tokenUsage: { total: 15, prompt: 8, completion: 7 },
      }));

    DefaultGradingProvider.callApi = mockCallApi;

    const criteria = 'Evaluate coherence and clarity';
    const input = 'Test input';
    const output = 'Test output';
    const threshold = 0.7;

    const grading = {
      rubricPrompt: {
        steps: 'Custom steps template with {{criteria}}',
        evaluate: 'Custom evaluation template with {{criteria}} and {{steps}}',
      },
    } as any;

    const result = await matchesGEval(criteria, input, output, threshold, grading);

    expect(result.score).toBe(0.8);

    expect(mockCallApi).toHaveBeenCalledTimes(2);
    expect(mockCallApi).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Custom steps template with'),
      expect.any(Object),
    );
    expect(mockCallApi).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Custom evaluation template with'),
      expect.any(Object),
    );

    DefaultGradingProvider.callApi = originalCallApi;
  });

  it('should fail when score is below threshold', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => {
        return {
          output: '{"steps": ["Check clarity", "Evaluate coherence", "Assess grammar"]}',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        };
      })
      .mockImplementationOnce(async () => {
        return {
          output: '{"score": 3, "reason": "The response lacks coherence"}',
          tokenUsage: { total: 15, prompt: 8, completion: 7 },
        };
      });

    const criteria = 'Evaluate coherence and clarity';
    const input = 'Test input';
    const output = 'Test output';
    const threshold = 0.7;

    const result = await matchesGEval(criteria, input, output, threshold);

    expect(result).toEqual({
      pass: false,
      score: 0.3,
      reason: 'The response lacks coherence',
      tokensUsed: expect.any(Object),
    });
  });

  it('should return provider errors from the step-generation call', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      error: 'steps provider unavailable',
      tokenUsage: { total: 3, prompt: 1, completion: 2 },
    });

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'steps provider unavailable',
      tokensUsed: expect.objectContaining({
        total: 3,
        prompt: 1,
        completion: 2,
      }),
      metadata: { graderError: true },
    });
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should fail clearly when the evaluation steps shape is invalid', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: '{"steps":"Check clarity"}',
      tokenUsage: { total: 3, prompt: 1, completion: 2 },
    });

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'G-Eval steps response has invalid or missing steps: "Check clarity"',
      tokensUsed: expect.objectContaining({
        total: 3,
        prompt: 1,
        completion: 2,
      }),
      metadata: { graderError: true },
    });
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should return provider errors from the evaluation call', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        error: 'evaluation provider unavailable',
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'evaluation provider unavailable',
      tokensUsed: expect.objectContaining({
        total: 7,
        prompt: 3,
        completion: 4,
      }),
      metadata: { graderError: true },
    });
  });

  it('should fail clearly when the evaluation result is not a string', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output: { score: 8, reason: 'object output' },
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'LLM-proposed evaluation result response is not a string',
      tokensUsed: expect.objectContaining({
        total: 7,
      }),
      metadata: { graderError: true },
    });
  });

  it.each([
    ['null score', '{"score": null, "reason": "null score"}', 'null'],
    ['blank string score', '{"score": "", "reason": "blank score"}', '""'],
  ])('should fail clearly when the evaluation score is %s', async (_, output, scoreLabel) => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output,
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: `G-Eval result has invalid or missing score: ${scoreLabel}`,
      tokensUsed: expect.objectContaining({
        total: 7,
      }),
      metadata: { graderError: true },
    });
  });

  it('should fail clearly when the evaluation score is outside the expected range', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output: '{"score": 11, "reason": "too high"}',
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'G-Eval result score 11 is outside the expected 0-10 range',
      tokensUsed: expect.objectContaining({
        total: 7,
      }),
      metadata: { graderError: true },
    });
  });

  it('should fail clearly when the evaluation reason is missing', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output: '{"score": 8}',
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'G-Eval result has invalid or missing reason: undefined',
      tokensUsed: expect.objectContaining({
        total: 7,
      }),
      metadata: { graderError: true },
    });
  });

  it.each([
    ['null reason', '{"score": 8, "reason": null}', 'null'],
    ['numeric reason', '{"score": 8, "reason": 42}', '42'],
    ['empty string reason', '{"score": 8, "reason": ""}', '""'],
    ['whitespace-only reason', '{"score": 8, "reason": "   "}', '"   "'],
  ])('should fail clearly when the evaluation reason is %s', async (_, output, reasonLabel) => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output,
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: `G-Eval result has invalid or missing reason: ${reasonLabel}`,
      tokensUsed: expect.objectContaining({ total: 7, prompt: 3, completion: 4 }),
      metadata: { graderError: true },
    });
  });

  it('should fail clearly when the steps response contains non-string elements', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: '{"steps": ["ok", 42]}',
      tokenUsage: { total: 3, prompt: 1, completion: 2 },
    });

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'G-Eval steps response contains invalid steps: ["ok",42]',
      tokensUsed: expect.objectContaining({ total: 3, prompt: 1, completion: 2 }),
      metadata: { graderError: true },
    });
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should fail clearly when a steps entry is whitespace-only', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: '{"steps": ["ok", "   "]}',
      tokenUsage: { total: 3, prompt: 1, completion: 2 },
    });

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'G-Eval steps response contains invalid steps: ["ok","   "]',
      tokensUsed: expect.objectContaining({ total: 3, prompt: 1, completion: 2 }),
      metadata: { graderError: true },
    });
  });

  it('should fail clearly when the steps array is empty', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: '{"steps": []}',
      tokenUsage: { total: 3, prompt: 1, completion: 2 },
    });

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'LLM does not propose any evaluation step',
      tokensUsed: expect.objectContaining({ total: 3, prompt: 1, completion: 2 }),
      metadata: { graderError: true },
    });
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should accept numeric-string scores', async () => {
    // Positive path for the string coercion branch in rawScore parsing —
    // locks in that a valid numeric string still produces a real grade so a
    // future tightening doesn't silently reject all string scores.
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output: '{"score": "  7  ", "reason": "fine"}',
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result.pass).toBe(true);
    expect(result.score).toBeCloseTo(0.7, 5);
    expect(result.reason).toBe('fine');
    expect(result.metadata).toBeUndefined();
  });

  it.each([
    ['lower bound exactly (0)', '{"score": 0, "reason": "absent"}', 0],
    ['upper bound exactly (10)', '{"score": 10, "reason": "perfect"}', 1],
  ])('should accept score at the %s', async (_, output, expectedScore) => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output,
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result.score).toBeCloseTo(expectedScore, 5);
    expect(result.metadata).toBeUndefined();
  });

  it('should fail clearly when the evaluation score is negative', async () => {
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(async () => ({
        output: '{"steps": ["Check clarity"]}',
        tokenUsage: { total: 3, prompt: 1, completion: 2 },
      }))
      .mockImplementationOnce(async () => ({
        output: '{"score": -1, "reason": "too low"}',
        tokenUsage: { total: 4, prompt: 2, completion: 2 },
      }));

    const result = await matchesGEval('Evaluate coherence', 'Test input', 'Test output', 0.7);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'G-Eval result score -1 is outside the expected 0-10 range',
      tokensUsed: expect.objectContaining({ total: 7, prompt: 3, completion: 4 }),
      metadata: { graderError: true },
    });
  });

  it('tracks token usage for both API calls', async () => {
    const criteria = 'Evaluate coherence and clarity';
    const input = 'Test input';
    const output = 'Test output';
    const threshold = 0.7;

    const result = await matchesGEval(criteria, input, output, threshold);

    expect(result.tokensUsed).toEqual({
      total: 25,
      prompt: 13,
      completion: 12,
      cached: 0,
      completionDetails: expect.any(Object),
      numRequests: 0,
    });
  });
});
