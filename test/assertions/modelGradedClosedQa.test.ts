import type nunjucks from 'nunjucks';
import { handleModelGradedClosedQa } from '../../src/assertions/modelGradedClosedQa';
import { matchesClosedQa } from '../../src/matchers';
import type { AssertionParams } from '../../src/types';
import { getNunjucksEngine } from '../../src/util/templates';

jest.mock('../../src/matchers');
jest.mock('../../src/util/templates');

describe('handleModelGradedClosedQa', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    const mockNunjucksEnv = {
      options: { autoescape: true },
      render: jest.fn(),
      renderString: jest.fn().mockImplementation((str) => str),
      addFilter: jest.fn(),
      getFilter: jest.fn(),
      hasExtension: jest.fn(),
      addExtension: jest.fn(),
      removeExtension: jest.fn(),
      getExtension: jest.fn(),
      addGlobal: jest.fn(),
      getGlobal: jest.fn(),
      getTemplate: jest.fn(),
      express: jest.fn(),
      on: jest.fn(),
    } as unknown as nunjucks.Environment;

    jest.mocked(getNunjucksEngine).mockReturnValue(mockNunjucksEnv);
    jest.mocked(matchesClosedQa).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'test reason',
    });
  });

  it('should validate string value', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      context: {
        prompt: 'test prompt',
        vars: {},
        test: { vars: {} },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: {},
      test: {
        options: {},
        vars: {},
      },
    };

    await expect(handleModelGradedClosedQa(params)).rejects.toThrow(
      'model-graded-closedqa assertion type must have a string value',
    );
  });

  it('should validate prompt exists', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      context: {
        prompt: undefined,
        vars: {},
        test: { vars: {} },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: undefined,
      providerResponse: {},
      renderedValue: 'test value',
      test: {
        options: {},
        vars: {},
      },
    };

    await expect(handleModelGradedClosedQa(params)).rejects.toThrow(
      'model-graded-closedqa assertion type must have a prompt',
    );
  });

  it('should validate rubricPrompt is string if provided', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      context: {
        prompt: 'test prompt',
        vars: {},
        test: { vars: {} },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: 'test value',
      test: {
        options: {
          rubricPrompt: {} as any,
        },
        vars: {},
      },
    };

    await expect(handleModelGradedClosedQa(params)).rejects.toThrow(
      'rubricPrompt must be a string',
    );
  });

  it('should process rubricPrompt with nunjucks if provided', async () => {
    const mockRenderString = jest.fn().mockReturnValue('rendered rubric');
    const mockNunjucksEnv = {
      options: { autoescape: true },
      render: jest.fn(),
      renderString: mockRenderString,
      addFilter: jest.fn(),
      getFilter: jest.fn(),
      hasExtension: jest.fn(),
      addExtension: jest.fn(),
      removeExtension: jest.fn(),
      getExtension: jest.fn(),
      addGlobal: jest.fn(),
      getGlobal: jest.fn(),
      getTemplate: jest.fn(),
      express: jest.fn(),
      on: jest.fn(),
    } as unknown as nunjucks.Environment;

    jest.mocked(getNunjucksEngine).mockReturnValue(mockNunjucksEnv);

    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      context: {
        prompt: 'test prompt',
        vars: { var: 'value' },
        test: { vars: { var: 'value' } },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: 'test value',
      test: {
        options: {
          rubricPrompt: 'test rubric {{ var }}',
        },
        vars: {
          var: 'value',
        },
      },
    };

    await handleModelGradedClosedQa(params);

    expect(mockRenderString).toHaveBeenCalledWith('test rubric {{ var }}', { var: 'value' });
  });

  it('should call matchesClosedQa with correct parameters', async () => {
    const params: AssertionParams = {
      assertion: { type: 'model-graded-closedqa' },
      baseType: 'model-graded-closedqa',
      context: {
        prompt: 'test prompt',
        vars: { var: 'value' },
        test: { vars: { var: 'value' } },
        logProbs: undefined,
        provider: undefined,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      prompt: 'test prompt',
      providerResponse: {},
      renderedValue: 'test value',
      test: {
        options: {
          rubricPrompt: 'test rubric',
        },
        vars: {
          var: 'value',
        },
      },
    };

    const result = await handleModelGradedClosedQa(params);

    expect(matchesClosedQa).toHaveBeenCalledWith(
      'test prompt',
      'test value',
      'test output',
      {
        rubricPrompt: 'test rubric',
      },
      {
        var: 'value',
      },
    );

    expect(result).toEqual({
      assertion: { type: 'model-graded-closedqa' },
      pass: true,
      score: 1,
      reason: 'test reason',
    });
  });
});
