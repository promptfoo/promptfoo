import { handleResearchRubric } from '../../src/assertions/researchRubric';
import { matchesResearchRubric } from '../../src/matchers';
import type { Assertion, AssertionParams, GradingResult } from '../../src/types';

jest.mock('../../src/matchers', () => ({
  matchesResearchRubric: jest.fn(),
}));

describe('handleResearchRubric', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockMatchesResearchRubric = jest.mocked(matchesResearchRubric);

  const defaultParams: AssertionParams = {
    assertion: {
      type: 'research-rubric',
      value: 'test rubric',
    } as Assertion,
    baseType: 'research-rubric',
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
    prompt: 'test prompt',
    provider: undefined,
  };

  it('should handle string rendered value', async () => {
    const params = {
      ...defaultParams,
      renderedValue: 'test rendered value',
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 0.8,
      reason: 'Verified 8 out of 10 claims',
      metadata: {
        totalClaims: 10,
        claimsVerified: 8,
        highConfidenceVerifications: 7,
      },
    };

    mockMatchesResearchRubric.mockResolvedValue(expectedResult);

    const result = await handleResearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesResearchRubric).toHaveBeenCalledWith(
      'test rendered value',
      'test output string',
      undefined,
      {},
      params.assertion,
      undefined,
      'test prompt',
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
      reason: 'All claims verified as accurate',
    };

    mockMatchesResearchRubric.mockResolvedValue(expectedResult);

    const result = await handleResearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesResearchRubric).toHaveBeenCalledWith(
      { test: 'value' },
      'test output string',
      undefined,
      {},
      params.assertion,
      undefined,
      'test prompt',
    );
  });

  it('should handle undefined rendered value', async () => {
    const params = {
      ...defaultParams,
      renderedValue: undefined,
    };

    const expectedResult: GradingResult = {
      pass: false,
      score: 0,
      reason: 'No verifiable claims found',
    };

    mockMatchesResearchRubric.mockResolvedValue(expectedResult);

    const result = await handleResearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesResearchRubric).toHaveBeenCalledWith(
      '',
      'test output string',
      undefined,
      {},
      params.assertion,
      undefined,
      'test prompt',
    );
  });

  it('should throw error for invalid rendered value type', async () => {
    const params = {
      ...defaultParams,
      renderedValue: 123 as unknown as string,
    };

    await expect(handleResearchRubric(params)).rejects.toThrow(
      '"research-rubric" assertion type must have a string or object value',
    );
  });

  it('should throw error when prompt is missing', async () => {
    const params = {
      ...defaultParams,
      prompt: undefined,
    };

    await expect(handleResearchRubric(params)).rejects.toThrow(
      'research-rubric assertion type must have a prompt',
    );
  });

  it('should stringify object rubricPrompt in test options', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      test: {
        vars: {},
        options: {
          rubricPrompt: { key: 'value' },
        },
      },
      renderedValue: 'test',
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test',
    };

    mockMatchesResearchRubric.mockResolvedValue(expectedResult);

    const result = await handleResearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(params.test.options?.rubricPrompt).toBe('{"key":"value"}');
  });

  it('should update assertion value from test options rubricPrompt', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'research-rubric',
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
      score: 0.5,
      reason: 'Partial verification',
    };

    mockMatchesResearchRubric.mockResolvedValue(expectedResult);

    const result = await handleResearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(params.assertion.value).toBe('rubric from options');
  });

  it('should pass provider to matchesResearchRubric', async () => {
    const mockProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params = {
      ...defaultParams,
      provider: mockProvider,
      renderedValue: 'test',
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test',
    };

    mockMatchesResearchRubric.mockResolvedValue(expectedResult);

    const result = await handleResearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesResearchRubric).toHaveBeenCalledWith(
      'test',
      'test output string',
      undefined,
      {},
      params.assertion,
      mockProvider,
      'test prompt',
    );
  });
});
