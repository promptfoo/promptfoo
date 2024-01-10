import { getAndCheckProvider, getGradingProvider, matchesClassification } from '../src/matchers';
import { OpenAiChatCompletionProvider, OpenAiEmbeddingProvider } from '../src/providers/openai';
import {
  matchesSimilarity,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesAnswerRelevance,
  matchesContextRelevance,
  matchesContextRecall,
  matchesContextFaithfulness,
} from '../src/matchers';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from '../src/providers/openai';

import { TestGrader } from './assertions.test';

import type {
  GradingConfig,
  ProviderResponse,
  ProviderClassificationResponse,
  ApiProvider,
  ProviderOptions,
  ProviderTypeMap,
} from '../src/types';
import { HuggingfaceTextClassificationProvider } from '../src/providers/huggingface';

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
      output:
        '(A) The submitted answer is a subset of the expert answer and is fully consistent with it.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesFactuality(input, expected, output, grading);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe(
      'The submitted answer is a subset of the expert answer and is fully consistent with it.',
    );
  });

  it('should fail when the factuality check fails', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};
    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: '(D) There is a disagreement between the submitted answer and the expert answer.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesFactuality(input, expected, output, grading);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(
      'There is a disagreement between the submitted answer and the expert answer.',
    );
  });

  it('should use the overridden factuality grading config', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {
      factuality: {
        subset: 0.8,
        superset: 0.9,
        agree: 1,
        disagree: 0,
        differButFactual: 0.7,
      },
    };

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output:
        '(A) The submitted answer is a subset of the expert answer and is fully consistent with it.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesFactuality(input, expected, output, grading);
    expect(result.score).toBe(0.8);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe(
      'The submitted answer is a subset of the expert answer and is fully consistent with it.',
    );
  });

  it('should throw an error when an error occurs', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(() => {
      throw new Error('An error occurred');
    });

    await expect(matchesFactuality(input, expected, output, grading)).rejects.toThrow(
      'An error occurred',
    );
  });
});

describe('matchesClosedQa', () => {
  it('should pass when the closed QA check passes', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: 'foo \n \n bar\n Y Y',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesClosedQa(input, expected, output, grading);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('The submission meets the criterion');
  });

  it('should fail when the closed QA check fails', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: 'foo bar N',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const result = await matchesClosedQa(input, expected, output, grading);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('The submission does not meet the criterion:\nfoo bar N');
  });

  it('should throw an error when an error occurs', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(() => {
      throw new Error('An error occurred');
    });

    await expect(matchesClosedQa(input, expected, output, grading)).rejects.toThrow(
      'An error occurred',
    );
  });

  it('should handle input, criteria, and completion that need escaping', async () => {
    const input = 'Input "text" with \\ escape characters and \\"nested\\" escapes';
    const expected = 'Expected "output" with \\\\ escape characters and \\"nested\\" escapes';
    const output = 'Sample "output" with \\\\ escape characters and \\"nested\\" escapes';
    const grading = {};

    let isJson = false;
    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation((prompt) => {
      try {
        JSON.parse(prompt);
        isJson = true;
      } catch (err) {
        isJson = false;
      }
      return Promise.resolve({
        output: 'foo \n \n bar\n Y Y',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const result = await matchesClosedQa(input, expected, output, grading);
    expect(isJson).toBeTruthy();
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('The submission meets the criterion');
  });
});

describe('getGradingProvider', () => {
  it('should return the correct provider when provider is a string', async () => {
    const provider = await getGradingProvider(
      'text',
      'openai:chat:gpt-3.5-turbo-foobar',
      DefaultGradingProvider,
    );
    // ok for this not to match exactly when the string is parsed
    expect(provider?.id()).toBe('openai:gpt-3.5-turbo-foobar');
  });

  it('should return the correct provider when provider is an ApiProvider', async () => {
    const provider = await getGradingProvider(
      'embedding',
      DefaultEmbeddingProvider,
      DefaultGradingProvider,
    );
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
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:gpt-3.5-turbo-foobar');
  });

  it('should return the default provider when provider is not provided', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });
});

describe('getAndCheckProvider', () => {
  it('should return the default provider when provider is not defined', async () => {
    expect(await getAndCheckProvider('text', undefined, DefaultGradingProvider, 'test check')).toBe(
      DefaultGradingProvider,
    );
  });

  it('should return the default provider when provider does not support type', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
    };
    expect(
      await getAndCheckProvider('embedding', provider, DefaultEmbeddingProvider, 'test check'),
    ).toBe(DefaultEmbeddingProvider);
  });

  it('should return the provider if it implements the required method', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
      callEmbeddingApi: () => Promise.resolve({ embedding: [] }),
    };
    const result = await getAndCheckProvider(
      'embedding',
      provider,
      DefaultEmbeddingProvider,
      'test check',
    );
    expect(result).toBe(provider);
  });
});

