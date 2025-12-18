import { describe, expect, it, vi } from 'vitest';
import { getAssertionBaseType, isAssertionInverse } from '../../src/assertions/index';
import { handleRedteam } from '../../src/assertions/redteam';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';

describe('handleRedteam', () => {
  it('returns the value provided to the `assertion` param if `grade.assertion` returned by `grader.getResult` is null', async () => {
    // =========================
    // ===== Setup =====
    // =========================

    const assertion = {
      type: 'promptfoo:redteam:rbac' as const,
    };

    const prompt = 'test prompt';

    const test = {
      vars: {},
      options: {},
      assert: [],
      metadata: {
        purpose: 'foo',
      },
    };

    const logProbs = [] as number[];
    const provider = undefined;
    const providerResponse = {};

    // =========================
    // ===== Mocks =====
    // =========================

    // Mock the grader's getResult method to avoid network calls
    const mockGraderResult = {
      grade: {
        pass: true,
        score: 1,
        reason: 'Mock test result',
      },
      rubric: 'Mock rubric',
    };
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue(mockGraderResult);

    // =========================
    // ===== Test =====
    // =========================

    const grade = await handleRedteam({
      assertion,
      baseType: getAssertionBaseType(assertion),
      assertionValueContext: {
        prompt,
        vars: {},
        test,
        logProbs,
        provider,
        providerResponse,
      },
      cost: 0,
      inverse: isAssertionInverse(assertion),
      latencyMs: 0,
      logProbs,
      output: 'test output',
      outputString: 'test output',
      prompt,
      provider: undefined,
      providerResponse,
      renderedValue: undefined,
      test,
      valueFromScript: undefined,
    });

    // =========================
    // ===== Assert =====
    // =========================

    expect(grade.assertion).toEqual({
      ...assertion,
      // The handleRedteam function adds the rubric as the value to the assertion
      value: mockGraderResult.rubric,
    });
  });
});
