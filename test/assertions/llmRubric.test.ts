import { handleLlmRubric } from '../../src/assertions/llmRubric';
import { matchesLlmRubric } from '../../src/matchers';
import type {
  AssertionParams,
  AssertionValueFunctionContext,
  ProviderResponse,
} from '../../src/types';

jest.mock('../../src/matchers');

describe('handleLlmRubric', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should throw error if renderedValue is not string or undefined', () => {
    const params: AssertionParams = {
      assertion: { type: 'llm-rubric' as const, value: '' },
      renderedValue: 123 as any,
      outputString: 'test output',
      test: {
        vars: {},
        options: {},
      },
      baseType: 'llm-rubric',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: undefined,
        providerResponse: {} as ProviderResponse,
      } as AssertionValueFunctionContext,
      inverse: false,
      output: '',
      providerResponse: {} as ProviderResponse,
    };

    expect(() => handleLlmRubric(params)).toThrow(
      '"llm-rubric" assertion type must have a string value',
    );
  });

  it('should stringify object rubricPrompt', () => {
    const rubricObj = { criteria: 'test criteria' };
    const params: AssertionParams = {
      assertion: { type: 'llm-rubric' as const, value: '' },
      renderedValue: 'test',
      outputString: 'test output',
      test: {
        options: {
          rubricPrompt: JSON.stringify(rubricObj),
        },
        vars: {},
      },
      baseType: 'llm-rubric',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: undefined,
        providerResponse: {} as ProviderResponse,
      } as AssertionValueFunctionContext,
      inverse: false,
      output: '',
      providerResponse: {} as ProviderResponse,
    };

    handleLlmRubric(params);

    expect(params.test.options?.rubricPrompt).toBe(JSON.stringify(rubricObj));
  });

  it('should update assertion value with rubricPrompt if value is empty', () => {
    const params: AssertionParams = {
      assertion: { type: 'llm-rubric' as const, value: '' },
      renderedValue: 'test',
      outputString: 'test output',
      test: {
        options: {
          rubricPrompt: 'test prompt',
        },
        vars: {},
      },
      baseType: 'llm-rubric',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: undefined,
        providerResponse: {} as ProviderResponse,
      } as AssertionValueFunctionContext,
      inverse: false,
      output: '',
      providerResponse: {} as ProviderResponse,
    };

    handleLlmRubric(params);

    expect(params.assertion.value).toBe('test prompt');
  });

  it('should keep original assertion value if exists', () => {
    const params: AssertionParams = {
      assertion: { type: 'llm-rubric' as const, value: 'original value' },
      renderedValue: 'test',
      outputString: 'test output',
      test: {
        options: {
          rubricPrompt: 'test prompt',
        },
        vars: {},
      },
      baseType: 'llm-rubric',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: undefined,
        providerResponse: {} as ProviderResponse,
      } as AssertionValueFunctionContext,
      inverse: false,
      output: '',
      providerResponse: {} as ProviderResponse,
    };

    handleLlmRubric(params);

    expect(params.assertion.value).toBe('original value');
  });

  it('should call matchesLlmRubric with correct parameters', () => {
    const mockMatchesLlmRubric = jest.mocked(matchesLlmRubric);
    mockMatchesLlmRubric.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'test reason',
      assertion: { type: 'llm-rubric' as const, value: '' },
    });

    const params: AssertionParams = {
      assertion: { type: 'llm-rubric' as const, value: '' },
      renderedValue: 'test',
      outputString: 'test output',
      test: {
        options: { rubricPrompt: 'test prompt' },
        vars: { var1: 'value1' },
      },
      baseType: 'llm-rubric',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: undefined,
        providerResponse: {} as ProviderResponse,
      } as AssertionValueFunctionContext,
      inverse: false,
      output: '',
      providerResponse: {} as ProviderResponse,
    };

    handleLlmRubric(params);

    expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
      'test',
      'test output',
      params.test.options,
      params.test.vars,
      params.assertion,
    );
  });

  it('should handle undefined renderedValue', () => {
    const mockMatchesLlmRubric = jest.mocked(matchesLlmRubric);
    mockMatchesLlmRubric.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'test reason',
      assertion: { type: 'llm-rubric' as const, value: '' },
    });

    const params: AssertionParams = {
      assertion: { type: 'llm-rubric' as const, value: '' },
      renderedValue: undefined,
      outputString: 'test output',
      test: {
        options: { rubricPrompt: 'test prompt' },
        vars: {},
      },
      baseType: 'llm-rubric',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: undefined,
        providerResponse: {} as ProviderResponse,
      } as AssertionValueFunctionContext,
      inverse: false,
      output: '',
      providerResponse: {} as ProviderResponse,
    };

    handleLlmRubric(params);

    expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
      '',
      'test output',
      params.test.options,
      params.test.vars,
      params.assertion,
    );
  });
});
