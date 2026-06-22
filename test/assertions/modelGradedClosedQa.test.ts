import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleModelGradedClosedQa } from '../../src/assertions/modelGradedClosedQa';
import { matchesClosedQa } from '../../src/matchers/llmGrading';

import type { AssertionParams } from '../../src/types/index';

// Mock only matchesClosedQa; keep the real isGraderFailure so the grader-error
// guard in the handler is exercised faithfully.
vi.mock('../../src/matchers/llmGrading', async () => {
  const actual = await vi.importActual<typeof import('../../src/matchers/llmGrading')>(
    '../../src/matchers/llmGrading',
  );
  return { ...actual, matchesClosedQa: vi.fn() };
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
        vars: {},
        test: { vars: {} },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: true,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: 'test value',
      test: { options: {}, vars: {} },
    };

    it('fails and zeroes the score when the grader passes', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: true,
        score: 1,
        reason: 'criterion met',
      });

      const result = await handleModelGradedClosedQa(baseParams);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('criterion met');
    });

    it('passes and inverts the score when the grader fails', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: false,
        score: 0.25,
        reason: 'criterion not met',
      });

      const result = await handleModelGradedClosedQa(baseParams);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.75);
      expect(result.reason).toBe('criterion not met');
    });

    it('does not invert a grader error', async () => {
      vi.mocked(matchesClosedQa).mockResolvedValue({
        pass: false,
        score: 0,
        reason: 'grader failed',
        metadata: { graderError: true },
      });

      const result = await handleModelGradedClosedQa(baseParams);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('grader failed');
    });
  });
});
