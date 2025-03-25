import * as rouge from 'js-rouge';
import { handleRougeScore } from '../../src/assertions/rouge';

jest.mock('js-rouge', () => ({
  n: jest.fn(),
  l: jest.fn(),
  s: jest.fn(),
}));

describe('handleRougeScore', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const defaultParams: any = {
    baseType: 'rouge-n',
    assertion: { type: 'rouge-n' },
    renderedValue: 'expected text',
    outputString: 'actual text',
    inverse: false,
    context: {},
    output: {},
    providerResponse: {},
    test: {},
  };

  it('should calculate ROUGE-N score correctly', () => {
    jest.mocked(rouge.n).mockReturnValue(0.8);

    const result = handleRougeScore(defaultParams);

    expect(rouge.n).toHaveBeenCalledWith('actual text', 'expected text', {});
    expect(result).toEqual({
      pass: true,
      score: 0.8,
      reason: 'ROUGE-N score 0.80 is greater than or equal to threshold 0.75',
      assertion: { type: 'rouge-n' },
    });
  });

  it('should calculate ROUGE-L score correctly', () => {
    jest.mocked(rouge.l).mockReturnValue(0.7);

    const result = handleRougeScore({
      ...defaultParams,
      baseType: 'rouge-l',
      assertion: { type: 'rouge-l' },
    });

    expect(rouge.l).toHaveBeenCalledWith('actual text', 'expected text', {});
    expect(result).toEqual({
      pass: false,
      score: 0.7,
      reason: 'ROUGE-L score 0.70 is less than threshold 0.75',
      assertion: { type: 'rouge-l' },
    });
  });

  it('should calculate ROUGE-S score correctly', () => {
    jest.mocked(rouge.s).mockReturnValue(0.9);

    const result = handleRougeScore({
      ...defaultParams,
      baseType: 'rouge-s',
      assertion: { type: 'rouge-s' },
    });

    expect(rouge.s).toHaveBeenCalledWith('actual text', 'expected text', {});
    expect(result).toEqual({
      pass: true,
      score: 0.9,
      reason: 'ROUGE-S score 0.90 is greater than or equal to threshold 0.75',
      assertion: { type: 'rouge-s' },
    });
  });

  it('should use custom threshold when provided', () => {
    jest.mocked(rouge.n).mockReturnValue(0.6);

    const result = handleRougeScore({
      ...defaultParams,
      assertion: { type: 'rouge-n', threshold: 0.5 },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('threshold 0.5');
  });

  it('should handle inverse scoring', () => {
    jest.mocked(rouge.n).mockReturnValue(0.8);

    const result = handleRougeScore({
      ...defaultParams,
      inverse: true,
    });

    expect(result).toEqual({
      pass: false,
      score: 0.19999999999999996,
      reason: 'ROUGE-N score 0.80 is less than threshold 0.75',
      assertion: { type: 'rouge-n' },
    });
  });

  it('should throw error for non-string rendered value', () => {
    expect(() => {
      handleRougeScore({
        ...defaultParams,
        renderedValue: 123 as any,
      });
    }).toThrow('"rouge" assertion type must be a string value');
  });

  it('should use default threshold when not provided', () => {
    jest.mocked(rouge.n).mockReturnValue(0.76);

    const result = handleRougeScore({
      ...defaultParams,
      assertion: { type: 'rouge-n' },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('threshold 0.75');
  });
});
