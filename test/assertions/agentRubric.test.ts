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

  it('renders Nunjucks templates in grading provider config so working_dir can be per-case', async () => {
    mockMatchesAgentRubric.mockResolvedValue({ pass: true, score: 1, reason: 'ok' });

    const templatedParams: AssertionParams = {
      ...params,
      test: {
        vars: { trace_id: 'abc123' },
        options: {
          provider: {
            id: 'anthropic:claude-agent-sdk',
            config: {
              working_dir: './evidence/{{trace_id}}',
              sandbox_mode: 'read-only',
              skip_git_repo_check: true,
            },
          },
        },
      },
    };

    await handleAgentRubric(templatedParams);

    expect(mockMatchesAgentRubric).toHaveBeenCalledTimes(1);
    const [, , gradingArg, varsArg] = mockMatchesAgentRubric.mock.calls[0];
    expect(varsArg).toEqual({ trace_id: 'abc123' });
    const renderedProvider = (gradingArg as { provider: { config: Record<string, unknown> } })
      .provider;
    expect(renderedProvider.config.working_dir).toBe('./evidence/abc123');
    // Non-string fields and unrelated strings are untouched.
    expect(renderedProvider.config.sandbox_mode).toBe('read-only');
    expect(renderedProvider.config.skip_git_repo_check).toBe(true);
  });

  it('leaves string provider IDs untouched (no config to render)', async () => {
    mockMatchesAgentRubric.mockResolvedValue({ pass: true, score: 1, reason: 'ok' });

    const stringProviderParams: AssertionParams = {
      ...params,
      test: {
        vars: { trace_id: 'abc' },
        options: { provider: 'anthropic:claude-agent-sdk' },
      },
    };

    await handleAgentRubric(stringProviderParams);

    const [, , gradingArg] = mockMatchesAgentRubric.mock.calls[0];
    expect((gradingArg as { provider: unknown }).provider).toBe('anthropic:claude-agent-sdk');
  });
});
