import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePiScorer } from '../../src/assertions/pi';
import { matchesClosedQa, matchesPiScore } from '../../src/matchers';
import { getNunjucksEngine } from '../../src/util/templates';
import type nunjucks from 'nunjucks';

import type { AssertionParams } from '../../src/types/index';

vi.mock('../../src/matchers');
vi.mock('../../src/util/templates');

describe('handlePiScorer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const mockNunjucksEnv = {
      options: { autoescape: true },
      render: vi.fn(),
      renderString: vi.fn().mockImplementation((str) => str),
      addFilter: vi.fn(),
      getFilter: vi.fn(),
      hasExtension: vi.fn(),
      addExtension: vi.fn(),
      removeExtension: vi.fn(),
      getExtension: vi.fn(),
      addGlobal: vi.fn(),
      getGlobal: vi.fn(),
      getTemplate: vi.fn(),
      express: vi.fn(),
      on: vi.fn(),
    } as unknown as nunjucks.Environment;

    vi.mocked(getNunjucksEngine).mockReturnValue(mockNunjucksEnv);
    vi.mocked(matchesClosedQa).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'test reason',
    });
  });

  it('should validate string value', async () => {
    const params: AssertionParams = {
      assertion: { type: 'pi' },
      baseType: 'pi',
      assertionValueContext: {
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
      assertionValueContext: {
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
      assertionValueContext: {
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
