import { handleRedteam } from '../../src/assertions/redteam';
import { isAssertionInverse, getAssertionBaseType } from '../../src/assertions/index';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';

describe('handleRedteam', () => {
  describe('missing prompt handling', () => {
    it('returns a failing grade when prompt is undefined', async () => {
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

      const grade = await handleRedteam({
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
      });

      expect(grade.pass).toBe(false);
      expect(grade.score).toBe(0);
      expect(grade.reason).toContain('No prompt available for grader');
      expect(grade.reason).toContain('Ensure attack generation ran before testing');
    });

    it('returns a failing grade when prompt is empty string', async () => {
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

      const grade = await handleRedteam({
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
      });

      expect(grade.pass).toBe(false);
      expect(grade.score).toBe(0);
      expect(grade.reason).toContain('No prompt available for grader');
    });

    it('returns a failing grade when prompt is whitespace only', async () => {
      const assertion = {
        type: 'promptfoo:redteam:rbac' as const,
      };

      const test = {
        vars: {},
        options: {},
        assert: [],
        metadata: {
          purpose: 'test purpose',
        },
      };

      const grade = await handleRedteam({
        assertion,
        baseType: getAssertionBaseType(assertion),
        assertionValueContext: {
          prompt: '   \n\t  ',
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
        prompt: '   \n\t  ',
        provider: undefined,
        providerResponse: {},
        renderedValue: undefined,
        test,
        valueFromScript: undefined,
      });

      expect(grade.pass).toBe(false);
      expect(grade.score).toBe(0);
      expect(grade.reason).toContain('No prompt available for grader');
    });

    it('preserves test metadata when prompt is missing', async () => {
      const assertion = {
        type: 'promptfoo:redteam:harmful:misinformation-disinformation' as const,
      };

      const test = {
        vars: {},
        options: {},
        assert: [],
        metadata: {
          purpose: 'test purpose',
          pluginId: 'harmful:misinformation-disinformation',
          strategyId: 'basic',
          severity: 'high',
        },
      };

      const grade = await handleRedteam({
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
      });

      expect(grade.pass).toBe(false);
      expect(grade.metadata).toBeDefined();
      expect(grade.metadata).toEqual({
        purpose: 'test purpose',
        pluginId: 'harmful:misinformation-disinformation',
        strategyId: 'basic',
        severity: 'high',
      });
    });
  });


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
});
