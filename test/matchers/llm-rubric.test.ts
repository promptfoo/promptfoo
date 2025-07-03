import fs from 'fs';
import path from 'path';
import { loadFromJavaScriptFile } from '../../src/assertions/utils';
import cliState from '../../src/cliState';
import { importModule } from '../../src/esm';
import { matchesLlmRubric, renderLlmRubricPrompt } from '../../src/matchers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';
import * as remoteGrading from '../../src/remoteGrading';
import type { ApiProvider, Assertion, GradingConfig } from '../../src/types';
import { TestGrader } from '../util/utils';

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('../../src/cliState');
jest.mock('../../src/remoteGrading', () => ({
  doRemoteGrading: jest.fn(),
}));
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

const Grader = new TestGrader();

describe('matchesLlmRubric', () => {
  const mockFilePath = path.join('path', 'to', 'external', 'rubric.txt');
  const mockFileContent = 'This is an external rubric prompt';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    (cliState as any).config = {};

    jest.mocked(remoteGrading.doRemoteGrading).mockReset();
    jest.mocked(remoteGrading.doRemoteGrading).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Remote grading passed',
    });

    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  it('should pass when the grading provider returns a passing result', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: Grader,
    };

    jest.spyOn(Grader, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

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

  it('should handle when provider returns direct object output instead of string', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: { pass: true, score: 0.85, reason: 'Direct object output' },
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      pass: true,
      score: 0.85,
      reason: 'Direct object output',
      assertion: undefined,
      tokensUsed: {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
  });

  it('should render rubric when provided as an object', async () => {
    const rubric = { prompt: 'Describe the image' };
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grade: {{ rubric }}',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'ok' }),
          tokenUsage: { total: 1, prompt: 1, completion: 1 },
        }),
      },
    };

    await matchesLlmRubric(rubric, output, options);

    expect(options.provider.callApi).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(rubric)),
    );
  });

  it('should fail when output is neither string nor object', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 42, // Numeric output
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      assertion: undefined,
      pass: false,
      score: 0,
      reason: 'llm-rubric produced malformed response - output must be string or object',
      tokensUsed: {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
        completionDetails: undefined,
      },
    });
  });

  it('should handle string output with invalid JSON format', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: '{ "pass": true, "reason": "Invalid JSON missing closing brace',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      assertion: undefined,
      pass: false,
      score: 0,
      reason: expect.stringContaining('Could not extract JSON from llm-rubric response'),
      tokensUsed: {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
        completionDetails: undefined,
      },
    });
  });

  it('should fail when string output contains no JSON objects', async () => {
    const expected = 'Expected output';
    const output = 'Sample output';
    const options: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'This is a valid text response but contains no JSON objects',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    await expect(matchesLlmRubric(expected, output, options)).resolves.toEqual({
      assertion: undefined,
      pass: false,
      score: 0,
      reason: 'Could not extract JSON from llm-rubric response',
      tokensUsed: {
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
        completionDetails: undefined,
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

  it('should throw error when throwOnError is true and provider returns an error', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          error: 'Provider error',
          output: null,
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    // With throwOnError: true - should throw
    await expect(
      matchesLlmRubric(rubric, llmOutput, grading, {}, null, { throwOnError: true }),
    ).rejects.toThrow('Provider error');
  });

  it('should throw error when throwOnError is true and provider returns no result', async () => {
    const rubric = 'Test rubric';
    const llmOutput = 'Test output';
    const grading: GradingConfig = {
      rubricPrompt: 'Grading prompt',
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          error: null,
          output: null,
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      },
    };

    // With throwOnError: true - should throw
    await expect(
      matchesLlmRubric(rubric, llmOutput, grading, {}, null, { throwOnError: true }),
    ).rejects.toThrow('No output');
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

  it('should use provided score threshold if llm does not return pass', async () => {
    const rubricPrompt = 'Rubric prompt';
    const llmOutput = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.5,
    };

    const lowScoreResponse = { score: 0.25, reason: 'Low score' };
    const lowScoreProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify(lowScoreResponse),
      }),
    };

    await expect(
      matchesLlmRubric(
        rubricPrompt,
        llmOutput,
        { rubricPrompt, provider: lowScoreProvider },
        {},
        assertion,
      ),
    ).resolves.toEqual(expect.objectContaining({ assertion, pass: false, ...lowScoreResponse }));

    const highScoreResponse = { score: 0.75, reason: 'High score' };
    const highScoreProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify(highScoreResponse),
      }),
    };
    await expect(
      matchesLlmRubric(
        rubricPrompt,
        llmOutput,
        { rubricPrompt, provider: highScoreProvider },
        {},
        assertion,
      ),
    ).resolves.toEqual(expect.objectContaining({ assertion, pass: true, ...highScoreResponse }));
  });

  it('should ignore the score threshold if llm returns pass', async () => {
    const rubricPrompt = 'Rubric prompt';
    const output = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.1,
    };

    const lowScoreResult = { score: 0.25, reason: 'Low score but pass', pass: true };
    const lowScoreOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(lowScoreResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, lowScoreOptions, {}, assertion),
    ).resolves.toEqual(expect.objectContaining({ assertion, ...lowScoreResult }));
  });

  it('should respect both threshold and explicit pass/fail when both are present', async () => {
    const rubricPrompt = 'Rubric prompt';
    const output = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.8,
    };

    // Case 1: Pass is true but score is below threshold
    const failingResult = { score: 0.7, reason: 'Score below threshold', pass: true };
    const failingOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(failingResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, failingOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 0.7,
        pass: false,
        reason: 'Score below threshold',
      }),
    );

    // Case 2: Pass is false but score is above threshold
    const passingResult = {
      score: 0.9,
      reason: 'Score above threshold but explicit fail',
      pass: false,
    };
    const passingOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(passingResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, passingOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 0.9,
        pass: false,
        reason: 'Score above threshold but explicit fail',
      }),
    );
  });

  it('should handle edge cases around threshold value', async () => {
    const rubricPrompt = 'Rubric prompt';
    const output = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.8,
    };

    // Exactly at threshold should pass
    const exactThresholdResult = { score: 0.8, reason: 'Exactly at threshold' };
    const exactOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(exactThresholdResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, exactOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 0.8,
        pass: true,
        reason: 'Exactly at threshold',
      }),
    );

    // Just below threshold should fail
    const justBelowResult = { score: 0.799, reason: 'Just below threshold' };
    const belowOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(justBelowResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, belowOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 0.799,
        pass: false,
        reason: 'Just below threshold',
      }),
    );
  });

  it('should handle missing or invalid scores when threshold is present', async () => {
    const rubricPrompt = 'Rubric prompt';
    const output = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.8,
    };

    // Missing score should default to pass value
    const missingScoreResult = { pass: true, reason: 'No score provided' };
    const missingScoreOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(missingScoreResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, missingScoreOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 1.0,
        pass: true,
        reason: 'No score provided',
      }),
    );

    // Invalid score type should be handled gracefully
    const invalidScoreResult = { score: 'high', reason: 'Invalid score type', pass: true };
    const invalidScoreOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(invalidScoreResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, invalidScoreOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 1.0,
        pass: true,
        reason: 'Invalid score type',
      }),
    );
  });

  it('should handle string scores', async () => {
    const rubricPrompt = 'Rubric prompt';
    const output = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.8,
    };

    const stringScoreResult = { score: '0.9', reason: 'String score' };
    const stringScoreOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(stringScoreResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, stringScoreOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        score: 0.9,
        pass: true,
        reason: 'String score',
      }),
    );
  });

  it('should handle string pass values', async () => {
    const rubricPrompt = 'Rubric prompt';
    const output = 'Sample output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: rubricPrompt,
      threshold: 0.8,
    };

    const stringPassResult = { reason: 'String pass', pass: 'true' };
    const stringPassOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(stringPassResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, stringPassOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        pass: true,
        reason: 'String pass',
      }),
    );

    const stringFailResult = { reason: 'String fail', pass: 'false' };
    const stringFailOptions: GradingConfig = {
      rubricPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: JSON.stringify(stringFailResult),
        }),
      },
    };

    await expect(
      matchesLlmRubric(rubricPrompt, output, stringFailOptions, {}, assertion),
    ).resolves.toEqual(
      expect.objectContaining({
        assertion,
        pass: false,
        reason: 'String fail',
      }),
    );
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

    // Clear and set up specific mock behavior for this test
    jest.mocked(remoteGrading.doRemoteGrading).mockClear();
    jest.mocked(remoteGrading.doRemoteGrading).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Remote grading passed',
    });

    // Import and set up shouldGenerateRemote mock properly
    const { shouldGenerateRemote } = jest.requireMock('../../src/redteam/remoteGeneration');
    jest.mocked(shouldGenerateRemote).mockReturnValue(true);

    // Give it a redteam config
    (cliState as any).config = { redteam: {} };

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

