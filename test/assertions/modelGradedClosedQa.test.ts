import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleModelGradedClosedQa } from '../../src/assertions/modelGradedClosedQa';
import { matchesClosedQa } from '../../src/matchers';

import type { AssertionParams } from '../../src/types/index';

vi.mock('../../src/matchers');

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
});
