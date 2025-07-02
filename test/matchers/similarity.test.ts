import { matchesSimilarity } from '../../src/matchers';
import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { DefaultEmbeddingProvider } from '../../src/providers/openai/defaults';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import type { GradingConfig } from '../../src/types';

describe('matchesSimilarity', () => {
  beforeEach(() => {
    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockImplementation((text) => {
      if (text === 'Expected output' || text === 'Sample output') {
        return Promise.resolve({
          embedding: [1, 0, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      } else if (text === 'Different output') {
        return Promise.resolve({
          embedding: [0, 1, 0],
          tokenUsage: { total: 5, prompt: 2, completion: 3 },
        });
      }
      return Promise.reject(new Error('Unexpected input'));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    await expect(matchesSimilarity(expected, output, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });

  it('should fail when similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    await expect(matchesSimilarity(expected, output, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Similarity 0.00 is less than threshold 0.9',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });

  it('should fail when inverted similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    await expect(
      matchesSimilarity(expected, output, threshold, true /* invert */),
    ).resolves.toEqual({
      pass: false,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });

  it('should pass when inverted similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    await expect(
      matchesSimilarity(expected, output, threshold, true /* invert */),
    ).resolves.toEqual({
      pass: true,
      reason: 'Similarity 0.00 is less than threshold 0.9',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
  });

  it('should use the overridden similarity grading config', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;
    const grading: GradingConfig = {
      provider: {
        id: 'openai:embedding:text-embedding-ada-9999999',
        config: {
          apiKey: 'abc123',
          temperature: 3.1415926,
        },
      },
    };

    const mockCallApi = jest.spyOn(OpenAiEmbeddingProvider.prototype, 'callEmbeddingApi');
    mockCallApi.mockImplementation(function (this: OpenAiChatCompletionProvider) {
      expect(this.config.temperature).toBe(3.1415926);
      expect(this.getApiKey()).toBe('abc123');
      return Promise.resolve({
        embedding: [1, 0, 0],
        tokenUsage: { total: 5, prompt: 2, completion: 3 },
      });
    });

    await expect(matchesSimilarity(expected, output, threshold, false, grading)).resolves.toEqual({
      pass: true,
      reason: 'Similarity 1.00 is greater than threshold 0.5',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith('Expected output');

    mockCallApi.mockRestore();
  });

  it('should throw an error when API call fails', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;
    const grading: GradingConfig = {
      provider: {
        id: 'openai:embedding:text-embedding-ada-9999999',
        config: {
          apiKey: 'abc123',
          temperature: 3.1415926,
        },
      },
    };

    jest
      .spyOn(OpenAiEmbeddingProvider.prototype, 'callEmbeddingApi')
      .mockRejectedValueOnce(new Error('API call failed'));

    await expect(async () => {
      await matchesSimilarity(expected, output, threshold, false, grading);
    }).rejects.toThrow('API call failed');
  });

  it('should use Nunjucks templating when PROMPTFOO_DISABLE_TEMPLATING is set', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const expected = 'Expected {{ var }}';
    const output = 'Output {{ var }}';
    const threshold = 0.8;
    const grading: GradingConfig = {
      provider: DefaultEmbeddingProvider,
    };

    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockResolvedValue({
      embedding: [1, 2, 3],
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesSimilarity(expected, output, threshold, false, grading);

    expect(DefaultEmbeddingProvider.callEmbeddingApi).toHaveBeenCalledWith('Expected {{ var }}');
    expect(DefaultEmbeddingProvider.callEmbeddingApi).toHaveBeenCalledWith('Output {{ var }}');

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });
});
