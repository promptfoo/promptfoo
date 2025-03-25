import { handleLevenshtein } from '../../src/assertions/levenshtein';

describe('handleLevenshtein', () => {
  it('should pass when strings are identical', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: 'test' },
      renderedValue: 'test',
      outputString: 'test',
      test: {},
      providerResponse: {
        output: 'test',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: 'test',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when distance is within default threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: 'test' },
      renderedValue: 'test',
      outputString: 'tast',
      test: {},
      providerResponse: {
        output: 'tast',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: 'tast',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should pass when distance is within custom threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: 'test', threshold: 2 },
      renderedValue: 'test',
      outputString: 'tist',
      test: {},
      providerResponse: {
        output: 'tist',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: 'tist',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when distance exceeds default threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: 'test' },
      renderedValue: 'test',
      outputString: 'completely different',
      test: {},
      providerResponse: {
        output: 'completely different',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: 'completely different',
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/Levenshtein distance \d+ is greater than threshold 5/);
  });

  it('should fail when distance exceeds custom threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: 'test', threshold: 0 },
      renderedValue: 'test',
      outputString: 'tast',
      test: {},
      providerResponse: {
        output: 'tast',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: 'tast',
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/Levenshtein distance \d+ is greater than threshold 0/);
  });

  it('should throw error when renderedValue is not a string', () => {
    expect(() => {
      handleLevenshtein({
        assertion: { type: 'levenshtein', value: 'test' },
        renderedValue: 123 as any,
        outputString: 'test',
        test: {},
        providerResponse: {
          output: 'test',
          tokenUsage: {},
        },
        baseType: 'levenshtein' as any,
        context: {} as any,
        inverse: false,
        output: 'test',
      });
    }).toThrow('"levenshtein" assertion type must have a string value');
  });

  it('should handle empty strings', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: '' },
      renderedValue: '',
      outputString: '',
      test: {},
      providerResponse: {
        output: '',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: '',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle strings with special characters', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', value: 'test!@#$' },
      renderedValue: 'test!@#$',
      outputString: 'test!@#$',
      test: {},
      providerResponse: {
        output: 'test!@#$',
        tokenUsage: {},
      },
      baseType: 'levenshtein' as any,
      context: {} as any,
      inverse: false,
      output: 'test!@#$',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });
});
