import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleModelGradedClosedQa } from '../../src/assertions/modelGradedClosedQa';
import { matchesClosedQa } from '../../src/matchers/llmGrading';

import type { AssertionParams } from '../../src/types/index';

// Partial mock: `isGraderFailure` is a real type guard over the matcher's
// result, so it must keep its implementation for the inverse cases below.
vi.mock('../../src/matchers/llmGrading', async () => {
  const actual = await vi.importActual<typeof import('../../src/matchers/llmGrading')>(
    '../../src/matchers/llmGrading',
  );
  return {
    ...actual,
    matchesClosedQa: vi.fn(),
  };
});

describe('handleModelGradedClosedQa', () => {
  beforeEach(() => {
    vi.mocked(matchesClosedQa).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'test reason',
    });
  });

  it('should validate string value', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: { vars: {} },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: {},
      test: {
        options: {},
        vars: {},
      },
    };

    await expect(handleModelGradedClosedQa(params)).rejects.toThrow(
      'model-graded-closedqa assertion type must have a string value',
    );
  });

  it('should validate prompt exists', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      assertionValueContext: {
        prompt: undefined,
        vars: {},
        test: { vars: {} },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: undefined,
      providerResponse: {},
      renderedValue: 'test value',
      test: {
        options: {},
        vars: {},
      },
    };

    await expect(handleModelGradedClosedQa(params)).rejects.toThrow(
      'model-graded-closedqa assertion type must have a prompt',
    );
  });

  it('should call matchesClosedQa with correct parameters', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: { var: 'value' },
        test: { vars: { var: 'value' } },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: 'test value',
      test: {
        options: {
          rubricPrompt: 'test rubric',
        },
        vars: {
          var: 'value',
        },
      },
    };

    const result = await handleModelGradedClosedQa(params);

    expect(matchesClosedQa).toHaveBeenCalledWith(
      'test prompt',
      'test value',
      'test output',
      {
        rubricPrompt: 'test rubric',
      },
      {
        var: 'value',
      },
      undefined,
    );

    expect(result).toEqual({
      assertion: { type: 'model-graded-closedqa' },
      pass: true,
      score: 1,
      reason: 'test reason',
    });
  });

  describe('inverse (not-model-graded-closedqa)', () => {
    const baseParams: AssertionParams = {
      assertion: { type: 'not-model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: { var: 'value' },
        test: { vars: { var: 'value' } },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: true,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: 'test criteria',
      test: { options: {}, vars: { var: 'value' } },
    };

    it('fails a passing verdict when inverse is true', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: true,
        score: 1,
        reason: 'The submission meets the criterion',
      });

      const result = await handleModelGradedClosedQa(baseParams);

      expect(result).toEqual({
        assertion: { type: 'not-model-graded-closedqa' },
        pass: false,
        score: 0,
        reason: 'The submission meets the criterion',
      });
    });

    it('passes a failing verdict when inverse is true', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'The submission does not meet the criterion',
      });

      const result = await handleModelGradedClosedQa(baseParams);

      expect(result).toEqual({
        assertion: { type: 'not-model-graded-closedqa' },
        pass: true,
        score: 1,
        reason: 'The submission does not meet the criterion',
      });
    });

    it('leaves the non-inverse verdict untouched', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: true,
        score: 1,
        reason: 'The submission meets the criterion',
      });

      const result = await handleModelGradedClosedQa({ ...baseParams, inverse: false });

      expect(result).toEqual({
        assertion: { type: 'not-model-graded-closedqa' },
        pass: true,
        score: 1,
        reason: 'The submission meets the criterion',
      });
    });

    // A grader transport/parse failure is not evidence that the criterion was
    // or was not met, so it must never be flipped into a pass by the `not-`
    // prefix. `matchesClosedQa` tags these with metadata.graderError.
    it('propagates a grader failure verbatim instead of flipping it to a pass', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'No output',
        tokensUsed: { total: 11, prompt: 5, completion: 6 },
        metadata: { graderError: true },
      });

      const result = await handleModelGradedClosedQa(baseParams);

      expect(result).toEqual({
        assertion: { type: 'not-model-graded-closedqa' },
        pass: false,
        score: 0,
        reason: 'No output',
        tokensUsed: { total: 11, prompt: 5, completion: 6 },
        metadata: { graderError: true },
      });
    });
  });
});
