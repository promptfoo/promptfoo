import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAnswerRelevance } from '../../src/assertions/answerRelevance';
import { matchesAnswerRelevance } from '../../src/matchers/rag';
import invariant from '../../src/util/invariant';

import type { AssertionValueFunctionContext } from '../../src/types/index';

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
      assertionValueContext: {} as AssertionValueFunctionContext,
      inverse: false,
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
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
      assertionValueContext: {} as AssertionValueFunctionContext,
      inverse: false,
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
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
        assertionValueContext: {} as AssertionValueFunctionContext,
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
        assertionValueContext: {} as AssertionValueFunctionContext,
        inverse: false,
        outputString: 'test output',
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      }),
    ).rejects.toThrow('answer-relevance assertion type must have a prompt');
  });

  it('should use a default threshold of 0.7 when not specified', async () => {
    // A missing threshold previously defaulted to 0, which made answer-relevance a
    // no-op that always passed (any relevance >= 0 cleared the bar). It now defaults
    // to 0.7 — the value shown in the docs' primary example, and in line with the
    // other graded assertions' non-zero defaults. See issue #9848.
    const mockMatchesAnswerRelevance = vi.mocked(matchesAnswerRelevance);
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
      assertionValueContext: {} as AssertionValueFunctionContext,
      inverse: false,
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
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
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });
  });
});
