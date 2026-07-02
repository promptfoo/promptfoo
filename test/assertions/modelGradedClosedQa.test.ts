import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleModelGradedClosedQa } from '../../src/assertions/modelGradedClosedQa';
import { matchesClosedQa } from '../../src/matchers/llmGrading';

import type { AssertionParams } from '../../src/types/index';

vi.mock('../../src/matchers/llmGrading');

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

  it('should project grader vars while preserving closed-QA inputs', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa', graderVars: ['var'] },
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
          expected_fix_patch: '<large patch>',
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
      assertion: params.assertion,
      pass: true,
      score: 1,
      reason: 'test reason',
    });
  });
});
