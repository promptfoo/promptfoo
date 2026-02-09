import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSearchRubric } from '../../src/assertions/searchRubric';
import { matchesSearchRubric } from '../../src/matchers';

import type { Assertion, AssertionParams, GradingResult } from '../../src/types/index';

vi.mock('../../src/matchers');

describe('handleSearchRubric', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockMatchesSearchRubric = vi.mocked(matchesSearchRubric);

  const defaultParams: AssertionParams = {
    assertion: {
      type: 'search-rubric',
      value: 'test rubric',
    } as Assertion,
    baseType: 'search-rubric',
    assertionValueContext: {
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
      vars: { city: 'Tokyo' },
    },
    providerResponse: {
      output: 'The weather in Tokyo is sunny',
    },
  };

  it('should throw error when renderedValue is undefined', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: undefined,
    };

    await expect(handleSearchRubric(params)).rejects.toThrow(
      'search-rubric assertion type must have a string value',
    );
  });

  it('should call matchesSearchRubric with correct parameters', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: 'Contains accurate weather for Tokyo',
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'The output correctly states the weather in Tokyo',
    };

    mockMatchesSearchRubric.mockResolvedValue(expectedResult);

    const result = await handleSearchRubric(params);

    expect(result).toEqual(expectedResult);
    expect(mockMatchesSearchRubric).toHaveBeenCalledWith(
      'Contains accurate weather for Tokyo',
      'The weather in Tokyo is sunny',
      params.test.options,
      { city: 'Tokyo' },
      params.assertion,
      undefined,
      undefined, // providerCallContext
    );
  });

  it('should handle passing result', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: 'Correctly identifies Satya Nadella as CEO',
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Web search confirmed Satya Nadella is the current CEO of Microsoft',
    };

    mockMatchesSearchRubric.mockResolvedValue(expectedResult);

    const result = await handleSearchRubric(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle failing result', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: 'States correct Bitcoin price within 5%',
    };

    const expectedResult: GradingResult = {
      pass: false,
      score: 0,
      reason: 'The stated price is off by more than 50%',
    };

    mockMatchesSearchRubric.mockResolvedValue(expectedResult);

    const result = await handleSearchRubric(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should handle inverse assertion (not:search-rubric)', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      inverse: true,
      renderedValue: 'Contains outdated information',
    };

    const originalResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Information is current',
    };

    mockMatchesSearchRubric.mockResolvedValue(originalResult);

    const result = await handleSearchRubric(params);

    // Inverse should flip the pass value
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('requires web search verification');
  });

  it('should handle inverse assertion when original fails', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      inverse: true,
      renderedValue: 'Contains outdated information',
    };

    const originalResult: GradingResult = {
      pass: false,
      score: 0,
      reason: 'Information is outdated',
    };

    mockMatchesSearchRubric.mockResolvedValue(originalResult);

    const result = await handleSearchRubric(params);

    // Inverse should flip the pass value
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('does not require web search verification');
  });

  it('should pass provider to matchesSearchRubric', async () => {
    const mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn(),
    };

    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: 'test rubric',
      provider: mockProvider as any,
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test',
    };

    mockMatchesSearchRubric.mockResolvedValue(expectedResult);

    await handleSearchRubric(params);

    // Verify provider is passed as the 6th argument
    const calls = mockMatchesSearchRubric.mock.calls;
    expect(calls[0][5]).toBe(mockProvider);
  });

  it('should handle test.options being passed correctly', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      renderedValue: 'test rubric',
      test: {
        vars: { city: 'New York' },
        options: {
          provider: 'anthropic:messages:claude-opus-4-6',
        },
      },
    };

    const expectedResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'test',
    };

    mockMatchesSearchRubric.mockResolvedValue(expectedResult);

    await handleSearchRubric(params);

    // Verify the options and vars are passed correctly
    const calls = mockMatchesSearchRubric.mock.calls;
    expect(calls[0][2]).toEqual({ provider: 'anthropic:messages:claude-opus-4-6' });
    expect(calls[0][3]).toEqual({ city: 'New York' });
  });
});