describe('tryParse and renderLlmRubricPrompt', () => {
  let tryParse: (content: string | null | undefined) => any;

  beforeAll(async () => {
    const context: { capturedFn: null | Function } = { capturedFn: null };

    await renderLlmRubricPrompt('{"test":"value"}', {
      __capture(fn: Function) {
        context.capturedFn = fn;
        return 'captured';
      },
    });

    tryParse = function (content: string | null | undefined) {
      try {
        if (content === null || content === undefined) {
          return content;
        }
        return JSON.parse(content);
      } catch {}
      return content;
    };
  });

  it('should parse valid JSON', () => {
    const input = '{"key": "value"}';
    expect(tryParse(input)).toEqual({ key: 'value' });
  });

  it('should return original string for invalid JSON', () => {
    const input = 'not json';
    expect(tryParse(input)).toBe('not json');
  });

  it('should handle empty string', () => {
    const input = '';
    expect(tryParse(input)).toBe('');
  });

  it('should handle null and undefined', () => {
    expect(tryParse(null)).toBeNull();
    expect(tryParse(undefined)).toBeUndefined();
  });

  it('should render strings inside JSON objects', async () => {
    const template = '{"role": "user", "content": "Hello {{name}}"}';
    const result = await renderLlmRubricPrompt(template, { name: 'World' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ role: 'user', content: 'Hello World' });
  });

  it('should preserve JSON structure while rendering only strings', async () => {
    const template = '{"nested": {"text": "{{var}}", "number": 42}}';
    const result = await renderLlmRubricPrompt(template, { var: 'test' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ nested: { text: 'test', number: 42 } });
  });

  it('should handle non-JSON templates with legacy rendering', async () => {
    const template = 'Hello {{name}}';
    const result = await renderLlmRubricPrompt(template, { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('should handle complex objects in context', async () => {
    const template = '{"text": "{{object}}"}';
    const complexObject = { foo: 'bar', baz: [1, 2, 3] };
    const result = await renderLlmRubricPrompt(template, { object: complexObject });
    const parsed = JSON.parse(result);
    expect(typeof parsed.text).toBe('string');
    // With our fix, this should now be stringified JSON instead of [object Object]
    expect(parsed.text).toBe(JSON.stringify(complexObject));
  });

  it('should properly stringify objects', async () => {
    const template = 'Source Text:\n{{input}}';
    // Create objects that would typically cause the [object Object] issue
    const objects = [
      { name: 'Object 1', properties: { color: 'red', size: 'large' } },
      { name: 'Object 2', properties: { color: 'blue', size: 'small' } },
    ];

    const result = await renderLlmRubricPrompt(template, { input: objects });

    // With our fix, this should properly stringify the objects
    expect(result).not.toContain('[object Object]');
    expect(result).toContain(JSON.stringify(objects[0]));
    expect(result).toContain(JSON.stringify(objects[1]));
  });

  it('should handle mixed arrays of objects and primitives', async () => {
    const template = 'Items: {{items}}';
    const mixedArray = ['string item', { name: 'Object item' }, 42, [1, 2, 3]];

    const result = await renderLlmRubricPrompt(template, { items: mixedArray });

    // Objects in array should be stringified
    expect(result).not.toContain('[object Object]');
    expect(result).toContain('string item');
    expect(result).toContain(JSON.stringify({ name: 'Object item' }));
    expect(result).toContain('42');
    expect(result).toContain(JSON.stringify([1, 2, 3]));
  });

  it('should render arrays of objects correctly', async () => {
    const template = '{"items": [{"name": "{{name1}}"}, {"name": "{{name2}}"}]}';
    const result = await renderLlmRubricPrompt(template, { name1: 'Alice', name2: 'Bob' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      items: [{ name: 'Alice' }, { name: 'Bob' }],
    });
  });

  it('should handle multiline strings', async () => {
    const template = `{"content": "Line 1\\nLine {{number}}\\nLine 3"}`;
    const result = await renderLlmRubricPrompt(template, { number: '2' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      content: 'Line 1\nLine 2\nLine 3',
    });
  });

  it('should handle nested templates', async () => {
    const template = '{"outer": "{{value1}}", "inner": {"value": "{{value2}}"}}';
    const result = await renderLlmRubricPrompt(template, {
      value1: 'outer value',
      value2: 'inner value',
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      outer: 'outer value',
      inner: { value: 'inner value' },
    });
  });

  it('should handle escaping in JSON strings', async () => {
    const template = '{"content": "This needs \\"escaping\\" and {{var}} too"}';
    const result = await renderLlmRubricPrompt(template, { var: 'var with "quotes"' });
    const parsed = JSON.parse(result);
    expect(parsed.content).toBe('This needs "escaping" and var with "quotes" too');
  });

  it('should work with nested arrays and objects', async () => {
    const template = JSON.stringify({
      role: 'system',
      content: 'Process this: {{input}}',
      config: {
        options: [
          { id: 1, label: '{{option1}}' },
          { id: 2, label: '{{option2}}' },
        ],
      },
    });

    const evalResult = await renderLlmRubricPrompt(template, {
      input: 'test input',
      option1: 'First Option',
      option2: 'Second Option',
    });

    const parsed = JSON.parse(evalResult);
    expect(parsed.content).toBe('Process this: test input');
    expect(parsed.config.options[0].label).toBe('First Option');
    expect(parsed.config.options[1].label).toBe('Second Option');
  });

  it('should handle rendering statements with join filter', async () => {
    const statements = ['Statement 1', 'Statement 2', 'Statement 3'];
    const template = 'statements:\n{{statements|join("\\n")}}';
    const result = await renderLlmRubricPrompt(template, { statements });

    const expected = 'statements:\nStatement 1\nStatement 2\nStatement 3';
    expect(result).toBe(expected);
  });

  it('should stringify objects in arrays', async () => {
    const template = 'Items: {{items}}';
    const items = [{ name: 'Item 1', price: 10 }, 'string item', { name: 'Item 2', price: 20 }];

    const result = await renderLlmRubricPrompt(template, { items });

    expect(result).not.toContain('[object Object]');
    expect(result).toContain(JSON.stringify(items[0]));
    expect(result).toContain('string item');
    expect(result).toContain(JSON.stringify(items[2]));
  });

  it('should stringify deeply nested objects and arrays', async () => {
    const template = 'Complex data: {{data}}';
    const data = {
      products: [
        {
          name: 'Item 1',
          price: 10,
          details: {
            color: 'red',
            specs: { weight: '2kg', dimensions: { width: 10, height: 20 } },
          },
        },
        'string item',
        {
          name: 'Item 2',
          price: 20,
          nested: [{ a: 1 }, { b: 2 }],
          metadata: { tags: ['electronics', 'gadget'] },
        },
      ],
    };

    const result = await renderLlmRubricPrompt(template, { data });

    expect(result).not.toContain('[object Object]');
    expect(result).toContain('"specs":{"weight":"2kg"');
    expect(result).toContain('"dimensions":{"width":10,"height":20}');
    expect(result).toContain('[{"a":1},{"b":2}]');
    expect(result).toContain('"tags":["electronics","gadget"]');
    expect(result).toContain('string item');
  });
});
