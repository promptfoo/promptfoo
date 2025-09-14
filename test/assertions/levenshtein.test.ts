import { handleLevenshtein } from '../../src/assertions/levenshtein';

describe('handleLevenshtein', () => {
  it('should pass when strings are identical', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: 'test',
      outputString: 'test',
      test: {},
      providerResponse: {
        output: 'test',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: 'test', tokenUsage: {} },
      },
      inverse: false,
      output: 'test',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should pass when distance is within default threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: 'test',
      outputString: 'tast', // Distance of 1
      test: {},
      providerResponse: {
        output: 'tast',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: 'tast', tokenUsage: {} },
      },
      inverse: false,
      output: 'tast',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should pass when distance is within custom threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', threshold: 2 },
      renderedValue: 'test',
      outputString: 'tost', // Distance of 1
      test: {},
      providerResponse: {
        output: 'tost',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: 'tost', tokenUsage: {} },
      },
      inverse: false,
      output: 'tost',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when distance exceeds threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', threshold: 1 },
      renderedValue: 'test',
      outputString: 'toast', // Distance of 2
      test: {},
      providerResponse: {
        output: 'toast',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: 'toast', tokenUsage: {} },
      },
      inverse: false,
      output: 'toast',
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('Levenshtein distance 2 is greater than threshold 1');
  });

  it('should fail when distance exceeds default threshold', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: 'test',
      outputString: 'completely different', // Distance > 5
      test: {},
      providerResponse: {
        output: 'completely different',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: 'completely different', tokenUsage: {} },
      },
      inverse: false,
      output: 'completely different',
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should throw error when renderedValue is not a string', () => {
    expect(() =>
      handleLevenshtein({
        assertion: { type: 'levenshtein' },
        renderedValue: 123 as any,
        outputString: 'test',
        test: {},
        providerResponse: {
          output: 'test',
          tokenUsage: {},
        },
        baseType: 'contains' as any,
        context: {
          prompt: '',
          vars: {},
          test: {},
          logProbs: undefined,
          provider: {} as any,
          providerResponse: { output: 'test', tokenUsage: {} },
        },
        inverse: false,
        output: 'test',
      }),
    ).toThrow('"levenshtein" assertion type must have a string value');
  });

  it('should handle empty strings', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein' },
      renderedValue: '',
      outputString: '',
      test: {},
      providerResponse: {
        output: '',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: '', tokenUsage: {} },
      },
      inverse: false,
      output: '',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle long strings', () => {
    const result = handleLevenshtein({
      assertion: { type: 'levenshtein', threshold: 10 },
      renderedValue: 'this is a very long string to test',
      outputString: 'this is a vary long string to test',
      test: {},
      providerResponse: {
        output: 'this is a vary long string to test',
        tokenUsage: {},
      },
      baseType: 'contains' as any,
      context: {
        prompt: '',
        vars: {},
        test: {},
        logProbs: undefined,
        provider: {} as any,
        providerResponse: { output: 'this is a vary long string to test', tokenUsage: {} },
      },
      inverse: false,
      output: 'this is a vary long string to test',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });
});
