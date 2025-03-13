import { handleGEval } from '../../src/assertions/geval';
import { matchesGEval } from '../../src/matchers';

jest.mock('../../src/matchers');

describe('handleGEval', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should handle string renderedValue', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
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
      context: {
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
    );
  });

  it('should handle array renderedValue', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValueOnce({
      pass: true,
      score: 0.8,
      reason: 'test reason 1',
    });
    mockMatchesGEval.mockResolvedValueOnce({
      pass: false,
      score: 0.6,
      reason: 'test reason 2',
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
      context: {
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
        value: ['criteria1', 'criteria2'],
        threshold: 0.7,
      },
      pass: true,
      score: 0.7,
      reason: 'test reason 2',
    });
  });

  it('should use default threshold if not provided', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
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
      context: {
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

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'test criteria',
      'test prompt',
      'test output',
      0.7,
      {},
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
        context: {
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
        output: 'test',
        providerResponse: {
          output: 'test',
          error: undefined,
        },
      }),
    ).rejects.toThrow('G-Eval assertion type must have a string or array of strings value');
  });
});
