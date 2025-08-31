import { matchesContextRelevance } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextRelevance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'foo\nbar\nbaz Insufficient Information\n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when the relevance score is above the threshold', async () => {
    const input = 'What is the capital of France?';
    const context =
      'Paris is the capital of France. France is in Europe. The weather is nice today.';
    const threshold = 0.3;

    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Paris is the capital of France\n',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextRelevance(input, context, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Relevance 1.00 is >= 0.3',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
      metadata: {
        extractedSentences: ['Paris is the capital of France'],
        totalContextSentences: 1,
        relevantSentenceCount: 1,
        insufficientInformation: false,
        score: 1,
      },
    });
  });

  it('should fail when the relevance score is below the threshold', async () => {
    const input = 'What is quantum computing?';
    const context =
      'Paris is the capital of France. France is in Europe. The weather is nice today.';
    const threshold = 0.5;

    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output: 'Insufficient Information',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesContextRelevance(input, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Relevance 0.00 is < 0.5',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
      metadata: {
        extractedSentences: [],
        totalContextSentences: 1,
        relevantSentenceCount: 0,
        insufficientInformation: true,
        score: 0,
      },
    });
  });

  it('should return detailed metadata with extracted sentences', async () => {
    const input = 'Tell me about France and Germany';
    const context =
      'Paris is the capital of France\nBerlin is the capital of Germany\nThe weather is nice\nFrance and Germany are in Europe';
    const threshold = 0.4;

    const mockCallApi = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        output:
          'Paris is the capital of France\nBerlin is the capital of Germany\nFrance and Germany are in Europe',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesContextRelevance(input, context, threshold);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.extractedSentences).toHaveLength(3);
    expect(result.metadata?.extractedSentences).toContain('Paris is the capital of France');
    expect(result.metadata?.extractedSentences).toContain('Berlin is the capital of Germany');
    expect(result.metadata?.extractedSentences).toContain('France and Germany are in Europe');
    expect(result.metadata?.totalContextSentences).toBe(4);
    expect(result.metadata?.relevantSentenceCount).toBe(3);
    expect(result.metadata?.insufficientInformation).toBe(false);
    expect(result.metadata?.score).toBeCloseTo(0.75, 2);
    expect(result.score).toBeCloseTo(0.75, 2);
    expect(result.pass).toBe(true);
  });
});
