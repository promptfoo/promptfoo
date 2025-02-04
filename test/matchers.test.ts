import fs from 'fs';
import path from 'path';
import { loadFromJavaScriptFile } from '../src/assertions/utils';
import cliState from '../src/cliState';
import { importModule } from '../src/esm';
import {
  getAndCheckProvider,
  getGradingProvider,
  matchesClassification,
  matchesModeration,
} from '../src/matchers';
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
import { ANSWER_RELEVANCY_GENERATE, CONTEXT_RECALL, CONTEXT_RELEVANCE } from '../src/prompts';
import { HuggingfaceTextClassificationProvider } from '../src/providers/huggingface';
import { OpenAiChatCompletionProvider } from '../src/providers/openai/chat';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from '../src/providers/openai/defaults';
import { OpenAiEmbeddingProvider } from '../src/providers/openai/embedding';
import { OpenAiModerationProvider } from '../src/providers/openai/moderation';
import { ReplicateModerationProvider } from '../src/providers/replicate';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../src/redteam/constants';
import * as remoteGrading from '../src/remoteGrading';
import type {
  GradingConfig,
  ProviderResponse,
  ProviderClassificationResponse,
  ApiProvider,
  ProviderTypeMap,
} from '../src/types';
import { TestGrader } from './util/utils';

jest.mock('../src/database', () => ({
  getDb: jest.fn().mockImplementation(() => {
    throw new TypeError('The "original" argument must be of type function. Received undefined');
  }),
}));
jest.mock('../src/esm');
jest.mock('../src/cliState');
jest.mock('../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../src/redteam/remoteGeneration', () => ({
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
jest.mock('../src/esm', () => ({
  importModule: jest.fn(),
}));

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

describe('matchesLlmRubric', () => {
  const mockFilePath = path.join('path', 'to', 'external', 'rubric.txt');
  const mockFileContent = 'This is an external rubric prompt';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
  });

  it('should pass when the grading provider returns a passing result', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: Grader,
    };

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      pass: true,
      reason: 'Test grading output',
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

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      pass: false,
      reason: 'Grading failed',
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

  it('should use the overridden llm rubric grading config', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: 'openai:gpt-4o-mini',
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

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      reason: 'Grading passed',
      pass: true,
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith('Grading prompt');

    mockCallApi.mockRestore();
  });

  it('should load rubric prompt from external file when specified', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: `file://${mockFilePath}`,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    const result = await matchesLlmRubric(rubric, llmOutput, grading);

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('path', 'to', 'external', 'rubric.txt')),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('path', 'to', 'external', 'rubric.txt')),
      'utf8',
    );
    expect(grading.provider.callApi).toHaveBeenCalledWith(expect.stringContaining(mockFileContent));
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Test passed',
      tokensUsed: {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
        completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
      },
    });
  });

  it('should load rubric prompt from js file when specified', async () => {
    const filePath = path.join('path', 'to', 'external', 'file.js');
    const mockImportModule = jest.mocked(importModule);
    const mockFunction = jest.fn(() => 'Do this: {{ rubric }}');
    mockImportModule.mockResolvedValue(mockFunction);

    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: `file://${filePath}`,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
        }),
      },
    };

    const result = await matchesLlmRubric(rubric, llmOutput, grading);

    await expect(loadFromJavaScriptFile(filePath, undefined, [])).resolves.toBe(
      'Do this: {{ rubric }}',
    );

    expect(grading.provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Do this: Test rubric'),
    );
    expect(mockImportModule).toHaveBeenCalledWith(filePath, undefined);

    expect(result).toEqual(
      expect.objectContaining({ pass: true, score: 1, reason: 'Test passed' }),
    );
  });

  it('should throw an error when the external file is not found', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: `file://${mockFilePath}`,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    await expect(matchesLlmRubric(rubric, llmOutput, grading)).rejects.toThrow(
      'File does not exist',
    );

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('path', 'to', 'external', 'rubric.txt')),
    );
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(grading.provider.callApi).not.toHaveBeenCalled();
  });

  it('should not call remote when rubric prompt is overridden, even if redteam is enabled', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      rubricPrompt: 'Custom prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    // Give it a redteam config
    cliState.config = { redteam: {} };

    await matchesLlmRubric(rubric, llmOutput, grading);

    const { doRemoteGrading } = remoteGrading;
    expect(doRemoteGrading).not.toHaveBeenCalled();

    expect(grading.provider.callApi).toHaveBeenCalledWith(expect.stringContaining('Custom prompt'));
  });

  it('should call remote when redteam is enabled and rubric prompt is not overridden', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading = {
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    // Give it a redteam config
    cliState.config = { redteam: {} };

    await matchesLlmRubric(rubric, llmOutput, grading);

    const { doRemoteGrading } = remoteGrading;
    expect(doRemoteGrading).toHaveBeenCalledWith({
      task: 'llm-rubric',
      rubric,
      output: llmOutput,
      vars: {},
    });

    expect(grading.provider.callApi).not.toHaveBeenCalled();
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

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason:
        'The submitted answer is a subset of the expert answer and is fully consistent with it.',
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

  it('should fail when the factuality check fails', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};
    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: '(D) There is a disagreement between the submitted answer and the expert answer.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: false,
      reason: 'There is a disagreement between the submitted answer and the expert answer.',
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

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason:
        'The submitted answer is a subset of the expert answer and is fully consistent with it.',
      score: 0.8,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
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

  it('should use Nunjucks templating when PROMPTFOO_DISABLE_TEMPLATING is set', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const input = 'Input {{ var }}';
    const expected = 'Expected {{ var }}';
    const output = 'Output {{ var }}';
    const grading: GradingConfig = {
      provider: DefaultGradingProvider,
    };

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: '(A) The submitted answer is correct.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesFactuality(input, expected, output, grading);

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Input {{ var }}'),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Expected {{ var }}'),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Output {{ var }}'),
    );

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });
});

