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

  it('should keep reserved faithfulness vars ahead of user vars', async () => {
    const mockCallApi = vi
      .fn()
      .mockResolvedValueOnce({
        output: 'Statement from answer.',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      })
      .mockResolvedValueOnce({
        output: 'Final verdict for each statement in order: Yes.',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await matchesContextFaithfulness(
      'question from assertion',
      'answer from provider',
      'context from contextTransform',
      0,
      {
        rubricPrompt: [
          'question={{ question }}\nanswer={{ answer }}\nextra={{ extra }}',
          'context={{ context }}\nstatements={{ statements }}\nextra={{ extra }}',
        ],
      },
      {
        question: 'vars question sentinel',
        answer: 'vars answer sentinel',
        context: 'vars context sentinel',
        statements: 'vars statements sentinel',
        extra: 'kept user var',
      },
    );

    const [longformPrompt, longformCallApiContext] = mockCallApi.mock.calls[0];
    const [nliPrompt, nliCallApiContext] = mockCallApi.mock.calls[1];

    expect(longformPrompt).toContain('question=question from assertion');
    expect(longformPrompt).toContain('answer=answer from provider');
    expect(longformPrompt).toContain('extra=kept user var');
    expect(longformPrompt).not.toContain('vars question sentinel');
    expect(longformPrompt).not.toContain('vars answer sentinel');
    expect(longformCallApiContext.vars).toMatchObject({
      question: 'question from assertion',
      answer: 'answer from provider',
      extra: 'kept user var',
    });

    expect(nliPrompt).toContain('context=context from contextTransform');
    expect(nliPrompt).toContain('statements=Statement from answer.');
    expect(nliPrompt).toContain('extra=kept user var');
    expect(nliPrompt).not.toContain('vars context sentinel');
    expect(nliPrompt).not.toContain('vars statements sentinel');
    expect(nliCallApiContext.vars).toMatchObject({
      context: 'context from contextTransform',
      statements: ['Statement from answer.'],
      extra: 'kept user var',
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

  it('should count missing final-answer verdicts as unsupported', async () => {
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
          output: 'Final verdict for each statement in order: Yes.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.33 is < 0.5',
      score: expect.closeTo(0.33, 0.01),
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

  it('should count missing line-by-line verdicts as unsupported', async () => {
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
          output: 'Statement 1\nverdict: yes',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.33 is < 0.5',
      score: expect.closeTo(0.33, 0.01),
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
});
