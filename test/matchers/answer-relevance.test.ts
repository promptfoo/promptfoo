import { matchesAnswerRelevance } from '../../src/matchers';
import { ANSWER_RELEVANCY_GENERATE } from '../../src/prompts';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
} from '../../src/providers/openai/defaults';

import type { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

describe('matchesAnswerRelevance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockReset();

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'foobar',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockResolvedValue({
      embedding: [1, 0, 0],
      tokenUsage: { total: 5, prompt: 2, completion: 3 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when the relevance score is above the threshold', async () => {
    const input = 'Input text';
    const output = 'Sample output';
    const threshold = 0.5;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi.mockImplementation(() => {
      return Promise.resolve({
        output: 'foobar',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const mockCallEmbeddingApi = jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi');
    mockCallEmbeddingApi.mockImplementation(function (this: OpenAiEmbeddingProvider) {
      return Promise.resolve({
        embedding: [1, 0, 0],
        tokenUsage: { total: 5, prompt: 2, completion: 3 },
      });
    });

    await expect(matchesAnswerRelevance(input, output, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Relevance 1.00 is greater than threshold 0.5',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith(
      expect.stringContaining(ANSWER_RELEVANCY_GENERATE.slice(0, 50)),
    );
    expect(mockCallEmbeddingApi).toHaveBeenCalledWith('Input text');
  });

  it('should fail when the relevance score is below the threshold', async () => {
    const input = 'Input text';
    const output = 'Different output';
    const threshold = 0.5;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi.mockImplementation((text) => {
      return Promise.resolve({
        output: text,
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const mockCallEmbeddingApi = jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi');
    mockCallEmbeddingApi.mockImplementation((text) => {
      if (text.includes('Input text')) {
        return Promise.resolve({
          embedding: [1, 0, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      } else if (text.includes('Different output')) {
        return Promise.resolve({
          embedding: [0, 1, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      }
      return Promise.reject(new Error(`Unexpected input ${text}`));
    });

    await expect(matchesAnswerRelevance(input, output, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Relevance 0.00 is less than threshold 0.5',
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
    expect(mockCallApi).toHaveBeenCalledWith(
      expect.stringContaining(ANSWER_RELEVANCY_GENERATE.slice(0, 50)),
    );
    expect(mockCallEmbeddingApi).toHaveBeenCalledWith(
      expect.stringContaining(ANSWER_RELEVANCY_GENERATE.slice(0, 50)),
    );
  });

  it('tracks token usage for successful calls', async () => {
    const input = 'Input text';
    const output = 'Sample output';
    const threshold = 0.5;

    const result = await matchesAnswerRelevance(input, output, threshold);

    expect(result.tokensUsed?.total).toBeGreaterThan(0);
    expect(result.tokensUsed?.prompt).toBeGreaterThan(0);
    expect(result.tokensUsed?.completion).toBeGreaterThan(0);
    expect(result.tokensUsed?.total).toBe(
      (result.tokensUsed?.prompt || 0) + (result.tokensUsed?.completion || 0),
    );

    expect(result.tokensUsed?.total).toBe(50);
    expect(result.tokensUsed?.cached).toBe(0);
    expect(result.tokensUsed?.completionDetails).toBeDefined();
  });
});
