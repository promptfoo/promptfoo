import { handleAnswerRelevance } from '../../src/assertions/answerRelevance';
import { matchesAnswerRelevance } from '../../src/matchers';
import type { AssertionValueFunctionContext } from '../../src/types';
import invariant from '../../src/util/invariant';

jest.mock('../../src/matchers');
jest.mock('../../src/util/invariant');

describe('handleAnswerRelevance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(invariant).mockImplementation((condition, message) => {
      if (!condition) {
        throw new Error(typeof message === 'function' ? message() : message);
      }
    });
  });

  it('should call matchesAnswerRelevance with correct parameters', async () => {
    const mockMatchesAnswerRelevance = jest.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    const result = await handleAnswerRelevance({
      assertion: {
        type: 'answer-relevance',
        threshold: 0.7,
      },
      output: 'test output',
      prompt: 'test prompt',
      test: {
        vars: {},
        options: {},
      },
      baseType: 'answer-relevance',
      context: {} as AssertionValueFunctionContext,
      inverse: false,
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith('test prompt', 'test output', 0.7, {});
    expect(result).toEqual({
      assertion: {
        type: 'answer-relevance',
        threshold: 0.7,
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });
  });

  it('should use query from vars if available', async () => {
    const mockMatchesAnswerRelevance = jest.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    const result = await handleAnswerRelevance({
      assertion: {
        type: 'answer-relevance',
        threshold: 0.7,
      },
      output: 'test output',
      prompt: 'test prompt',
      test: {
        vars: {
          query: 'test query',
        },
        options: {},
      },
      baseType: 'answer-relevance',
      context: {} as AssertionValueFunctionContext,
      inverse: false,
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith('test query', 'test output', 0.7, {});
    expect(result).toEqual({
      assertion: {
        type: 'answer-relevance',
        threshold: 0.7,
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });
  });

  it('should throw error if output is not string', async () => {
    await expect(
      handleAnswerRelevance({
        assertion: {
          type: 'answer-relevance',
        },
        output: {},
        prompt: 'test prompt',
        test: {
          vars: {},
          options: {},
        },
        baseType: 'answer-relevance',
        context: {} as AssertionValueFunctionContext,
        inverse: false,
        outputString: 'test output',
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      }),
    ).rejects.toThrow('answer-relevance assertion type must evaluate a string output');
  });

  it('should throw error if prompt is missing', async () => {
    await expect(
      handleAnswerRelevance({
        assertion: {
          type: 'answer-relevance',
        },
        output: 'test output',
        prompt: '',
        test: {
          vars: {},
          options: {},
        },
        baseType: 'answer-relevance',
        context: {} as AssertionValueFunctionContext,
        inverse: false,
        outputString: 'test output',
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      }),
    ).rejects.toThrow('answer-relevance assertion type must have a prompt');
  });

  it('should use default threshold of 0 if not specified', async () => {
    const mockMatchesAnswerRelevance = jest.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    const result = await handleAnswerRelevance({
      assertion: {
        type: 'answer-relevance',
      },
      output: 'test output',
      prompt: 'test prompt',
      test: {
        vars: {},
        options: {},
      },
      baseType: 'answer-relevance',
      context: {} as AssertionValueFunctionContext,
      inverse: false,
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith('test prompt', 'test output', 0, {});
    expect(result).toEqual({
      assertion: {
        type: 'answer-relevance',
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });
  });
});
