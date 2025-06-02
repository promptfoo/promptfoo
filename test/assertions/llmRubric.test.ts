import { handleLlmRubric } from '../../src/assertions/llmRubric';
import { matchesLlmRubric } from '../../src/matchers';
import type { Assertion, AssertionParams, GradingResult } from '../../src/types';

jest.mock('../../src/matchers');

describe('handleLlmRubric', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockMatchesLlmRubric = jest.mocked(matchesLlmRubric);

  const defaultParams: AssertionParams = {
    assertion: {
      type: 'llm-rubric',
      value: 'test rubric',
    } as Assertion,
    baseType: 'llm-rubric',
    context: {
      prompt: 'test prompt',
      vars: {},
      test: {
        vars: {},
      },
      logProbs: undefined,
      provider: undefined,
      providerResponse: undefined,
    },
    inverse: false,
    output: 'test output',
    outputString: 'test output string',
    test: {
      vars: {},
    },
    providerResponse: {},
  };

  it('should handle string rendered value', async () => {
    const params = {
      ...defaultParams,
      renderedValue: 'test rendered value',
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test reason',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
      'test rendered value',
      'test output string',
      undefined,
      {},
      params.assertion,
    );
  });

  it('should handle object rendered value', async () => {
    const params = {
      ...defaultParams,
      renderedValue: { test: 'value' },
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test reason',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
      { test: 'value' },
      'test output string',
      undefined,
      {},
      params.assertion,
    );
  });

  it('should handle undefined rendered value', async () => {
    const params = {
      ...defaultParams,
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test reason',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
      '',
      'test output string',
      undefined,
      {},
      params.assertion,
    );
  });

  it('should stringify object rubricPrompt', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        // Using a valid structure for rubricPrompt as per type definition
        options: {
          rubricPrompt: [{ role: 'system', content: 'test prompt' }],
        },
      },
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test reason',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(params.test.options?.rubricPrompt).toBe(
      JSON.stringify([{ role: 'system', content: 'test prompt' }]),
    );
  });

  it('should use assertion.value if present, otherwise use test.options.rubricPrompt', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'llm-rubric',
        value: undefined,
      } as Assertion,
      test: {
        vars: {},
        options: {
          rubricPrompt: 'rubric from options',
        },
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 2,
      reason: 'used options rubric',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(params.assertion.value).toBe('rubric from options');
  });

  it('should not overwrite assertion.value if already set', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'llm-rubric',
        value: 'already set',
      } as Assertion,
      test: {
        vars: {},
        options: {
          rubricPrompt: 'rubric from options',
        },
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: false,
      score: 0,
      reason: 'assertion.value was set',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(params.assertion.value).toBe('already set');
  });

  it('should throw error for invalid rendered value type', async () => {
    // purposely passing an invalid type
    const params = {
      ...defaultParams,
      renderedValue: 123 as unknown as string,
    };

    await expect(() => handleLlmRubric(params)).toThrow(
      'Invariant failed: "llm-rubric" assertion type must have a string or object value',
    );
  });

  it('should stringify rubricPrompt if it is an object (not stringified yet)', async () => {
    const rubricPromptObj = [{ role: 'user', content: 'bar' }];
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        options: {
          rubricPrompt: rubricPromptObj,
        },
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'rubricPrompt object stringified',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    await handleLlmRubric(params);

    expect(params.test.options?.rubricPrompt).toBe(JSON.stringify(rubricPromptObj));
  });

  it('should not re-stringify rubricPrompt if it is already a string', async () => {
    const rubricPromptStr = '[{"role":"system","content":"already stringified"}]';
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        options: {
          rubricPrompt: rubricPromptStr,
        },
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'rubricPrompt already stringified',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    await handleLlmRubric(params);

    expect(params.test.options?.rubricPrompt).toBe(rubricPromptStr);
  });

  it('should work if test.options is undefined', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        // options is undefined
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'no options',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
  });

  // Additional edge case: rubricPrompt is an empty object
  it('should stringify rubricPrompt if it is an empty object', async () => {
    // rubricPrompt as empty array of objects (valid for type)
    const rubricPromptObj: { role: string; content: string }[] = [];
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        options: {
          rubricPrompt: rubricPromptObj,
        },
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'rubricPrompt empty object stringified',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    await handleLlmRubric(params);

    expect(params.test.options?.rubricPrompt).toBe(JSON.stringify(rubricPromptObj));
  });

  // Additional: assertion.value and test.options.rubricPrompt are both undefined
  it('should set assertion.value to undefined if both assertion.value and test.options.rubricPrompt are undefined', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'llm-rubric',
        value: undefined,
      } as Assertion,
      test: {
        vars: {},
        // options is undefined
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 3,
      reason: 'assertion.value and rubricPrompt undefined',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(params.assertion.value).toBeUndefined();
  });

  // New test: rubricPrompt is a plain object (not an array), should stringify as object
  it('should stringify rubricPrompt if it is a plain object (not an array)', async () => {
    const rubricPromptObj: any = { foo: 'bar', baz: 3 };
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        options: {
          rubricPrompt: rubricPromptObj,
        },
      },
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'rubricPrompt plain object stringified',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    await handleLlmRubric(params);

    expect(params.test.options?.rubricPrompt).toBe(JSON.stringify(rubricPromptObj));
  });

  // New test: renderedValue is an array (should be allowed, since typeof [] === 'object')
  it('should handle renderedValue as an array', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: ['foo', 'bar'] as unknown as string,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 4,
      reason: 'renderedValue is array',
    };

    mockMatchesLlmRubric.mockResolvedValue(expectedResult);

    const result = await handleLlmRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
      ['foo', 'bar'],
      'test output string',
      undefined,
      {},
      params.assertion,
    );
  });
});
