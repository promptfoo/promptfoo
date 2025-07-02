import { matchesAnswerRelevance } from '../../src/matchers';
import { ANSWER_RELEVANCY_GENERATE } from '../../src/prompts';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
} from '../../src/providers/openai/defaults';
import type { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

jest.mock('../../src/database', () => ({
  getDb: jest.fn().mockImplementation(() => {
    throw new TypeError('The "original" argument must be of type function. Received undefined');
  }),
}));
jest.mock('../../src/esm');
jest.mock('../../src/cliState');
jest.mock('../../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(true),
}));
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('better-sqlite3');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

describe('matchesAnswerRelevance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Reset DefaultGradingProvider and DefaultEmbeddingProvider mocks to prevent contamination
    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockReset();

    // Set up robust default mocks that work for most tests
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

    // Verify token usage is properly accumulated from all API calls
    expect(result.tokensUsed?.total).toBeGreaterThan(0);
    expect(result.tokensUsed?.prompt).toBeGreaterThan(0);
    expect(result.tokensUsed?.completion).toBeGreaterThan(0);
    expect(result.tokensUsed?.total).toBe(
      (result.tokensUsed?.prompt || 0) + (result.tokensUsed?.completion || 0),
    );

    // Should accumulate from multiple calls: 3 text generations + 1 input embedding + 3 candidate embeddings = 7 calls
    // With mocked values: 3*10 + 1*5 + 3*5 = 50 total tokens
    expect(result.tokensUsed?.total).toBe(50);
    expect(result.tokensUsed?.cached).toBe(0);
    expect(result.tokensUsed?.completionDetails).toBeDefined();
  });
});
