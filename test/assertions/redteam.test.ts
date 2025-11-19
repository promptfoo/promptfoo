import { handleRedteam } from '../../src/assertions/redteam';
import { isAssertionInverse, getAssertionBaseType } from '../../src/assertions/index';
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
    jest.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue(mockGraderResult);

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

  it('throws an error with helpful message when prompt is missing', async () => {
    const assertion = {
      type: 'promptfoo:redteam:harmful:misinformation-disinformation' as const,
    };

    const test = {
      vars: {},
      options: {},
      assert: [],
      metadata: {
        purpose: 'test purpose',
      },
    };

    await expect(
      handleRedteam({
        assertion,
        baseType: getAssertionBaseType(assertion),
        assertionValueContext: {
          prompt: undefined as unknown as string,
          vars: {},
          test,
          logProbs: [],
          provider: undefined,
          providerResponse: {},
        },
        cost: 0,
        inverse: isAssertionInverse(assertion),
        latencyMs: 0,
        logProbs: [],
        output: 'test output',
        outputString: 'test output',
        prompt: undefined as unknown as string,
        provider: undefined,
        providerResponse: {},
        renderedValue: undefined,
        test,
        valueFromScript: undefined,
      }),
    ).rejects.toThrow(/requires a prompt but received empty\/undefined/);
  });

  it('throws an error with helpful message when prompt is empty string', async () => {
    const assertion = {
      type: 'promptfoo:redteam:harmful:specialized-advice' as const,
    };

    const test = {
      vars: {},
      options: {},
      assert: [],
      metadata: {
        purpose: 'test purpose',
      },
    };

    await expect(
      handleRedteam({
        assertion,
        baseType: getAssertionBaseType(assertion),
        assertionValueContext: {
          prompt: '',
          vars: {},
          test,
          logProbs: [],
          provider: undefined,
          providerResponse: {},
        },
        cost: 0,
        inverse: isAssertionInverse(assertion),
        latencyMs: 0,
        logProbs: [],
        output: 'test output',
        outputString: 'test output',
        prompt: '',
        provider: undefined,
        providerResponse: {},
        renderedValue: undefined,
        test,
        valueFromScript: undefined,
      }),
    ).rejects.toThrow(/requires a prompt but received empty\/undefined/);
  });
});
