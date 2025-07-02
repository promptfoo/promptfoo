import { matchesContextFaithfulness } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextFaithfulness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest
      .spyOn(DefaultGradingProvider, 'callApi')
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
    jest.restoreAllMocks();
  });

  it('should pass when the faithfulness score is above the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = jest
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

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

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
      },
    });
  });

  it('should fail when the faithfulness score is below the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.7;

    const mockCallApi = jest
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

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

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
    });
  });
});
