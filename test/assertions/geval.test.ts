import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGEval } from '../../src/assertions/geval';
import { runAssertion } from '../../src/assertions/index';
import { matchesGEval } from '../../src/matchers/llmGrading';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../src/types/index';

vi.mock('../../src/matchers/llmGrading', async () => {
  const actual = await vi.importActual<typeof import('../../src/matchers/llmGrading')>(
    '../../src/matchers/llmGrading',
  );
  return {
    ...actual,
    matchesGEval: vi.fn(),
  };
});

describe('handleGEval', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should handle string renderedValue', async () => {
    const mockMatchesGEval = vi.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      renderedValue: 'test criteria',
      prompt: 'test prompt',
      outputString: 'test output',
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'g-eval',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: createMockProvider({
          response: createProviderResponse({ output: 'test' }),
        }),
        providerResponse: {
          output: 'test output',
          error: undefined,
        },
      },
      inverse: false,
      output: 'test output',
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'test criteria',
      'test prompt',
      'test output',
      0.7,
      {},
      undefined,
    );
  });

  it('should handle array renderedValue', async () => {
    const mockMatchesGEval = vi.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValueOnce({
      pass: true,
      score: 0.8,
      reason: 'test reason 1',
      tokensUsed: { total: 10, prompt: 6, completion: 4 },
    });
    mockMatchesGEval.mockResolvedValueOnce({
      pass: false,
      score: 0.6,
      reason: 'test reason 2',
      tokensUsed: { total: 14, prompt: 8, completion: 6 },
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: ['criteria1', 'criteria2'],
        threshold: 0.7,
      },
      renderedValue: ['criteria1', 'criteria2'],
      prompt: 'test prompt',
      outputString: 'test output',
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'g-eval',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: createMockProvider({
          response: createProviderResponse({ output: 'test' }),
        }),
        providerResponse: {
          output: 'test output',
          error: undefined,
        },
      },
      inverse: false,
      output: 'test output',
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: ['criteria1', 'criteria2'],
        threshold: 0.7,
      },
      pass: true,
      score: 0.7,
      reason: 'test reason 1\n\ntest reason 2',
      tokensUsed: expect.objectContaining({ total: 24, prompt: 14, completion: 10 }),
    });
  });

  it('should fail with a clear reason when array renderedValue is empty', async () => {
    const mockMatchesGEval = vi.mocked(matchesGEval);

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: [],
        threshold: 0.7,
      },
      renderedValue: [],
      prompt: 'test prompt',
      outputString: 'test output',
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'g-eval',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
        providerResponse: {
          output: 'test output',
          error: undefined,
        },
      },
      inverse: false,
      output: 'test output',
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: [],
        threshold: 0.7,
      },
      pass: false,
      score: 0,
      reason: 'G-Eval assertion requires at least one criterion string in the value array.',
    });
    expect(mockMatchesGEval).not.toHaveBeenCalled();
  });

  it('should use default threshold if not provided', async () => {
    const mockMatchesGEval = vi.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
      },
      renderedValue: 'test criteria',
      prompt: 'test prompt',
      outputString: 'test output',
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'g-eval',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: createMockProvider({
          response: createProviderResponse({ output: 'test' }),
        }),
        providerResponse: {
          output: 'test output',
          error: undefined,
        },
      },
      inverse: false,
      output: 'test output',
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'test criteria',
      'test prompt',
      'test output',
      0.7,
      {},
      undefined,
    );
  });

  it('should throw error for invalid renderedValue type', async () => {
    await expect(
      handleGEval({
        assertion: {
          type: 'g-eval',
          value: 'test',
        },
        renderedValue: undefined,
        prompt: 'test',
        outputString: 'test',
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        baseType: 'g-eval',
        assertionValueContext: {
          prompt: 'test prompt',
          vars: {},
          test: {
            vars: {},
            assert: [],
            options: {},
          },
          logProbs: undefined,
          provider: createMockProvider({
            response: createProviderResponse({ output: 'test' }),
          }),
          providerResponse: {
            output: 'test output',
            error: undefined,
          },
        },
        inverse: false,
        output: 'test',
        providerResponse: {
          output: 'test',
          error: undefined,
        },
      }),
    ).rejects.toThrow('G-Eval assertion type must have a string or array of strings value');
  });

  it('should handle string renderedValue with undefined prompt', async () => {
    const mockMatchesGEval = vi.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      renderedValue: 'test criteria',
      prompt: undefined,
      outputString: 'test output',
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'g-eval',
      assertionValueContext: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: createMockProvider({
          response: createProviderResponse({ output: 'test' }),
        }),
        providerResponse: {
          output: 'test output',
          error: undefined,
        },
      },
      inverse: false,
      output: 'test output',
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      pass: true,
      score: 0.8,
      reason: 'test reason',
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'test criteria',
      '',
      'test output',
      0.7,
      {},
      undefined,
    );
  });

  it('should handle array renderedValue with undefined prompt', async () => {
    const mockMatchesGEval = vi.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValueOnce({
      pass: true,
      score: 0.8,
      reason: 'test reason 1',
      tokensUsed: { total: 10, prompt: 6, completion: 4 },
    });
    mockMatchesGEval.mockResolvedValueOnce({
      pass: false,
      score: 0.6,
      reason: 'test reason 2',
      tokensUsed: { total: 14, prompt: 8, completion: 6 },
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: ['criteria1', 'criteria2'],
        threshold: 0.7,
      },
      renderedValue: ['criteria1', 'criteria2'],
      prompt: undefined,
      outputString: 'test output',
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'g-eval',
      assertionValueContext: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: createMockProvider({
          response: createProviderResponse({ output: 'test' }),
        }),
        providerResponse: {
          output: 'test output',
          error: undefined,
        },
      },
      inverse: false,
      output: 'test output',
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: ['criteria1', 'criteria2'],
        threshold: 0.7,
      },
      pass: true,
      score: 0.7,
      reason: 'test reason 1\n\ntest reason 2',
      tokensUsed: expect.objectContaining({ total: 24, prompt: 14, completion: 10 }),
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'criteria1',
      '',
      'test output',
      0.7,
      {},
      undefined,
    );
    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'criteria2',
      '',
      'test output',
      0.7,
      {},
      undefined,
    );
  });

  const baseParams = {
    prompt: 'test prompt',
    outputString: 'test output',
    test: {
      vars: {},
      assert: [],
      options: {},
    },
    baseType: 'g-eval' as const,
    assertionValueContext: {
      prompt: 'test prompt',
      vars: {},
      test: {
        vars: {},
        assert: [],
        options: {},
      },
      logProbs: undefined,
      provider: {
        id: () => 'test-provider',
        callApi: async () => ({ output: 'test' }),
      },
      providerResponse: {
        output: 'test output',
        error: undefined,
      },
    },
    output: 'test output',
    providerResponse: {
      output: 'test output',
      error: undefined,
    },
  };

  it('should throw error for array renderedValue entries that are not strings', async () => {
    await expect(
      handleGEval({
        ...baseParams,
        assertion: {
          type: 'g-eval',
          value: ['valid criteria', 42] as any,
        },
        renderedValue: ['valid criteria', 42] as any,
        inverse: false,
      }),
    ).rejects.toThrow('G-Eval assertion type must have a string or array of strings value');
  });

  describe('inverse (not-g-eval)', () => {
    it('fails a passing string criterion when inverse is true', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: true,
        score: 0.8,
        reason: 'matches the criterion',
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        renderedValue: 'test criteria',
        inverse: true,
      });

      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        pass: false,
        score: expect.closeTo(0.2, 5),
        reason: 'matches the criterion',
      });
    });

    it('passes a failing string criterion when inverse is true', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: false,
        score: 0.3,
        reason: 'does not match the criterion',
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        renderedValue: 'test criteria',
        inverse: true,
      });

      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        pass: true,
        score: expect.closeTo(0.7, 5),
        reason: 'does not match the criterion',
      });
    });

    it('inverts an averaged passing array result when inverse is true', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValueOnce({
        pass: true,
        score: 0.8,
        reason: 'test reason 1',
        tokensUsed: { total: 10, prompt: 6, completion: 4 },
      });
      mockMatchesGEval.mockResolvedValueOnce({
        pass: false,
        score: 0.6,
        reason: 'test reason 2',
        tokensUsed: { total: 14, prompt: 8, completion: 6 },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: ['criteria1', 'criteria2'],
          threshold: 0.7,
        },
        renderedValue: ['criteria1', 'criteria2'],
        inverse: true,
      });

      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: ['criteria1', 'criteria2'],
          threshold: 0.7,
        },
        pass: false,
        score: expect.closeTo(0.3, 5),
        reason: 'test reason 1\n\ntest reason 2',
        tokensUsed: expect.objectContaining({ total: 24, prompt: 14, completion: 10 }),
      });
    });

    it('inverts an averaged failing array result when inverse is true', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValueOnce({
        pass: false,
        score: 0.4,
        reason: 'test reason 1',
        tokensUsed: { total: 10, prompt: 6, completion: 4 },
      });
      mockMatchesGEval.mockResolvedValueOnce({
        pass: false,
        score: 0.2,
        reason: 'test reason 2',
        tokensUsed: { total: 14, prompt: 8, completion: 6 },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: ['criteria1', 'criteria2'],
          threshold: 0.7,
        },
        renderedValue: ['criteria1', 'criteria2'],
        inverse: true,
      });

      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: ['criteria1', 'criteria2'],
          threshold: 0.7,
        },
        pass: true,
        score: expect.closeTo(0.7, 5),
        reason: 'test reason 1\n\ntest reason 2',
        tokensUsed: expect.objectContaining({ total: 24, prompt: 14, completion: 10 }),
      });
    });

    it('still fails on empty array regardless of inverse (misconfiguration)', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: [],
          threshold: 0.7,
        },
        renderedValue: [],
        inverse: true,
      });

      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: [],
          threshold: 0.7,
        },
        pass: false,
        score: 0,
        reason: 'G-Eval assertion requires at least one criterion string in the value array.',
      });
      expect(mockMatchesGEval).not.toHaveBeenCalled();
    });

    // Boundary: `score >= threshold` must use inclusive `>=`, not strict `>`.
    // A regression that flipped to `>` would pass every other inverse test
    // (those use 0.8/0.3/0.6/0.4 vs 0.7) but silently break this one. Pairing
    // both inverse values pins the XOR truth table at the boundary.
    it('treats score === threshold as a pass on the positive branch', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: true,
        score: 0.7,
        reason: 'exactly at threshold',
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: { type: 'g-eval', value: 'test criteria', threshold: 0.7 },
        renderedValue: 'test criteria',
        inverse: false,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.7);
    });

    it('inverts score === threshold correctly under not-g-eval', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: true,
        score: 0.7,
        reason: 'exactly at threshold',
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: { type: 'not-g-eval', value: 'test criteria', threshold: 0.7 },
        renderedValue: 'test criteria',
        inverse: true,
      });

      // (0.7 >= 0.7) !== true = true !== true = false → pass: false.
      expect(result.pass).toBe(false);
      expect(result.score).toBeCloseTo(0.3, 5);
    });
  });

  describe('grader failure propagation', () => {
    // A grader error surfaces as pass:false, score:0, reason:<error>, and
    // metadata.graderError:true. These results must never be flipped to a pass
    // under not-g-eval — a transport/parse failure is not evidence that the
    // criterion was not met.
    it('propagates a string-path grader failure as a failure for g-eval', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'No output',
        tokensUsed: { total: 11, prompt: 5, completion: 6 },
        metadata: { graderError: true },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        renderedValue: 'test criteria',
        inverse: false,
      });

      expect(result).toEqual({
        assertion: {
          type: 'g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        pass: false,
        score: 0,
        reason: 'No output',
        tokensUsed: { total: 11, prompt: 5, completion: 6 },
        metadata: { graderError: true },
      });
    });

    it('propagates a string-path grader failure as a failure for not-g-eval', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'LLM-proposed evaluation result is not in JSON format: oops',
        tokensUsed: { total: 21, prompt: 12, completion: 9 },
        metadata: { graderError: true },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        renderedValue: 'test criteria',
        inverse: true,
      });

      // Tokens spent on the failing grader call must round-trip so the eval
      // UI's billing/attribution stays honest even for failed assertions.
      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        pass: false,
        score: 0,
        reason: 'LLM-proposed evaluation result is not in JSON format: oops',
        tokensUsed: { total: 21, prompt: 12, completion: 9 },
        metadata: { graderError: true },
      });
    });

    it('does not flip a grader failure to pass when threshold is 0', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'No output',
        metadata: { graderError: true },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'g-eval',
          value: 'test criteria',
          threshold: 0,
        },
        renderedValue: 'test criteria',
        inverse: false,
      });

      expect(result).toEqual({
        assertion: {
          type: 'g-eval',
          value: 'test criteria',
          threshold: 0,
        },
        pass: false,
        score: 0,
        reason: 'No output',
        metadata: { graderError: true },
      });
    });

    it('propagates an array-path grader failure as a failure for not-g-eval', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValueOnce({
        pass: true,
        score: 0.9,
        reason: 'first criterion matched',
        tokensUsed: { total: 10, prompt: 4, completion: 6 },
      });
      mockMatchesGEval.mockResolvedValueOnce({
        pass: false,
        score: 0,
        reason: 'G-Eval result has invalid or missing score: "bad"',
        tokensUsed: { total: 17, prompt: 9, completion: 8 },
        metadata: { graderError: true },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: ['criteria1', 'criteria2'],
          threshold: 0.7,
        },
        renderedValue: ['criteria1', 'criteria2'],
        inverse: true,
      });

      // tokensUsed must aggregate tokens from BOTH the successful first
      // criterion and the failing second — dropping either would under-count
      // assertion token metrics for failed evaluations. The reason must
      // identify which criterion failed so users can debug multi-criterion
      // configs without guessing.
      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: ['criteria1', 'criteria2'],
          threshold: 0.7,
        },
        pass: false,
        score: 0,
        reason:
          'G-Eval criterion 2/2 ("criteria2") failed: G-Eval result has invalid or missing score: "bad"',
        tokensUsed: expect.objectContaining({
          total: 27,
          prompt: 13,
          completion: 14,
        }),
        metadata: { graderError: true },
      });
    });

    it('short-circuits array evaluation after the first grader failure', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValueOnce({
        pass: false,
        score: 0,
        reason: 'LLM-proposed evaluation result is not in JSON format: oops',
        tokensUsed: { total: 5, prompt: 3, completion: 2 },
        metadata: { graderError: true },
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'g-eval',
          value: ['criteria1', 'criteria2', 'criteria3'],
          threshold: 0.7,
        },
        renderedValue: ['criteria1', 'criteria2', 'criteria3'],
        inverse: false,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      // Subsequent criteria must NOT be evaluated — wasted grader spend on a
      // result that will be discarded anyway.
      expect(mockMatchesGEval).toHaveBeenCalledTimes(1);
    });

    it('still inverts legitimate zero scores — a real 0 is not a failure', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      // A genuine grader response where the criterion was "not observed at
      // all" per the GEVAL_PROMPT_EVALUATE template — score 0 is a valid
      // real score, distinguishable from a grader error by the absence of
      // metadata.graderError.
      mockMatchesGEval.mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'criterion not observed at all',
      });

      const result = await handleGEval({
        ...baseParams,
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        renderedValue: 'test criteria',
        inverse: true,
      });

      expect(result).toEqual({
        assertion: {
          type: 'not-g-eval',
          value: 'test criteria',
          threshold: 0.7,
        },
        pass: true,
        score: 1,
        reason: 'criterion not observed at all',
      });
    });
  });

  // Integration check: proves `type: 'not-g-eval'` actually dispatches through
  // runAssertion → getAssertionBaseType → ASSERTION_HANDLERS['g-eval'] →
  // handleGEval with `inverse: true`. Every other test in this file unit-calls
  // handleGEval directly and synthesizes `inverse`; if the dispatch wiring
  // regressed (e.g. the `'not-'` stripping in getAssertionBaseType was
  // removed), those unit tests would still pass but real users'
  // `type: 'not-g-eval'` assertions would silently break.
  describe('runAssertion dispatch for not-g-eval', () => {
    const provider: ApiProvider = {
      id: () => 'test-provider',
      callApi: async () => ({ output: 'test output' }),
    };

    it('inverts pass/score when dispatched via runAssertion', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: true,
        score: 0.9,
        reason: 'criterion met',
        tokensUsed: { total: 20, prompt: 12, completion: 8 },
      });

      const assertion: Assertion = {
        type: 'not-g-eval',
        value: 'The output is in English.',
        threshold: 0.7,
      };
      const test: AtomicTestCase = { vars: {}, assert: [assertion], options: {} };

      const result = await runAssertion({
        prompt: 'Say hi.',
        provider,
        assertion,
        test,
        providerResponse: { output: 'Hello!' },
      });

      // A grader score of 0.9 for `not-g-eval` must invert to pass=false,
      // score=0.1. If dispatch dropped inverse, this would report pass=true.
      expect(result.pass).toBe(false);
      expect(result.score).toBeCloseTo(0.1, 5);
      expect(result.reason).toBe('criterion met');
      expect(mockMatchesGEval).toHaveBeenCalledTimes(1);
    });

    it('does not flip a grader failure to pass via runAssertion', async () => {
      const mockMatchesGEval = vi.mocked(matchesGEval);
      mockMatchesGEval.mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'API error: 500 Internal Server Error',
        tokensUsed: { total: 3, prompt: 3, completion: 0 },
        metadata: { graderError: true },
      });

      const assertion: Assertion = {
        type: 'not-g-eval',
        value: 'The output is in English.',
        threshold: 0.7,
      };
      const test: AtomicTestCase = { vars: {}, assert: [assertion], options: {} };

      const result = await runAssertion({
        prompt: 'Say hi.',
        provider,
        assertion,
        test,
        providerResponse: { output: 'Hello!' },
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('API error: 500 Internal Server Error');
      expect(result.metadata).toEqual({ graderError: true });
    });
  });
});
