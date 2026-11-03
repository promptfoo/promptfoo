import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAnswerRelevance } from '../../src/assertions/answerRelevance';
import { matchesAnswerRelevance } from '../../src/matchers/rag';
import invariant from '../../src/util/invariant';
import { createPassingGrade, createThresholdAssertion } from '../factories/literalFixtures';

import type { AssertionParams, AssertionValueFunctionContext } from '../../src/types/index';

function createAnswerRelevanceParams(): Omit<AssertionParams, 'assertion' | 'inverse'> {
  return {
    output: 'test output',
    prompt: 'test prompt',
    test: {
      vars: {},
      options: {},
    },
    baseType: 'answer-relevance',
    assertionValueContext: {} as AssertionValueFunctionContext,
    outputString: 'test output',
    providerResponse: {
      output: 'test output',
      tokenUsage: {},
    },
  };
}

vi.mock('../../src/matchers/rag');
vi.mock('../../src/util/invariant');

describe('handleAnswerRelevance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(invariant).mockImplementation((condition, message) => {
      if (!condition) {
        throw new Error(typeof message === 'function' ? message() : message);
      }
    });
  });

  it('should call matchesAnswerRelevance with correct parameters', async () => {
    const mockMatchesAnswerRelevance = vi.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue(createPassingGrade());

    const result = await handleAnswerRelevance({
      ...createAnswerRelevanceParams(),
      assertion: createThresholdAssertion('answer-relevance', 0.7),
      inverse: false,
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith(
      'test prompt',
      'test output',
      0.7,
      {},
      undefined,
    );
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
    const mockMatchesAnswerRelevance = vi.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue(createPassingGrade());

    const result = await handleAnswerRelevance({
      ...createAnswerRelevanceParams(),
      assertion: createThresholdAssertion('answer-relevance', 0.7),
      test: {
        vars: {
          query: 'test query',
        },
        options: {},
      },
      inverse: false,
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith(
      'test query',
      'test output',
      0.7,
      {},
      undefined,
    );
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
        ...createAnswerRelevanceParams(),
        assertion: {
          type: 'answer-relevance',
        },
        output: {},
        inverse: false,
      }),
    ).rejects.toThrow('answer-relevance assertion type must evaluate a string output');
  });

  it('should throw error if prompt is missing', async () => {
    await expect(
      handleAnswerRelevance({
        ...createAnswerRelevanceParams(),
        assertion: {
          type: 'answer-relevance',
        },
        prompt: '',
        inverse: false,
      }),
    ).rejects.toThrow('answer-relevance assertion type must have a prompt');
  });

  it('should use default threshold of 0.5 if not specified', async () => {
    const mockMatchesAnswerRelevance = vi.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue(createPassingGrade());

    const result = await handleAnswerRelevance({
      ...createAnswerRelevanceParams(),
      assertion: {
        type: 'answer-relevance',
      },
      inverse: false,
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith(
      'test prompt',
      'test output',
      0.5,
      {},
      undefined,
    );
    expect(result).toEqual({
      assertion: {
        type: 'answer-relevance',
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });
  });

  it('should invert omitted-threshold not-answer-relevance results', async () => {
    const mockMatchesAnswerRelevance = vi.mocked(matchesAnswerRelevance);
    mockMatchesAnswerRelevance.mockResolvedValue({
      pass: false,
      score: 0.4,
      reason: 'Relevance 0.40 is less than threshold 0.5',
    });

    const result = await handleAnswerRelevance({
      ...createAnswerRelevanceParams(),
      assertion: {
        type: 'not-answer-relevance',
      },
      inverse: true,
    });

    expect(mockMatchesAnswerRelevance).toHaveBeenCalledWith(
      'test prompt',
      'test output',
      0.5,
      {},
      undefined,
    );
    expect(result).toEqual({
      assertion: {
        type: 'not-answer-relevance',
      },
      pass: true,
      score: 0.6,
      reason: 'Relevance 0.40 is less than threshold 0.5',
    });
  });
});
