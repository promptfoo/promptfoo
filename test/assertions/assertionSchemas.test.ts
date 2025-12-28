import { describe, expect, it } from 'vitest';
import {
  validateAssertionValue,
  validateAssertionValues,
  supportsThreshold,
  requiresValue,
  createAssertionSchema,
  VALUE_TYPE_SCHEMAS,
} from '../../src/assertions/assertionSchemas';
import type { Assertion } from '../../src/types/index';

describe('assertionSchemas', () => {
  describe('VALUE_TYPE_SCHEMAS', () => {
    it('should have schemas for all value types', () => {
      const valueTypes = [
        'none', 'string', 'text', 'regex', 'code',
        'array', 'number', 'reference', 'schema', 'custom'
      ];
      for (const type of valueTypes) {
        expect(VALUE_TYPE_SCHEMAS[type as keyof typeof VALUE_TYPE_SCHEMAS]).toBeDefined();
      }
    });

    it('should validate string values', () => {
      const schema = VALUE_TYPE_SCHEMAS.string;
      expect(schema.safeParse('hello').success).toBe(true);
      expect(schema.safeParse(123).success).toBe(true); // Numbers allowed
      expect(schema.safeParse('file://test.js').success).toBe(true);
      expect(schema.safeParse('package:test').success).toBe(true);
    });

    it('should validate array values', () => {
      const schema = VALUE_TYPE_SCHEMAS.array;
      expect(schema.safeParse(['a', 'b', 'c']).success).toBe(true);
      expect(schema.safeParse('a,b,c').success).toBe(true); // Comma-separated
      expect(schema.safeParse('file://test.js').success).toBe(true);
    });

    it('should validate number values', () => {
      const schema = VALUE_TYPE_SCHEMAS.number;
      expect(schema.safeParse(100).success).toBe(true);
      expect(schema.safeParse('100').success).toBe(true);
      expect(schema.safeParse('file://test.js').success).toBe(true);
    });

    it('should validate schema values', () => {
      const schema = VALUE_TYPE_SCHEMAS.schema;
      expect(schema.safeParse({ type: 'object' }).success).toBe(true);
      expect(schema.safeParse('type: object').success).toBe(true);
      expect(schema.safeParse(undefined).success).toBe(true); // Optional
    });
  });

  describe('supportsThreshold', () => {
    it('should return true for assertions that support threshold', () => {
      expect(supportsThreshold('similar')).toBe(true);
      expect(supportsThreshold('bleu')).toBe(true);
      expect(supportsThreshold('levenshtein')).toBe(true);
      expect(supportsThreshold('context-faithfulness')).toBe(true);
    });

    it('should return false for assertions that do not support threshold', () => {
      expect(supportsThreshold('contains')).toBe(false);
      expect(supportsThreshold('equals')).toBe(false);
      expect(supportsThreshold('is-json')).toBe(false);
    });

    it('should handle not- prefix', () => {
      expect(supportsThreshold('not-similar')).toBe(true);
      expect(supportsThreshold('not-contains')).toBe(false);
    });
  });

  describe('requiresValue', () => {
    it('should return true for assertions that require values', () => {
      expect(requiresValue('contains')).toBe(true);
      expect(requiresValue('equals')).toBe(true);
      expect(requiresValue('llm-rubric')).toBe(true);
      expect(requiresValue('similar')).toBe(true);
    });

    it('should return false for assertions with valueType none', () => {
      expect(requiresValue('is-json')).toBe(false);
      expect(requiresValue('is-xml')).toBe(false);
      expect(requiresValue('moderation')).toBe(false);
    });

    it('should return false for assertions with valueType schema (optional)', () => {
      // is-json with schema is optional
      expect(requiresValue('is-json')).toBe(false);
    });

    it('should handle not- prefix', () => {
      expect(requiresValue('not-contains')).toBe(true);
      expect(requiresValue('not-is-json')).toBe(false);
    });
  });

  describe('validateAssertionValue', () => {
    it('should validate a valid contains assertion', () => {
      const assertion: Assertion = {
        type: 'contains',
        value: 'hello world',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error when required value is missing', () => {
      const assertion: Assertion = {
        type: 'contains',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('requires a value');
    });

    it('should warn when value is provided for none-type assertion', () => {
      // Use moderation which has valueType: 'none'
      const assertion: Assertion = {
        type: 'moderation',
        value: 'unused value',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('does not use a value');
    });

    it('should warn when threshold is used with unsupported assertion', () => {
      const assertion: Assertion = {
        type: 'contains',
        value: 'hello',
        threshold: 0.8,
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
      expect(result.warnings[0]).toContain('does not support threshold');
    });

    it('should validate threshold is in valid range', () => {
      const assertion: Assertion = {
        type: 'similar',
        value: 'expected output',
        threshold: 1.5, // Invalid - must be 0-1
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Threshold must be a number between 0 and 1');
    });

    it('should accept file references', () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'file://custom-assert.js',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
    });

    it('should accept package references', () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'package:my-assertion',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
    });

    it('should warn for unknown assertion types', () => {
      const assertion: Assertion = {
        type: 'unknown-type' as any,
        value: 'test',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true); // Unknown types are allowed
      expect(result.warnings[0]).toContain('Unknown assertion type');
    });

    it('should skip validation for redteam assertions', () => {
      const assertion: Assertion = {
        type: 'promptfoo:redteam:jailbreak' as any,
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle not- prefix assertions', () => {
      const assertion: Assertion = {
        type: 'not-contains',
        value: 'bad content',
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
    });

    it('should validate array values for contains-all', () => {
      const assertion: Assertion = {
        type: 'contains-all',
        value: ['foo', 'bar', 'baz'],
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
    });

    it('should validate numeric values for cost assertion', () => {
      const assertion: Assertion = {
        type: 'cost',
        value: 0.01,
      };
      const result = validateAssertionValue(assertion, 'test');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAssertionValues', () => {
    it('should validate multiple assertions', () => {
      const assertions: Assertion[] = [
        { type: 'contains', value: 'hello' },
        { type: 'is-json' },
        { type: 'similar', value: 'expected', threshold: 0.8 },
      ];
      const result = validateAssertionValues(assertions, 'test.assert');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should aggregate errors from multiple assertions', () => {
      const assertions: Assertion[] = [
        { type: 'contains' }, // Missing value
        { type: 'equals' }, // Missing value
      ];
      const result = validateAssertionValues(assertions, 'test.assert');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createAssertionSchema', () => {
    it('should create a schema for contains assertion', () => {
      const schema = createAssertionSchema('contains');
      const valid = schema.safeParse({
        type: 'contains',
        value: 'hello',
      });
      expect(valid.success).toBe(true);
    });

    it('should create a schema for similar assertion with threshold', () => {
      const schema = createAssertionSchema('similar');
      const valid = schema.safeParse({
        type: 'similar',
        value: 'expected output',
        threshold: 0.9,
      });
      expect(valid.success).toBe(true);
    });

    it('should handle optional fields', () => {
      const schema = createAssertionSchema('contains');
      const valid = schema.safeParse({
        type: 'contains',
        value: 'hello',
        weight: 2,
        metric: 'custom-metric',
        transform: 'output.toLowerCase()',
      });
      expect(valid.success).toBe(true);
    });
  });
});
