import { getGradingProvider } from '../src/matchers';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from '../src/providers/openai';
import { matchesSimilarity, matchesLlmRubric } from '../src/matchers';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from '../src/providers/openai';

import { TestGrader } from './assertions.test';

import type { GradingConfig } from '../src/types';

const Grader = new TestGrader();

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

    const result = await matchesSimilarity(expected, output, threshold);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Similarity 1 is greater than threshold 0.5');
  });

  it('should fail when similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    const result = await matchesSimilarity(expected, output, threshold);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Similarity 0 is less than threshold 0.9');
  });

  it('should fail when inverted similarity is above the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const threshold = 0.5;

    const result = await matchesSimilarity(expected, output, threshold, true /* invert */);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Similarity 1 is greater than threshold 0.5');
  });

  it('should pass when inverted similarity is below the threshold', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const threshold = 0.9;

    const result = await matchesSimilarity(expected, output, threshold, true /* invert */);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Similarity 0 is less than threshold 0.9');
  });

  it('should use the overridden simmilarity grading config', async () => {
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

    const result = await matchesSimilarity(expected, output, threshold, false, grading);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Similarity 1 is greater than threshold 0.5');
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });
});

describe('matchesLlmRubric', () => {
  it('should pass when the grading provider returns a passing result', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: Grader,
    };

    const result = await matchesLlmRubric(expected, output, options);
    expect(result.pass).toBeTruthy();
  });

  it('should fail when the grading provider returns a failing result', async () => {
    const expected = 'Expected output';
    const output = 'Different output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: Grader,
    };

    jest.spyOn(Grader, 'callApi').mockResolvedValueOnce({
      output: JSON.stringify({ pass: false, reason: 'Grading failed' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesLlmRubric(expected, output, options);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Grading failed');
  });

  it('should use the overridden llm rubric grading config', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: 'openai:gpt-3.5-turbo',
        config: {
          apiKey: 'abc123',
          temperature: 3.1415926,
        },
      },
    };

    const mockCallApi = jest.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    mockCallApi.mockImplementation(function (this: OpenAiChatCompletionProvider) {
      expect(this.config.temperature).toBe(3.1415926);
      expect(this.getApiKey()).toBe('abc123');
      return Promise.resolve({
        output: JSON.stringify({ pass: true, reason: 'Grading passed' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const result = await matchesLlmRubric(expected, output, options);
    expect(result.reason).toBe('Grading passed');
    expect(result.pass).toBeTruthy();
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });
});

describe('matchesFactuality', () => {
  it('should pass when the factuality check passes', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: JSON.stringify({ pass: true, reason: 'Factuality check passed' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesFactuality(input, expected, output, grading);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Factuality check passed');
  });

  it('should fail when the factuality check fails', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: JSON.stringify({ pass: false, reason: 'Factuality check failed' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesFactuality(input, expected, output, grading);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Factuality check failed');
  });

  it('should throw an error when an error occurs', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(() => {
      throw new Error('An error occurred');
    });

    await expect(matchesFactuality(input, expected, output, grading)).rejects.toThrow('An error occurred');
  });
});

describe('getGradingProvider', () => {
  it('should return the correct provider when provider is a string', async () => {
    const provider = await getGradingProvider(
      'openai:chat:gpt-3.5-turbo-foobar',
      DefaultGradingProvider,
    );
    // ok for this not to match exactly when the string is parsed
    expect(provider.id()).toBe('openai:gpt-3.5-turbo-foobar');
  });

  it('should return the correct provider when provider is an ApiProvider', async () => {
    const provider = await getGradingProvider(DefaultEmbeddingProvider, DefaultGradingProvider);
    expect(provider).toBe(DefaultEmbeddingProvider);
  });

  it('should return the correct provider when provider is ProviderOptions', async () => {
    const providerOptions = {
      id: 'openai:chat:gpt-3.5-turbo-foobar',
      config: {
        apiKey: 'abc123',
        temperature: 3.1415926,
      },
    };
    const provider = await getGradingProvider(providerOptions, DefaultGradingProvider);
    expect(provider.id()).toBe('openai:chat:gpt-3.5-turbo-foobar');
  });

  it('should return the default provider when provider is not provided', async () => {
    const provider = await getGradingProvider(undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });
});
