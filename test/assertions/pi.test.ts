import type nunjucks from 'nunjucks';
import { handlePiScorer } from '../../src/assertions/pi';
import { matchesClosedQa, matchesPiScore } from '../../src/matchers';
import type { AssertionParams } from '../../src/types';
import { getNunjucksEngine } from '../../src/util/templates';

jest.mock('../../src/matchers');
jest.mock('../../src/util/templates');

describe('handlePiScorer', () => {
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
      assertion: { type: 'pi' },
      baseType: 'pi',
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

    await expect(handlePiScorer(params)).rejects.toThrow(
      '"pi" assertion type must have a string value',
    );
  });

  it('should validate prompt exists', async () => {
    const params: AssertionParams = {
      assertion: { type: 'pi' },
      baseType: 'pi',
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

    await expect(handlePiScorer(params)).rejects.toThrow(
      '"pi" assertion must have a prompt that is a string',
    );
  });

  it('should call handlePiScorer with correct parameters', async () => {
    const params: AssertionParams = {
      assertion: { type: 'pi', value: 'test question' },
      baseType: 'pi',
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
      renderedValue: 'test question',
      test: {
        options: {
          rubricPrompt: 'test rubric',
        },
        vars: {
          var: 'value',
        },
      },
    };

    await handlePiScorer(params);

    expect(matchesPiScore).toHaveBeenCalledWith('test question', 'test prompt', 'test output', {
      type: 'pi',
      value: 'test question',
    });
  });
});
