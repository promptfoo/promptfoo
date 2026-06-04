import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAgentRubric } from '../../src/assertions/agentRubric';
import { matchesAgentRubric } from '../../src/matchers/agent';

import type { AssertionParams, GradingResult } from '../../src/types/index';

vi.mock('../../src/matchers/agent');

describe('handleAgentRubric', () => {
  const params: AssertionParams = {
    assertion: {
      type: 'agent-rubric',
      value: 'Verify the claimed change',
    },
    baseType: 'agent-rubric',
    assertionValueContext: {
      prompt: 'test prompt',
      vars: {},
      test: { vars: {} },
      logProbs: undefined,
      provider: undefined,
      providerResponse: undefined,
    },
    inverse: false,
    output: 'Implemented',
    outputString: 'Implemented',
    renderedValue: 'Verify the claimed change',
    test: {
      vars: {},
      options: {},
    },
    providerResponse: {
      output: 'Implemented',
    },
  };

  const mockMatchesAgentRubric = vi.mocked(matchesAgentRubric);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes rubric inputs to the agent matcher', async () => {
    const result: GradingResult = {
      pass: true,
      score: 1,
      reason: 'verified',
    };
    mockMatchesAgentRubric.mockResolvedValue(result);

    await expect(handleAgentRubric(params)).resolves.toEqual(result);
    expect(mockMatchesAgentRubric).toHaveBeenCalledWith(
      'Verify the claimed change',
      'Implemented',
      {},
      {},
      params.assertion,
      undefined,
    );
  });

  it('uses a structured rubric prompt when no assertion value is rendered', async () => {
    const rubricPrompt = [{ role: 'system', content: 'Inspect the artifact' }];
    const structuredParams: AssertionParams = {
      ...params,
      assertion: {
        ...params.assertion,
        value: undefined,
      },
      renderedValue: undefined,
      test: {
        vars: {},
        options: { rubricPrompt },
      },
    };
    mockMatchesAgentRubric.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'verified',
    });

    await expect(handleAgentRubric(structuredParams)).resolves.toEqual({
      pass: true,
      score: 1,
      reason: 'verified',
    });

    const serializedPrompt = JSON.stringify(rubricPrompt);
    expect(structuredParams.test.options?.rubricPrompt).toBe(serializedPrompt);
    expect(structuredParams.assertion.value).toBe(serializedPrompt);
    expect(mockMatchesAgentRubric).toHaveBeenCalledWith(
      '',
      'Implemented',
      { rubricPrompt: serializedPrompt },
      {},
      structuredParams.assertion,
      undefined,
    );
  });

  it('inverts successful verdicts and scores', async () => {
    mockMatchesAgentRubric.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'verified',
    });

    const result = await handleAgentRubric({ ...params, inverse: true });

    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(0.2);
  });

  it('does not invert grader transport or parse failures', async () => {
    const failure: GradingResult = {
      pass: false,
      score: 0,
      reason: 'No output',
      metadata: { graderError: true },
    };
    mockMatchesAgentRubric.mockResolvedValue(failure);

    await expect(handleAgentRubric({ ...params, inverse: true })).resolves.toEqual({
      ...failure,
      assertion: params.assertion,
    });
  });
});
