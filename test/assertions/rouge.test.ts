import * as rouge from 'js-rouge';
import { handleRougeScore } from '../../src/assertions/rouge';

import type { Assertion, AssertionParams } from '../../src/types';

jest.mock('js-rouge', () => ({
  n: jest.fn(),
  l: jest.fn(),
  s: jest.fn(),
}));

describe('handleRougeScore', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockAssertion: Assertion = {
    type: 'rouge-n',
    value: 'expected text',
  };

  const baseParams: AssertionParams = {
    baseType: 'rouge-n' as any,
    assertion: mockAssertion,
    renderedValue: 'expected text',
    outputString: 'actual text',
    inverse: false,
    context: {
      prompt: 'test prompt',
      vars: {},
      test: { assert: [mockAssertion] },
      logProbs: undefined,
      provider: undefined,
      providerResponse: {
        raw: 'actual text',
        error: undefined,
        cached: false,
        cost: 0,
        tokenUsage: {},
      },
    },
    output: { text: 'actual text' },
    providerResponse: {
      raw: 'actual text',
      error: undefined,
      cached: false,
      cost: 0,
      tokenUsage: {},
    },
    test: { assert: [mockAssertion] },
  };

  it('should pass when score is above default threshold', () => {
    jest.mocked(rouge.n).mockReturnValue(0.8);

    const result = handleRougeScore(baseParams);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.8);
    expect(result.reason).toBe('ROUGE-N score 0.80 is greater than or equal to threshold 0.75');
    expect(rouge.n).toHaveBeenCalledWith('actual text', 'expected text', {});
  });

  it('should fail when score is below default threshold', () => {
    jest.mocked(rouge.n).mockReturnValue(0.7);

    const result = handleRougeScore(baseParams);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.7);
    expect(result.reason).toBe('ROUGE-N score 0.70 is less than threshold 0.75');
    expect(rouge.n).toHaveBeenCalledWith('actual text', 'expected text', {});
  });

  it('should use custom threshold when provided', () => {
    jest.mocked(rouge.n).mockReturnValue(0.6);

    const result = handleRougeScore({
      ...baseParams,
      assertion: { ...mockAssertion, threshold: 0.5 },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.6);
    expect(result.reason).toBe('ROUGE-N score 0.60 is greater than or equal to threshold 0.5');
    expect(rouge.n).toHaveBeenCalledWith('actual text', 'expected text', {});
  });

  it('should handle inverse scoring', () => {
    jest.mocked(rouge.n).mockReturnValue(0.8);

    const result = handleRougeScore({
      ...baseParams,
      inverse: true,
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(0.2, 5);
    expect(result.reason).toBe('ROUGE-N score 0.80 is less than threshold 0.75');
    expect(rouge.n).toHaveBeenCalledWith('actual text', 'expected text', {});
  });

  it('should use ROUGE-L method', () => {
    jest.mocked(rouge.l).mockReturnValue(0.8);

    const result = handleRougeScore({
      ...baseParams,
      baseType: 'rouge-l' as any,
    });

    expect(rouge.l).toHaveBeenCalledWith('actual text', 'expected text', {});
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('ROUGE-L score 0.80 is greater than or equal to threshold 0.75');
  });

  it('should use ROUGE-S method', () => {
    jest.mocked(rouge.s).mockReturnValue(0.8);

    const result = handleRougeScore({
      ...baseParams,
      baseType: 'rouge-s' as any,
    });

    expect(rouge.s).toHaveBeenCalledWith('actual text', 'expected text', {});
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('ROUGE-S score 0.80 is greater than or equal to threshold 0.75');
  });

  it('should throw error if renderedValue is not a string', () => {
    expect(() =>
      handleRougeScore({
        ...baseParams,
        renderedValue: 123 as any,
      }),
    ).toThrow('"rouge" assertion type must be a string value');
  });
});
