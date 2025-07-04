import { matchesGEval } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesGEval', () => {
  let originalCallApi: typeof DefaultGradingProvider.callApi;

  beforeEach(() => {
    originalCallApi = DefaultGradingProvider.callApi;

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(async (prompt) => {
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

  it('should handle custom rubric prompts', async () => {
    jest.resetAllMocks();

    const mockCallApi = jest
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
    );
    expect(mockCallApi).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Custom evaluation template with'),
    );

    DefaultGradingProvider.callApi = originalCallApi;
  });

  it('should fail when score is below threshold', async () => {
    jest
      .spyOn(DefaultGradingProvider, 'callApi')
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
    });
  });
});
