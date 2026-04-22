import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleClassifier } from '../../src/assertions/classifier';
import { matchesClassification } from '../../src/matchers/classification';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';

vi.mock('../../src/matchers/classification', () => ({
  matchesClassification: vi.fn(),
}));

const mockedMatchesClassification = vi.mocked(matchesClassification);

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

function createParams(overrides: Partial<AssertionParams> = {}): AssertionParams {
  return {
    assertion: {
      type: 'classifier',
      threshold: 0.7,
      value: 'safe',
    },
    baseType: 'classifier',
    renderedValue: 'safe',
    output: 'model output',
    outputString: 'model output',
    providerResponse: { output: 'model output' },
    test: {
      options: {
        provider: 'classification-provider',
      },
    } as AtomicTestCase,
    inverse: false,
    assertionValueContext: {
      vars: {},
      test: {} as AtomicTestCase,
      prompt: 'prompt',
      logProbs: undefined,
      provider: mockProvider,
      providerResponse: { output: 'model output' },
    },
    ...overrides,
  };
}

describe('handleClassifier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedMatchesClassification.mockResolvedValue({
      pass: true,
      score: 0.9,
      reason: 'classification passed',
    });
  });

  it('passes rendered values, thresholds, and test options to the classifier matcher', async () => {
    const params = createParams();

    await expect(handleClassifier(params)).resolves.toEqual({
      assertion: params.assertion,
      pass: true,
      score: 0.9,
      reason: 'classification passed',
    });

    expect(mockedMatchesClassification).toHaveBeenCalledWith(
      'safe',
      'model output',
      0.7,
      params.test.options,
    );
  });

  it('uses the default threshold and inverts matcher results for inverse assertions', async () => {
    mockedMatchesClassification.mockResolvedValue({
      pass: false,
      score: 0.25,
      reason: 'classification failed',
    });
    const params = createParams({
      assertion: {
        type: 'not-classifier',
        value: undefined,
      },
      renderedValue: undefined,
      inverse: true,
    });

    await expect(handleClassifier(params)).resolves.toEqual({
      assertion: params.assertion,
      pass: true,
      score: 0.75,
      reason: 'classification failed',
    });

    expect(mockedMatchesClassification).toHaveBeenCalledWith(
      undefined,
      'model output',
      1,
      params.test.options,
    );
  });

  it('rejects non-string classifier assertion values', async () => {
    const params = createParams({
      renderedValue: { label: 'safe' },
    });

    await expect(handleClassifier(params)).rejects.toThrow(
      '"classifier" assertion type must have a string value or be undefined',
    );
    expect(mockedMatchesClassification).not.toHaveBeenCalled();
  });
});
