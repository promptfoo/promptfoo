import fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';
import {
  AssertionSchema,
  BaseAssertionTypesSchema,
  isGradingResult,
  VarsSchema,
  TestSuiteConfigSchema,
} from '../src/types';

describe('AssertionSchema', () => {
  it('should validate a basic assertion', () => {
    const basicAssertion = {
      type: 'equals',
      value: 'expected value',
    };

    const result = AssertionSchema.safeParse(basicAssertion);
    expect(result.success).toBe(true);
  });

  it('should validate an assertion with all optional fields', () => {
    const fullAssertion = {
      type: 'similar',
      value: 'expected value',
      threshold: 0.8,
      weight: 2,
      provider: 'openai:gpt-3.5-turbo',
      rubricPrompt: 'Custom rubric prompt',
      metric: 'similarity_score',
      transform: 'toLowerCase()',
    };

    const result = AssertionSchema.safeParse(fullAssertion);
    expect(result.success).toBe(true);
  });

  it('should validate all base assertion types', () => {
    const baseTypes = BaseAssertionTypesSchema.options;

    baseTypes.forEach((type) => {
      const assertion = {
        type,
        value: 'test value',
      };

      const result = AssertionSchema.safeParse(assertion);
      expect(result.success).toBe(true);
    });
  });

  it('should validate "not-" prefixed assertion types', () => {
    const notPrefixedAssertion = {
      type: 'not-contains',
      value: 'unwanted value',
    };

    const result = AssertionSchema.safeParse(notPrefixedAssertion);
    expect(result.success).toBe(true);
  });

  it('should validate assertions with function values', () => {
    const functionAssertion = {
      type: 'equals',
      value: (output: string) => output === 'expected value',
    };

    const result = AssertionSchema.safeParse(functionAssertion);
    expect(result.success).toBe(true);
  });

  it('should validate assertions with array values', () => {
    const arrayAssertion = {
      type: 'contains-all',
      value: ['value1', 'value2', 'value3'],
    };

    const result = AssertionSchema.safeParse(arrayAssertion);
    expect(result.success).toBe(true);
  });

  it('should accept valid "not-" prefixed assertion types', () => {
    const validNotPrefixedAssertion = {
      type: 'not-contains',
      value: 'unwanted value',
    };

    const result = AssertionSchema.safeParse(validNotPrefixedAssertion);
    expect(result.success).toBe(true);
  });
});

describe('VarsSchema', () => {
  it('should validate and transform various types of values', () => {
    expect.assertions(8);
    const testCases = [
      { input: { key: 'string value' }, expected: { key: 'string value' } },
      { input: { key: 42 }, expected: { key: '42' } },
      { input: { key: true }, expected: { key: 'true' } },
      { input: { key: false }, expected: { key: 'false' } },
      { input: { key: ['a', 'b', 'c'] }, expected: { key: ['a', 'b', 'c'] } },
      { input: { key: [1, 2, 3] }, expected: { key: ['1', '2', '3'] } },
      { input: { key: [true, false] }, expected: { key: ['true', 'false'] } },
      { input: { key: [{ nested: 'object' }] }, expected: { key: [{ nested: 'object' }] } },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(VarsSchema.safeParse(input)).toEqual({ success: true, data: expected });
    });
  });

  it('should throw an error for invalid types', () => {
    expect.assertions(4);

    const invalidCases = [
      { key: null },
      { key: undefined },
      { key: Symbol('test') },
      { key: () => {} },
    ];

    invalidCases.forEach((invalidInput) => {
      expect(() => VarsSchema.parse(invalidInput)).toThrow(z.ZodError);
    });
  });
});

describe('isGradingResult', () => {
  it('should correctly identify valid GradingResult objects', () => {
    const validResults = [
      { pass: true, score: 1, reason: 'Perfect' },
      { pass: false, score: 0, reason: 'Failed', namedScores: { accuracy: 0 } },
      { pass: true, score: 0.5, reason: 'Partial', tokensUsed: { total: 100 } },
      { pass: true, score: 1, reason: 'Good', componentResults: [] },
      { pass: false, score: 0, reason: 'Bad', assertion: null },
      { pass: true, score: 1, reason: 'Excellent', comment: 'Great job!' },
    ];

    validResults.forEach((result) => {
      expect(isGradingResult(result)).toBe(true);
    });
  });

  it('should correctly identify invalid GradingResult objects', () => {
    const invalidResults = [
      {},
      { pass: 'true', score: 1, reason: 'Invalid pass type' },
      { pass: true, score: '1', reason: 'Invalid score type' },
      { pass: true, score: 1, reason: 42 },
      { pass: true, score: 1, reason: 'Valid', namedScores: 'invalid' },
      { pass: true, score: 1, reason: 'Valid', tokensUsed: 'invalid' },
      { pass: true, score: 1, reason: 'Valid', componentResults: 'invalid' },
      { pass: true, score: 1, reason: 'Valid', assertion: 'invalid' },
      { pass: true, score: 1, reason: 'Valid', comment: 42 },
    ];

    invalidResults.forEach((result) => {
      expect(isGradingResult(result)).toBe(false);
    });
  });
});

describe('TestSuiteConfigSchema', () => {
  const rootDir = path.join(__dirname, '..');
  const configFiles = globSync(`${rootDir}/examples/**/promptfooconfig.{yaml,yml,json}`);

  it('should find configuration files', () => {
    expect(configFiles.length).toBeGreaterThan(0);
  });

  for (const file of configFiles) {
    const relativePath = path.relative(rootDir, file);
    it(`should validate ${relativePath}`, async () => {
      const configContent = fs.readFileSync(file, 'utf8');
      const config = yaml.load(configContent);
      const result = TestSuiteConfigSchema.safeParse(config);
      if (!result.success) {
        console.error(`Validation failed for ${file}:`, result.error);
      }
      expect(result.success).toBe(true);
    });
  }
});
