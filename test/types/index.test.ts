import fs from 'fs';
import path from 'path';

import Ajv from 'ajv';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AssertionSchema,
  BaseAssertionTypesSchema,
  CommandLineOptionsSchema,
  GradingConfigSchema,
  isGradingResult,
  OutputConfigSchema,
  TestCaseSchema,
  TestSuiteConfigSchema,
  TestSuiteSchema,
  UnifiedConfigSchema,
  VarsSchema,
} from '../../src/types/index';
import { PromptConfigSchema } from '../../src/validators/prompts';

import type { TestSuite } from '../../src/types/index';

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

describe('TestCaseSchema with showVars', () => {
  it('should accept showVars in options', () => {
    const testCase = {
      vars: { input: 'test' },
      options: { showVars: ['input'] },
    };
    expect(TestCaseSchema.safeParse(testCase).success).toBe(true);
  });

  it('should reject non-string values in showVars', () => {
    const testCase = {
      vars: { input: 'test' },
      options: { showVars: [123, true] },
    };
    expect(TestCaseSchema.safeParse(testCase).success).toBe(false);
  });
});

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

  it('should correctly identify valid GradingResult objects', () => {
    const validResults = [
      { pass: true, score: 1, reason: 'Perfect' },
      { pass: false, score: 0, reason: 'Failed', namedScores: { accuracy: 0 } },
      { pass: true, score: 0.5, reason: 'Partial', tokensUsed: { total: 100 } },
      { pass: true, score: 1, reason: 'Good', componentResults: [] },
      { pass: false, score: 0, reason: 'Bad' },
      { pass: true, score: 1, reason: 'Excellent', comment: 'Great job!' },
    ];

    validResults.forEach((result) => {
      expect(isGradingResult(result)).toBe(true);
    });
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

// Tests for #7096: Ensure TestCaseSchema.options accepts properties from all merged schemas
// This was broken when z.intersection() generated allOf with additionalProperties:false
describe('TestCaseSchema options (merged schema properties)', () => {
  it('should validate options with properties from PromptConfigSchema', () => {
    const testCase = {
      vars: { input: 'test' },
      options: {
        prefix: 'You are a helpful assistant.',
        suffix: 'Please be concise.',
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate options with properties from OutputConfigSchema', () => {
    const testCase = {
      vars: { input: 'test' },
      options: {
        transform: 'output.toUpperCase()',
        storeOutputAs: 'myOutput',
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate options with properties from GradingConfigSchema', () => {
    const testCase = {
      vars: { input: 'test' },
      options: {
        provider: 'openai:gpt-4o-mini',
        rubricPrompt: 'Grade the response',
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate options with additional properties (disableVarExpansion, etc)', () => {
    const testCase = {
      vars: { input: 'test' },
      options: {
        disableVarExpansion: true,
        disableConversationVar: true,
        runSerially: true,
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate options combining properties from ALL merged schemas', () => {
    // This is the critical test - properties from different sub-schemas must work together
    const testCase = {
      vars: { question: 'What is 2+2?' },
      options: {
        // From PromptConfigSchema
        prefix: 'You are a helpful assistant.',
        suffix: 'Be concise.',
        // From OutputConfigSchema
        transform: 'output.trim()',
        storeOutputAs: 'answer',
        // From GradingConfigSchema
        provider: 'openai:gpt-4o-mini',
        rubricPrompt: 'Check if the answer is correct',
        // Additional properties
        disableVarExpansion: false,
        disableConversationVar: true,
        runSerially: false,
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate options with provider as object config', () => {
    const testCase = {
      vars: { input: 'test' },
      options: {
        provider: {
          id: 'openai:gpt-4o-mini',
          config: {
            temperature: 0,
          },
        },
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should allow provider-specific properties in options via catchall', () => {
    const testCase = {
      vars: { input: 'test' },
      options: {
        provider: 'openai:gpt-4o-mini',
        // Provider-specific options like response_format, temperature, etc. should pass through
        response_format: { type: 'json_object' },
        custom_option: 'custom_value',
      },
    };
    const result = TestCaseSchema.parse(testCase);
    // catchall(z.any()) allows provider-specific options to pass through for per-test structured output
    expect(result.options).toHaveProperty('provider', 'openai:gpt-4o-mini');
    expect(result.options).toHaveProperty('response_format', { type: 'json_object' });
    expect(result.options).toHaveProperty('custom_option', 'custom_value');
  });
});

// Tests for metadata schema - ensure custom keys are allowed alongside internal properties
// This was broken when z.intersection() generated allOf with additionalProperties:false
describe('TestCaseSchema metadata (custom keys support)', () => {
  it('should validate metadata with custom user-defined keys', () => {
    const testCase = {
      vars: { input: 'test' },
      metadata: {
        customKey: 'custom value',
        anotherKey: 123,
        nestedData: { foo: 'bar' },
      },
    };
    const result = TestCaseSchema.parse(testCase);
    expect(result.metadata).toHaveProperty('customKey', 'custom value');
    expect(result.metadata).toHaveProperty('anotherKey', 123);
    expect(result.metadata).toHaveProperty('nestedData');
  });

  it('should validate metadata with internal pluginConfig property', () => {
    const testCase = {
      vars: { input: 'test' },
      metadata: {
        pluginConfig: { someConfig: 'value' },
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate metadata with internal strategyConfig property', () => {
    const testCase = {
      vars: { input: 'test' },
      metadata: {
        strategyConfig: { anotherConfig: 'value' },
      },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate metadata combining internal properties with custom keys', () => {
    // This is the critical test - internal properties and custom keys must coexist
    const testCase = {
      vars: { input: 'test' },
      metadata: {
        // Internal properties
        pluginConfig: { pluginOption: true },
        strategyConfig: { strategyOption: 'abc' },
        // Custom user-defined keys
        customTag: 'my-tag',
        experimentId: 12345,
        additionalInfo: { nested: { deeply: 'value' } },
      },
    };
    const result = TestCaseSchema.parse(testCase);
    expect(result.metadata).toHaveProperty('pluginConfig');
    expect(result.metadata).toHaveProperty('strategyConfig');
    expect(result.metadata).toHaveProperty('customTag', 'my-tag');
    expect(result.metadata).toHaveProperty('experimentId', 12345);
    expect(result.metadata).toHaveProperty('additionalInfo');
  });
});

// Guard tests to ensure merged schemas don't have overlapping keys
// This prevents silent overwrites when spreading .shape properties
describe('TestCaseSchema options merged schema guard', () => {
  it('should have no overlapping keys between PromptConfigSchema and OutputConfigSchema', () => {
    const promptKeys = Object.keys(PromptConfigSchema.shape);
    const outputKeys = Object.keys(OutputConfigSchema.shape);
    const overlap = promptKeys.filter((key) => outputKeys.includes(key));
    expect(overlap).toEqual([]);
  });

  it('should have no overlapping keys between PromptConfigSchema and GradingConfigSchema', () => {
    const promptKeys = Object.keys(PromptConfigSchema.shape);
    const gradingKeys = Object.keys(GradingConfigSchema.shape);
    const overlap = promptKeys.filter((key) => gradingKeys.includes(key));
    expect(overlap).toEqual([]);
  });

  it('should have no overlapping keys between OutputConfigSchema and GradingConfigSchema', () => {
    const outputKeys = Object.keys(OutputConfigSchema.shape);
    const gradingKeys = Object.keys(GradingConfigSchema.shape);
    const overlap = outputKeys.filter((key) => gradingKeys.includes(key));
    expect(overlap).toEqual([]);
  });

  it('should have no overlapping keys with additional options properties', () => {
    const additionalKeys = ['disableVarExpansion', 'disableConversationVar', 'runSerially'];
    const allSchemaKeys = [
      ...Object.keys(PromptConfigSchema.shape),
      ...Object.keys(OutputConfigSchema.shape),
      ...Object.keys(GradingConfigSchema.shape),
    ];
    const overlap = additionalKeys.filter((key) => allSchemaKeys.includes(key));
    expect(overlap).toEqual([]);
  });
});

// AJV-based regression test for #7096
// Validates that the generated JSON schema accepts combined options properties
describe('JSON Schema validation (AJV)', () => {
  it('should validate defaultTest.options with combined properties against config-schema.json', () => {
    const schemaPath = path.join(__dirname, '../../site/static/config-schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);

    // Config with combined options from all merged schemas
    const config = {
      prompts: ['test prompt'],
      providers: ['echo'],
      defaultTest: {
        options: {
          // From PromptConfigSchema
          prefix: 'You are helpful.',
          suffix: 'Be concise.',
          // From OutputConfigSchema
          transform: 'output.trim()',
          // From GradingConfigSchema
          provider: 'openai:gpt-4o-mini',
          // Additional properties
          disableVarExpansion: false,
        },
      },
      tests: [{ vars: { input: 'test' } }],
    };

    const valid = validate(config);
    if (!valid) {
      // Filter to show only the relevant errors (not the anyOf noise)
      const relevantErrors = validate.errors?.filter(
        (e) => e.instancePath.includes('options') && e.keyword === 'additionalProperties',
      );
      expect(relevantErrors).toEqual([]);
    }
    expect(valid).toBe(true);
  });

  it('should validate test metadata with custom keys against config-schema.json', () => {
    const schemaPath = path.join(__dirname, '../../site/static/config-schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);

    // Config with custom metadata keys
    const config = {
      prompts: ['test prompt'],
      providers: ['echo'],
      tests: [
        {
          vars: { input: 'test' },
          metadata: {
            customTag: 'my-tag',
            experimentId: 12345,
            pluginConfig: { option: true },
          },
        },
      ],
    };

    const valid = validate(config);
    if (!valid) {
      const relevantErrors = validate.errors?.filter(
        (e) => e.instancePath.includes('metadata') && e.keyword === 'additionalProperties',
      );
      expect(relevantErrors).toEqual([]);
    }
    expect(valid).toBe(true);
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
      'Invalid input: expected string, received boolean',
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

describe('TestSuiteConfigSchema', () => {
  const rootDir = path.join(__dirname, '../..');
  const configFiles = globSync(`${rootDir}/examples/**/promptfooconfig.{yaml,yml,json}`, {
    windowsPathsNoEscape: true,
  });

  it('should find configuration files', () => {
    expect(configFiles.length).toBeGreaterThan(0);
  });

  describe('env property', () => {
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

    it('should validate env field with primitive values that get transformed to strings', () => {
      const customEnvVars = {
        CUSTOM_STRING_VALUE: 'string-value',
        CUSTOM_NUMBER_VALUE: 42,
        CUSTOM_BOOLEAN_TRUE: true,
        CUSTOM_BOOLEAN_FALSE: false,
      };

      const recordSchema = z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean()]).transform(String),
      );
      const recordResult = recordSchema.safeParse(customEnvVars);

      expect(recordResult.success).toBe(true);

      const parsedData = recordResult.success ? recordResult.data : {};

      expect(parsedData.CUSTOM_STRING_VALUE).toBe('string-value');
      expect(parsedData.CUSTOM_NUMBER_VALUE).toBe('42');
      expect(parsedData.CUSTOM_BOOLEAN_TRUE).toBe('true');
      expect(parsedData.CUSTOM_BOOLEAN_FALSE).toBe('false');

      const config = {
        providers: [{ id: 'test-provider' }],
        prompts: ['test prompt'],
        env: customEnvVars,
      };

      const result = TestSuiteConfigSchema.safeParse(config);

      expect(result.success).toBe(true);

      const testProvider = result.success
        ? {
            id: 'test-provider',
            config: { someConfig: true },
            env: result.data.env,
          }
        : { id: 'test-provider', config: { someConfig: true } };

      expect(Object.keys(testProvider)).toContain('env');
    });
  });

  describe('extensions field', () => {
    const minimalConfig = {
      providers: ['provider1'],
      prompts: ['prompt1'],
    };

    it('should accept null extensions', () => {
      const config = {
        ...minimalConfig,
        extensions: null,
      };
      const result = TestSuiteConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept undefined extensions (optional field)', () => {
      const config = { ...minimalConfig };
      // Explicitly not setting extensions
      const result = TestSuiteConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept empty array extensions', () => {
      const config = {
        ...minimalConfig,
        extensions: [],
      };
      const result = TestSuiteConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept array of extension strings', () => {
      const config = {
        ...minimalConfig,
        extensions: ['file://path/to/extension.js:functionName'],
      };
      const result = TestSuiteConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should transform and remove null, undefined, and empty array extensions', () => {
      // We need to use UnifiedConfigSchema for transformation tests
      // since the transform is applied there
      const configs = [
        { ...minimalConfig, extensions: null },
        { ...minimalConfig }, // undefined extensions
        { ...minimalConfig, extensions: [] },
      ];

      configs.forEach((config) => {
        const result = UnifiedConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        // Only access data properties if we're sure parsing succeeded
        expect(result).toEqual(
          expect.objectContaining({
            success: true,
            data: expect.not.objectContaining({ extensions: expect.anything() }),
          }),
        );
      });
    });

    it('should keep non-empty extensions arrays', () => {
      const config = {
        ...minimalConfig,
        extensions: ['file://path/to/extension.js:functionName'],
      };

      const result = UnifiedConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      // Only access data properties if we're sure parsing succeeded
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            extensions: ['file://path/to/extension.js:functionName'],
          }),
        }),
      );
    });
  });

  describe('defaultTest validation', () => {
    it('should accept string defaultTest starting with file://', () => {
      const validConfig = {
        providers: ['openai:gpt-4'],
        prompts: ['Test prompt'],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: 'file://path/to/defaultTest.yaml',
      };

      const result = TestSuiteConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      expect(result.data!.defaultTest).toBe('file://path/to/defaultTest.yaml');
    });

    it('should reject string defaultTest not starting with file://', () => {
      const invalidConfig = {
        providers: ['openai:gpt-4'],
        prompts: ['Test prompt'],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: 'invalid/path.yaml',
      };

      const result = TestSuiteConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should accept partial TestCase object for defaultTest', () => {
      const validConfig = {
        providers: ['openai:gpt-4'],
        prompts: ['Test prompt'],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: {
          assert: [{ type: 'contains', value: 'test' }],
          vars: { default: true },
          threshold: 0.8,
        },
      };

      const result = TestSuiteConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      expect(result.data!.defaultTest).toEqual({
        assert: [{ type: 'contains', value: 'test' }],
        vars: { default: true },
        threshold: 0.8,
      });
    });

    it('should accept defaultTest with description field (it will be stripped)', () => {
      const configWithDescription = {
        providers: ['openai:gpt-4'],
        prompts: ['Test prompt'],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: {
          description: 'This will be stripped by omit()',
          assert: [{ type: 'equals', value: 'test' }],
        },
      };

      const result = TestSuiteConfigSchema.safeParse(configWithDescription);
      expect(result.success).toBe(true);
      // The description field should be stripped from the parsed result
      expect(result.data!.defaultTest).toEqual({
        assert: [{ type: 'equals', value: 'test' }],
      });
      expect((result.data!.defaultTest as any).description).toBeUndefined();
    });
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
          error: "Exactly one of 'targets' or 'providers' must be provided, but not both",
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

describe('UnifiedConfigSchema extensions handling', () => {
  it('should remove null extensions', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      extensions: null,
    };
    const parsed = UnifiedConfigSchema.parse(config);
    expect(parsed.extensions).toBeUndefined();
  });

  it('should remove undefined extensions', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      extensions: undefined,
    };
    const parsed = UnifiedConfigSchema.parse(config);
    expect(parsed.extensions).toBeUndefined();
  });

  it('should remove empty array extensions', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      extensions: [],
    };
    const parsed = UnifiedConfigSchema.parse(config);
    expect(parsed.extensions).toBeUndefined();
  });

  it('should preserve valid extensions array', () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      extensions: ['ext1', 'ext2'],
    };
    const parsed = UnifiedConfigSchema.parse(config);
    expect(parsed.extensions).toEqual(['ext1', 'ext2']);
  });

  it('should transform targets to providers when only targets is present', () => {
    const config = {
      targets: ['target1', 'target2'],
      prompts: ['prompt1'],
    };
    const parsed = UnifiedConfigSchema.parse(config);
    expect(parsed.providers).toEqual(['target1', 'target2']);
    expect(parsed.targets).toBeUndefined();
  });

  it('should throw an error when both targets and providers are present', () => {
    const config = {
      providers: ['provider1', 'provider2'],
      targets: ['target1', 'target2'],
      prompts: ['prompt1'],
    };
    expect(() => UnifiedConfigSchema.parse(config)).toThrow(
      "Exactly one of 'targets' or 'providers' must be provided, but not both",
    );
  });
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
    it('should allow null extensions', () => {
      const suite = {
        providers: [{ id: () => 'provider1', callApi: () => Promise.resolve({}) }],
        prompts: [{ raw: 'prompt1', label: 'test' }],
        extensions: null,
      };
      expect(() => TestSuiteSchema.parse(suite)).not.toThrow();
    });

    it('should allow undefined extensions', () => {
      const suite = {
        providers: [{ id: () => 'provider1', callApi: () => Promise.resolve({}) }],
        prompts: [{ raw: 'prompt1', label: 'test' }],
      };
      expect(() => TestSuiteSchema.parse(suite)).not.toThrow();
    });

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
    ])('should reject invalid extension path: %s (%s)', (extension, _reason) => {
      const result = TestSuiteSchema.safeParse({ ...baseTestSuite, extensions: [extension] });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toMatch(/Extension must/);
    });

    it('should allow an empty array of extensions', () => {
      const result = TestSuiteSchema.safeParse({ ...baseTestSuite, extensions: [] });
      expect(result.success).toBe(true);
    });
  });

  describe('defaultTest validation', () => {
    it('should accept string defaultTest starting with file://', () => {
      const validConfig = {
        providers: [
          {
            id: () => 'openai:gpt-4',
            callApi: async () => ({ output: 'test' }),
          },
        ],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: 'file://path/to/defaultTest.yaml',
      };

      const result = TestSuiteSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      expect(result.data!.defaultTest).toBe('file://path/to/defaultTest.yaml');
    });

    it('should reject string defaultTest not starting with file://', () => {
      const invalidConfig = {
        providers: [
          {
            id: () => 'openai:gpt-4',
            callApi: async () => ({ output: 'test' }),
          },
        ],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: 'invalid/path.yaml',
      };

      const result = TestSuiteSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      expect(result.error!.issues[0].message).toContain(
        'defaultTest string must start with file://',
      );
    });

    it('should accept object defaultTest', () => {
      const validConfig = {
        providers: [
          {
            id: () => 'openai:gpt-4',
            callApi: async () => ({ output: 'test' }),
          },
        ],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: {
          assert: [{ type: 'equals', value: 'test' }],
          vars: { foo: 'bar' },
          options: { provider: 'openai:gpt-4' },
        },
      };

      const result = TestSuiteSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      expect(result.data!.defaultTest).toEqual(
        expect.objectContaining({
          assert: [{ type: 'equals', value: 'test' }],
          vars: { foo: 'bar' },
        }),
      );
    });

    it('should accept undefined defaultTest', () => {
      const validConfig = {
        providers: [
          {
            id: () => 'openai:gpt-4',
            callApi: async () => ({ output: 'test' }),
          },
        ],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{ vars: { test: 'value' } }],
      };

      const result = TestSuiteSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      expect(result.data!.defaultTest).toBeUndefined();
    });
  });
});
