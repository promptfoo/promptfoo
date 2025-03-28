import { handleGEval } from '../../src/assertions/geval';
import { matchesGEval } from '../../src/matchers';

jest.mock('../../src/matchers');

describe('handleGEval', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should handle single string value', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'Good match',
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      renderedValue: 'test output',
      prompt: 'test prompt',
      outputString: 'expected output',
      test: {
        options: {},
      } as any,
      baseType: 'g-eval' as any,
      context: {
        prompt: 'test',
        vars: {},
        test: {},
        logProbs: undefined,
        output: '',
        tokenUsage: null,
      } as any,
      inverse: false,
      output: 'test output',
      providerResponse: {} as any,
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      pass: true,
      score: 0.8,
      reason: 'Good match',
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'test output',
      'test prompt',
      'expected output',
      0.7,
      {},
    );
  });

  it('should handle array of strings', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValueOnce({
      pass: true,
      score: 0.8,
      reason: 'Good match 1',
    });
    mockMatchesGEval.mockResolvedValueOnce({
      pass: true,
      score: 0.9,
      reason: 'Good match 2',
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      renderedValue: ['output1', 'output2'],
      prompt: 'test prompt',
      outputString: 'expected output',
      test: {
        options: {},
      } as any,
      baseType: 'g-eval' as any,
      context: {
        prompt: 'test',
        vars: {},
        test: {},
        logProbs: undefined,
        output: '',
        tokenUsage: null,
      } as any,
      inverse: false,
      output: ['output1', 'output2'],
      providerResponse: {} as any,
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      pass: true,
      reason: 'Good match 1\n\nGood match 2',
      score: 0.8500000000000001,
    });

    expect(mockMatchesGEval).toHaveBeenCalledTimes(2);
  });

  it('should use default threshold if not provided', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'Good match',
    });

    const _result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
      },
      renderedValue: 'test output',
      prompt: 'test prompt',
      outputString: 'expected output',
      test: {
        options: {},
      } as any,
      baseType: 'g-eval' as any,
      context: {
        prompt: 'test',
        vars: {},
        test: {},
        logProbs: undefined,
        output: '',
        tokenUsage: null,
      } as any,
      inverse: false,
      output: 'test output',
      providerResponse: {} as any,
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith(
      'test output',
      'test prompt',
      'expected output',
      0.7,
      {},
    );
  });

  it('should throw error for invalid renderedValue type', async () => {
    await expect(
      handleGEval({
        assertion: {
          type: 'g-eval',
          value: 'test criteria',
        },
        renderedValue: 123 as any,
        prompt: 'test prompt',
        outputString: 'expected output',
        test: {
          options: {},
        } as any,
        baseType: 'g-eval' as any,
        context: {
          prompt: 'test',
          vars: {},
          test: {},
          logProbs: undefined,
          output: '',
          tokenUsage: null,
        } as any,
        inverse: false,
        output: 123 as any,
        providerResponse: {} as any,
      }),
    ).rejects.toThrow('G-Eval assertion type must have a string or array of strings value');
  });

  it('should handle empty prompt', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'Good match',
    });

    const _result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
      },
      renderedValue: 'test output',
      prompt: '',
      outputString: 'expected output',
      test: {
        options: {},
      } as any,
      baseType: 'g-eval' as any,
      context: {
        prompt: 'test',
        vars: {},
        test: {},
        logProbs: undefined,
        output: '',
        tokenUsage: null,
      } as any,
      inverse: false,
      output: 'test output',
      providerResponse: {} as any,
    });

    expect(mockMatchesGEval).toHaveBeenCalledWith('test output', '', 'expected output', 0.7, {});
  });

  it('should handle failing scores in array', async () => {
    const mockMatchesGEval = jest.mocked(matchesGEval);
    mockMatchesGEval.mockResolvedValueOnce({
      pass: false,
      score: 0.5,
      reason: 'Low score 1',
    });
    mockMatchesGEval.mockResolvedValueOnce({
      pass: false,
      score: 0.6,
      reason: 'Low score 2',
    });

    const result = await handleGEval({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      renderedValue: ['output1', 'output2'],
      prompt: 'test prompt',
      outputString: 'expected output',
      test: {
        options: {},
      } as any,
      baseType: 'g-eval' as any,
      context: {
        prompt: 'test',
        vars: {},
        test: {},
        logProbs: undefined,
        output: '',
        tokenUsage: null,
      } as any,
      inverse: false,
      output: ['output1', 'output2'],
      providerResponse: {} as any,
    });

    expect(result).toEqual({
      assertion: {
        type: 'g-eval',
        value: 'test criteria',
        threshold: 0.7,
      },
      pass: false,
      score: 0.55,
      reason: 'Low score 1\n\nLow score 2',
    });
  });
});