describe('getGradingProvider', () => {
  it('should return the default provider when no provider is specified', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });

  it('should return a specific provider when a provider id is specified', async () => {
    const provider = await getGradingProvider('text', 'openai:chat:foo', DefaultGradingProvider);
    // loadApiProvider removes `chat` from the id
    expect(provider?.id()).toBe('openai:foo');
  });

  it('should return a provider from ApiProvider when specified', async () => {
    const providerOptions: ApiProvider = {
      id: () => 'custom-provider',
      callApi: async () => ({}),
    };
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('custom-provider');
  });

  it('should return a provider from ProviderTypeMap when specified', async () => {
    const providerTypeMap: ProviderTypeMap = {
      text: {
        id: 'openai:chat:foo',
      },
      embedding: {
        id: 'openai:embedding:bar',
      },
    };
    const provider = await getGradingProvider('text', providerTypeMap, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:foo');
  });

  it('should return a provider from ProviderTypeMap with basic strings', async () => {
    const providerTypeMap: ProviderTypeMap= {
      text: 'openai:chat:foo',
      embedding: 'openai:embedding:bar',
    };
    const provider = await getGradingProvider('text', providerTypeMap, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:foo');
  });

  it('should throw an error when the provider does not match the type', async () => {
    const providerTypeMap: ProviderTypeMap = {
      embedding: {
        id: 'openai:embedding:foo',
      },
    };
    await expect(
      getGradingProvider('text', providerTypeMap, DefaultGradingProvider),
    ).rejects.toThrow(
      new Error(
        `Invalid provider definition for output type 'text': ${JSON.stringify(providerTypeMap, null, 2)}`,
      ),
    );
  });
});

describe('matchesAnswerRelevance', () => {
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

    const result = await matchesAnswerRelevance(input, output, threshold);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Relevance 1.00 is greater than threshold 0.5');
    expect(mockCallApi).toHaveBeenCalled();
    expect(mockCallEmbeddingApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
    mockCallEmbeddingApi.mockRestore();
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
      return Promise.reject(new Error('Unexpected input ' + text));
    });

    const result = await matchesAnswerRelevance(input, output, threshold);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Relevance 0.00 is less than threshold 0.5');
    expect(mockCallApi).toHaveBeenCalled();
    expect(mockCallEmbeddingApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
    mockCallEmbeddingApi.mockRestore();
  });
});

