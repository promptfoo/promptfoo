import fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';
import type { TestSuite } from '../src/types';
import {
  AssertionSchema,
  BaseAssertionTypesSchema,
  isGradingResult,
  VarsSchema,
  TestSuiteConfigSchema,
  TestSuiteSchema,
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
      provider: 'openai:gpt-4o-mini',
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
    expect.assertions(9);
    const testCases = [
      { input: { key: 'string value' }, expected: { key: 'string value' } },
      { input: { key: 42 }, expected: { key: 42 } },
      { input: { key: true }, expected: { key: true } },
      { input: { key: false }, expected: { key: false } },
      { input: { key: ['a', 'b', 'c'] }, expected: { key: ['a', 'b', 'c'] } },
      { input: { key: [1, 2, 3] }, expected: { key: [1, 2, 3] } },
      { input: { key: [true, false] }, expected: { key: [true, false] } },
      { input: { key: [{ nested: 'object' }] }, expected: { key: [{ nested: 'object' }] } },
      {
        input: { key: { arbitrary: 'value', nested: { object: true } } },
        expected: { key: { arbitrary: 'value', nested: { object: true } } },
      },
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
    it(`should validate ${path.relative(rootDir, file)}`, async () => {
      const configContent = fs.readFileSync(file, 'utf8');
      const config = yaml.load(configContent) as Record<string, unknown>;
      const extendedSchema = TestSuiteConfigSchema.extend({
        targets: z.union([TestSuiteConfigSchema.shape.providers, z.undefined()]),
        providers: z.union([TestSuiteConfigSchema.shape.providers, z.undefined()]),
        ...(typeof config.redteam !== 'undefined' && {
          prompts: z.optional(TestSuiteConfigSchema.shape.prompts),
        }),
      }).refine(
        (data) => {
          const hasTargets = Boolean(data.targets);
          const hasProviders = Boolean(data.providers);
          return (hasTargets && !hasProviders) || (!hasTargets && hasProviders);
        },
        {
          message: "Exactly one of 'targets' or 'providers' must be provided, but not both",
        },
      );

      const result = extendedSchema.safeParse(config);
      if (!result.success) {
        console.error(`Validation failed for ${file}:`, result.error);
      }
      expect(result.success).toBe(true);
    });
  }
});

describe('TestSuiteSchema', () => {
  const baseTestSuite: TestSuite = {
    providers: [
      {
        id: () => 'mock-provider',
        callApi: () => Promise.resolve({}),
      },
    ],
    prompts: [{ raw: 'Hello, world!', label: 'mock-prompt' }],
  };

  describe('extensions field', () => {
    it('should accept valid Python extension paths', () => {
      const validExtensions = [
        'file://path/to/file.py:function_name',
        'file://./relative/path.py:function_name',
        'file:///absolute/path.py:function_name',
      ];

      validExtensions.forEach((extension) => {
        const result = TestSuiteSchema.safeParse({ ...baseTestSuite, extensions: [extension] });
        expect(result.success).toBe(true);
      });
    });

    it('should accept valid JavaScript extension paths', () => {
      const validExtensions = [
        'file://path/to/file.js:function_name',
        'file://./relative/path.ts:function_name',
        'file:///absolute/path.mjs:function_name',
        'file://path/to/file.cjs:function_name',
      ];

      validExtensions.forEach((extension) => {
        const result = TestSuiteSchema.safeParse({ ...baseTestSuite, extensions: [extension] });
        expect(result.success).toBe(true);
      });
    });

    it.each([
      ['path/to/file.py:function_name', 'Missing file:// prefix'],
      ['file://path/to/file.txt:function_name', 'Invalid file extension'],
      ['file://path/to/file.py', 'Missing function name'],
      ['file://path/to/file.py:', 'Empty function name'],
      ['file://:function_name', 'Missing file path'],
      ['file://path/to/file.py:function_name:extra_arg', 'Extra argument'],
    ])('should reject invalid extension path: %s (%s)', (extension, reason) => {
      const result = TestSuiteSchema.safeParse({ ...baseTestSuite, extensions: [extension] });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/Extension must/);
    });

    it('should allow extensions field to be optional', () => {
      const result = TestSuiteSchema.safeParse({ ...baseTestSuite });
      expect(result.success).toBe(true);
    });

    it('should allow an empty array of extensions', () => {
      const result = TestSuiteSchema.safeParse({ ...baseTestSuite, extensions: [] });
      expect(result.success).toBe(true);
    });
  });
});