describe('matchesClosedQa', () => {
  it('should pass when the closed QA check passes', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: 'foo \n \n bar\n Y Y \n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await expect(matchesClosedQa(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason: 'The submission meets the criterion',
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

  it('should fail when the closed QA check fails', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: 'foo bar N \n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await expect(matchesClosedQa(input, expected, output, grading)).resolves.toEqual({
      pass: false,
      reason: 'The submission does not meet the criterion:\nfoo bar N \n',
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
      } catch {
        isJson = false;
      }
      return Promise.resolve({
        output: 'foo \n \n bar\n Y Y',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });
    await expect(matchesClosedQa(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason: 'The submission meets the criterion',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(isJson).toBeTruthy();
  });

  it('should use Nunjucks templating when PROMPTFOO_DISABLE_TEMPLATING is set', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const input = 'Input {{ var }}';
    const expected = 'Expected {{ var }}';
    const output = 'Output {{ var }}';
    const grading: GradingConfig = {
      provider: DefaultGradingProvider,
    };

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'Y',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesClosedQa(input, expected, output, grading);

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Input {{ var }}'),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Expected {{ var }}'),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Output {{ var }}'),
    );

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });
});

describe('getGradingProvider', () => {
  it('should return the correct provider when provider is a string', async () => {
    const provider = await getGradingProvider(
      'text',
      'openai:chat:gpt-4o-mini-foobar',
      DefaultGradingProvider,
    );
    // ok for this not to match exactly when the string is parsed
    expect(provider?.id()).toBe('openai:gpt-4o-mini-foobar');
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
      id: 'openai:chat:gpt-4o-mini-foobar',
      config: {
        apiKey: 'abc123',
        temperature: 3.1415926,
      },
    };
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:gpt-4o-mini-foobar');
  });

  it('should return the default provider when provider is not provided', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });
});

describe('getAndCheckProvider', () => {
  it('should return the default provider when provider is not defined', async () => {
    await expect(
      getAndCheckProvider('text', undefined, DefaultGradingProvider, 'test check'),
    ).resolves.toBe(DefaultGradingProvider);
  });

  it('should return the default provider when provider does not support type', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
    };
    await expect(
      getAndCheckProvider('embedding', provider, DefaultEmbeddingProvider, 'test check'),
    ).resolves.toBe(DefaultEmbeddingProvider);
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
    const providerTypeMap: ProviderTypeMap = {
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
        `Invalid provider definition for output type 'text': ${JSON.stringify(
          providerTypeMap,
          null,
          2,
        )}`,
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

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: true,
      reason: `Classification ${expected} has score 0.60 >= ${threshold}`,
      score: 0.6,
    });
  });

  it('should fail when the classification score is below the threshold', async () => {
    const expected = 'classA';
    const output = 'Different output';
    const threshold = 0.9;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: false,
      reason: `Classification ${expected} has score 0.60 < ${threshold}`,
      score: 0.6,
    });
  });

  it('should pass when the maximum classification score is above the threshold with undefined expected', async () => {
    const expected = undefined;
    const output = 'Sample output';
    const threshold = 0.55;

    const grader = new TestGrader();
    const grading: GradingConfig = {
      provider: grader,
    };

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: true,
      reason: `Maximum classification score 0.60 >= ${threshold}`,
      score: 0.6,
    });
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

    await expect(matchesClassification(expected, output, threshold, grading)).resolves.toEqual({
      pass: true,
      reason: `Classification ${expected} has score 0.60 >= ${threshold}`,
      score: 0.6,
    });
    expect(mockCallApi).toHaveBeenCalledWith('Sample output');

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

    await expect(matchesContextRelevance(input, context, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Relevance 0.67 is >= 0.5',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith(
      expect.stringContaining(CONTEXT_RELEVANCE.slice(0, 100)),
    );

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

    await expect(matchesContextRelevance(input, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Relevance 0.67 is < 0.9',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith(
      expect.stringContaining(CONTEXT_RELEVANCE.slice(0, 100)),
    );

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

    await expect(matchesContextRecall(context, groundTruth, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Recall 0.67 is >= 0.5',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith(expect.stringContaining(CONTEXT_RECALL.slice(0, 100)));

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

    await expect(matchesContextRecall(context, groundTruth, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Recall 0.67 is < 0.9',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
      },
    });
    expect(mockCallApi).toHaveBeenCalledWith(expect.stringContaining(CONTEXT_RECALL.slice(0, 100)));

    mockCallApi.mockRestore();
  });
});

describe('matchesModeration', () => {
  const mockModerationResponse = {
    flags: [],
    tokenUsage: { total: 5, prompt: 2, completion: 3 },
  };

  beforeEach(() => {
    // Clear all environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip moderation when assistant response is empty', async () => {
    const openAiSpy = jest
      .spyOn(OpenAiModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    const result = await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: '',
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: expect.any(String),
    });
    expect(openAiSpy).not.toHaveBeenCalled();
  });

  it('should use OpenAI when OPENAI_API_KEY is present', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const openAiSpy = jest
      .spyOn(OpenAiModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(openAiSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it('should fallback to Replicate when only REPLICATE_API_KEY is present', async () => {
    process.env.REPLICATE_API_KEY = 'test-key';
    const replicateSpy = jest
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(replicateSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it('should respect provider override in grading config', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const replicateSpy = jest
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration(
      {
        userPrompt: 'test prompt',
        assistantResponse: 'test response',
      },
      {
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      },
    );

    expect(replicateSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });
});