describe('matchesClassification', () => {
  class TestGrader implements ApiProvider {
    async callApi(): Promise<ProviderResponse> {
      throw new Error('Not implemented');
    }

    async callClassificationApi(): Promise<ProviderClassificationResponse> {
      return {
        classification: {
          classA: 0.6,
          classB: 0.5,
        },
      };
    }

    id(): string {
      return 'TestClassificationProvider';
    }
  }

  it('should pass when the classification score is above the threshold', async () => {
    const expected = 'classA';
    const output = 'Sample output';
    const threshold = 0.5;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    const result = await matchesClassification(expected, output, threshold, grading);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe(`Classification ${expected} has score 0.6 >= ${threshold}`);
  });

  it('should fail when the classification score is below the threshold', async () => {
    const expected = 'classA';
    const output = 'Different output';
    const threshold = 0.9;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    const result = await matchesClassification(expected, output, threshold, grading);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe(`Classification ${expected} has score 0.6 < ${threshold}`);
  });

  it('should use the overridden classification grading config', async () => {
    const expected = 'classA';
    const output = 'Sample output';
    const threshold = 0.5;

    const grading: GradingConfig = {
      provider: {
        id: 'hf:text-classification:foobar',
      },
    };

    const mockCallApi = jest.spyOn(
      HuggingfaceTextClassificationProvider.prototype,
      'callClassificationApi',
    );
    mockCallApi.mockImplementation(function (this: HuggingfaceTextClassificationProvider) {
      return Promise.resolve({
        classification: { [expected]: 0.6 },
      });
    });

    const result = await matchesClassification(expected, output, threshold, grading);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe(`Classification ${expected} has score 0.6 >= ${threshold}`);
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });
});

describe('matchesContextRelevance', () => {
  it('should pass when the relevance score is above the threshold', async () => {
    const input = 'Input text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi.mockImplementation(() => {
      return Promise.resolve({
        output: 'foo\nbar\nbaz Insufficient Information',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const result = await matchesContextRelevance(input, context, threshold);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Relevance 0.67 is >= 0.5');
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });

  it('should fail when the relevance score is below the threshold', async () => {
    const input = 'Input text';
    const context = 'Context text';
    const threshold = 0.9;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi.mockImplementation(() => {
      return Promise.resolve({
        output: 'foo\nbar\nbaz Insufficient Information',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const result = await matchesContextRelevance(input, context, threshold);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Relevance 0.67 is < 0.9');
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });
});

describe('matchesContextFaithfulness', () => {
  it('should pass when the faithfulness score is above the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. No. Yes.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const result = await matchesContextFaithfulness(query, output, context, threshold);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Faithfulness 0.67 is >= 0.5');
    expect(mockCallApi).toHaveBeenCalledTimes(2);

    mockCallApi.mockRestore();
  });

  it('should fail when the faithfulness score is below the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.7;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi
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

    const result = await matchesContextFaithfulness(query, output, context, threshold);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Faithfulness 0.67 is < 0.7');
    expect(mockCallApi).toHaveBeenCalledTimes(2);

    mockCallApi.mockRestore();
  });
});

describe('matchesContextRecall', () => {
  it('should pass when the recall score is above the threshold', async () => {
    const context = 'Context text';
    const groundTruth = 'Ground truth text';
    const threshold = 0.5;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi.mockImplementation(() => {
      return Promise.resolve({
        output: 'foo [Attributed]\nbar [Not attributed]\nbaz [Attributed]',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const result = await matchesContextRecall(context, groundTruth, threshold);
    expect(result.pass).toBeTruthy();
    expect(result.reason).toBe('Recall 0.67 is >= 0.5');
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });

  it('should fail when the recall score is below the threshold', async () => {
    const context = 'Context text';
    const groundTruth = 'Ground truth text';
    const threshold = 0.9;

    const mockCallApi = jest.spyOn(DefaultGradingProvider, 'callApi');
    mockCallApi.mockImplementation(() => {
      return Promise.resolve({
        output: 'foo [Attributed]\nbar [Not attributed]\nbaz [Attributed]',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });

    const result = await matchesContextRecall(context, groundTruth, threshold);
    expect(result.pass).toBeFalsy();
    expect(result.reason).toBe('Recall 0.67 is < 0.9');
    expect(mockCallApi).toHaveBeenCalled();

    mockCallApi.mockRestore();
  });
});
