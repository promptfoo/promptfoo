import {
  isGradingResult,
  TestCaseSchema,
  CommandLineOptionsSchema,
  TestSuiteConfigSchema,
} from '../../src/types';

describe('isGradingResult', () => {
  it('should return true for valid grading result object', () => {
    const validResult = {
      pass: true,
      score: 0.8,
      reason: 'Test passed',
    };
    expect(isGradingResult(validResult)).toBe(true);
  });

  it('should return true for grading result with optional fields', () => {
    const resultWithOptional = {
      pass: false,
      score: 0.2,
      reason: 'Test failed',
      namedScores: { accuracy: 0.5 },
      tokensUsed: { total: 100 },
      componentResults: [],
      assertion: { type: 'equals', value: 'expected' },
      comment: 'Needs improvement',
    };
    expect(isGradingResult(resultWithOptional)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isGradingResult(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isGradingResult('not an object')).toBe(false);
    expect(isGradingResult(123)).toBe(false);
    expect(isGradingResult(undefined)).toBe(false);
  });

  it('should return false if missing required fields', () => {
    expect(isGradingResult({ score: 1, reason: 'test' })).toBe(false);
    expect(isGradingResult({ pass: true, reason: 'test' })).toBe(false);
    expect(isGradingResult({ pass: true, score: 1 })).toBe(false);
  });

  it('should return false if fields have wrong types', () => {
    expect(
      isGradingResult({
        pass: 'true',
        score: '0.8',
        reason: 123,
      }),
    ).toBe(false);
  });

  it('should return false if optional fields have wrong types', () => {
    expect(
      isGradingResult({
        pass: true,
        score: 0.8,
        reason: 'test',
        namedScores: 'invalid',
        tokensUsed: 'invalid',
        componentResults: 'invalid',
        assertion: 'invalid',
        comment: 123,
      }),
    ).toBe(false);
  });
});

describe('TestCaseSchema assertScoringFunction', () => {
  it('should validate test case with valid file-based scoring function', () => {
    const testCase = {
      description: 'Test with file scoring',
      assertScoringFunction: 'file://path/to/score.js:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with valid custom scoring function', () => {
    const testCase = {
      description: 'Test with custom scoring',
      assertScoringFunction: async (scores: Record<string, number>) => {
        return {
          pass: scores.accuracy > 0.8,
          score: scores.accuracy,
          reason: 'Custom scoring applied',
        };
      },
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with missing assertScoringFunction', () => {
    const testCase = {
      description: 'No scoring function',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with python file scoring function', () => {
    const testCase = {
      description: 'Python scoring function',
      assertScoringFunction: 'file://path/to/score.py:score_func',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with typescript file scoring function', () => {
    const testCase = {
      description: 'TypeScript scoring function',
      assertScoringFunction: 'file://path/to/score.ts:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with file path containing dots', () => {
    const testCase = {
      description: 'File path with dots',
      assertScoringFunction: 'file://path/to/my.score.js:myNamespace.scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with absolute file path', () => {
    const testCase = {
      description: 'Absolute file path',
      assertScoringFunction: 'file:///absolute/path/to/score.js:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });

  it('should validate test case with relative file path', () => {
    const testCase = {
      description: 'Relative file path',
      assertScoringFunction: 'file://./relative/path/score.js:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow('Invalid test case schema');
  });
});

describe('CommandLineOptionsSchema', () => {
  it('should validate options with filterErrorsOnly string', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: 'true',
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });

  it('should validate options without filterErrorsOnly', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });

  it('should validate options with empty filterErrorsOnly string', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: '',
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });

  it('should validate options with non-boolean filterErrorsOnly string', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: 'errors-only',
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });

  it('should reject options with non-string filterErrorsOnly', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: true,
    };
    expect(() => CommandLineOptionsSchema.parse(options)).toThrow(
      'Expected string, received boolean',
    );
  });

  it('should validate options with filterErrorsOnly and other filter options', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: 'true',
      filterFailing: 'true',
      filterFirstN: 5,
      filterMetadata: 'meta',
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });

  it('should validate options with filterErrorsOnly and minimal required fields', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: 'true',
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });

  it('should validate options with all possible filter combinations', () => {
    const options = {
      providers: ['provider1'],
      output: ['output1'],
      filterErrorsOnly: 'true',
      filterFailing: 'true',
      filterFirstN: 10,
      filterMetadata: 'metadata',
      filterPattern: 'pattern',
      filterProviders: 'provider1',
      filterSample: 5,
      filterTargets: 'target1',
    };
    expect(() => CommandLineOptionsSchema.parse(options)).not.toThrow(
      'Invalid command line options',
    );
  });
});

describe('TestSuiteConfigSchema env property', () => {
  it('should validate config with string env values', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      env: {
        API_KEY: 'abc123',
        DEBUG: 'true',
      },
    };
    expect(() => TestSuiteConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate config with number env values converted to strings', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      env: {
        PORT: 3000,
        TIMEOUT: 5000,
      },
    };
    expect(() => TestSuiteConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate config with boolean env values converted to strings', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      env: {
        DEBUG: true,
        VERBOSE: false,
      },
    };
    expect(() => TestSuiteConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate config with undefined env property', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
    };
    expect(() => TestSuiteConfigSchema.parse(config)).not.toThrow();
  });
});
