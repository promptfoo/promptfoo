import {
  createMinimalValidConfig,
  hasMinimumRequiredFields,
  transformResultsConfigToSetupConfig,
  validateConfigCompleteness,
} from './configTransformation';
import type { UnifiedConfig } from '../../../types';

describe('configTransformation', () => {
  describe('transformResultsConfigToSetupConfig', () => {
    it('should transform a complete config correctly', () => {
      const input: Partial<UnifiedConfig> = {
        description: 'Test evaluation',
        providers: ['openai:gpt-4', { id: 'custom', name: 'Custom Provider' }],
        prompts: ['Hello {{name}}', { id: 'prompt2', raw: 'Goodbye {{name}}' }],
        tests: [{ vars: { name: 'world' } }],
        defaultTest: { assert: [{ type: 'contains', value: 'hello' }] },
        env: { API_KEY: 'test' },
      };

      const result = transformResultsConfigToSetupConfig(input);

      expect(result.description).toBe('Test evaluation');
      expect(result.providers).toEqual(['openai:gpt-4', { id: 'custom', name: 'Custom Provider' }]);
      expect(result.prompts).toEqual([
        'Hello {{name}}',
        { id: 'prompt2', raw: 'Goodbye {{name}}' },
      ]);
      expect(result.tests).toEqual([{ vars: { name: 'world' } }]);
      expect(result.env).toEqual({ API_KEY: 'test' });
    });

    it('should handle empty/undefined arrays', () => {
      const input: Partial<UnifiedConfig> = {
        description: 'Test',
        providers: undefined,
        prompts: null as any,
        tests: [],
      };

      const result = transformResultsConfigToSetupConfig(input);

      expect(result.providers).toEqual([]);
      expect(result.prompts).toEqual([]);
      expect(result.tests).toEqual([]);
    });

    it('should filter out null/undefined items', () => {
      const input: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4', null as any, undefined as any, 'anthropic:claude-3'],
        prompts: ['Hello', null as any, undefined as any, 'World'],
        tests: [{ vars: {} }, null as any, undefined as any],
      };

      const result = transformResultsConfigToSetupConfig(input);

      expect(result.providers).toEqual(['openai:gpt-4', 'anthropic:claude-3']);
      expect(result.prompts).toEqual(['Hello', 'World']);
      expect(result.tests).toEqual([{ vars: {} }]);
    });

    it('should correctly copy and filter optional array and object fields', () => {
      const input: Partial<UnifiedConfig> = {
        derivedMetrics: [{ formula: 'x + y', name: 'metric1' }] as any,
        scenarios: [{ description: 'Test scenario', name: 'scenario1' }] as any,
        extensions: ['path/to/extension'],
        evaluateOptions: { timeoutMs: 60 },
      };

      const result = transformResultsConfigToSetupConfig(input);

      expect(result.derivedMetrics).toEqual([{ formula: 'x + y', name: 'metric1' }]);
      expect(result.scenarios).toEqual([{ description: 'Test scenario', name: 'scenario1' }]);
      expect(result.extensions).toEqual(['path/to/extension']);
      expect(result.evaluateOptions).toEqual({ timeoutMs: 60 });
    });

    it('should ignore extra fields in the resultsConfig', () => {
      const input: any = {
        description: 'Test evaluation',
        providers: ['openai:gpt-4'],
        prompts: ['Hello {{name}}'],
        extraField: 'This should be ignored',
      };

      const result = transformResultsConfigToSetupConfig(input);

      expect(result.description).toBe('Test evaluation');
      expect(result.providers).toEqual(['openai:gpt-4']);
      expect(result.prompts).toEqual(['Hello {{name}}']);
    });
  });

  describe('validateConfigCompleteness', () => {
    it('should validate a complete config as valid', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: ['Hello world'],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should identify missing providers', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [],
        prompts: ['Hello world'],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'providers',
        message: 'At least one provider must be configured',
      });
    });

    it('should identify missing prompts', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: [],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'prompts',
        message: 'At least one prompt must be configured',
      });
    });

    it('should validate provider objects', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [{ invalid: 'provider' } as any],
        prompts: ['Hello world'],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'providers[0]',
        message: 'Provider must have either an id or name',
      });
    });

    it('should validate empty prompts', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: ['', '   '],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].field).toBe('prompts[0]');
      expect(result.errors[1].field).toBe('prompts[1]');
    });

    it("should validate a config as valid when providers is an array of strings and prompts is an array of objects each with a 'raw' or 'content' field", () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: [
          { raw: 'Hello world', id: '1' },
          { raw: 'Goodbye world', id: '2' },
        ],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate a config as valid when providers is an array of objects each with an 'id' or 'name' field and prompts is an array of valid strings", () => {
      const config: Partial<UnifiedConfig> = {
        providers: [{ id: 'customProvider' }, { id: 'anotherProvider' }],
        prompts: ['Hello world', 'Another prompt'],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle providers or prompts arrays containing values of unexpected types', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4', 123 as any, true as any],
        prompts: ['Hello world', false as any, 456 as any],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors).toContainEqual({
        field: 'providers[1]',
        message: 'Provider must be a string or object',
      });
      expect(result.errors).toContainEqual({
        field: 'providers[2]',
        message: 'Provider must be a string or object',
      });
      expect(result.errors).toContainEqual({
        field: 'prompts[1]',
        message: 'Prompt must be a string or object',
      });
      expect(result.errors).toContainEqual({
        field: 'prompts[2]',
        message: 'Prompt must be a string or object',
      });
    });

    // [Tusk] FAILING TEST
    it('should identify invalid provider string format', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['invalid-format'],
        prompts: ['Hello world'],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'providers[0]',
        message: 'Provider string must contain a colon',
      });
    });

    // [Tusk] FAILING TEST
    it('should identify prompt objects with empty raw property as invalid', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: [{ id: '1', raw: '' }],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'prompts[0]',
        message: 'Prompt object must have either raw or content field',
      });
    });

    // [Tusk] FAILING TEST
    it('should identify prompt objects with empty content property as invalid', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: [{ id: '1', label: 'test', raw: '' }],
      };

      const result = validateConfigCompleteness(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'prompts[0]',
        message: 'Prompt object must have either raw or content field',
      });
    });
  });

  describe('hasMinimumRequiredFields', () => {
    it('should return true for valid config', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: ['Hello world'],
      };

      expect(hasMinimumRequiredFields(config)).toBe(true);
    });

    it('should return false for empty providers', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [],
        prompts: ['Hello world'],
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });

    it('should return false for empty prompts', () => {
      const config: Partial<UnifiedConfig> = {
        providers: ['openai:gpt-4'],
        prompts: [],
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });

    it('should return false for undefined arrays', () => {
      const config: Partial<UnifiedConfig> = {
        providers: undefined,
        prompts: undefined,
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });

    // [Tusk] FAILING TEST
    it('should return false when providers and prompts contain only empty strings', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [''],
        prompts: [''],
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });

    // [Tusk] FAILING TEST
    it('should return false when providers and prompts contain invalid objects', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [{ invalid: 'provider' } as any],
        prompts: [{ invalid: 'prompt' } as any],
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });
  });

  describe('createMinimalValidConfig', () => {
    it('should create a minimal valid config from empty input', () => {
      const input: Partial<UnifiedConfig> = {};

      const result = createMinimalValidConfig(input);

      expect(result.description).toBe('Imported configuration');
      expect(result.providers).toEqual(['openai:gpt-3.5-turbo']);
      expect(result.prompts).toEqual(['Please respond to: {{input}}']);
      expect(hasMinimumRequiredFields(result)).toBe(true);
    });

    it('should preserve valid existing fields', () => {
      const input: Partial<UnifiedConfig> = {
        description: 'My test config',
        providers: ['anthropic:claude-3'],
        prompts: ['Custom prompt: {{question}}'],
        env: { TEST: 'value' },
      };

      const result = createMinimalValidConfig(input);

      expect(result.description).toBe('My test config');
      expect(result.providers).toEqual(['anthropic:claude-3']);
      expect(result.prompts).toEqual(['Custom prompt: {{question}}']);
      expect(result.env).toEqual({ TEST: 'value' });
    });

    it('should add placeholders when arrays are empty', () => {
      const input: Partial<UnifiedConfig> = {
        description: 'Test',
        providers: [],
        prompts: [],
      };

      const result = createMinimalValidConfig(input);

      expect(result.providers).toEqual(['openai:gpt-3.5-turbo']);
      expect(result.prompts).toEqual(['Please respond to: {{input}}']);
    });

    it('should filter out null/undefined values', () => {
      const input: Partial<UnifiedConfig> = {
        providers: ['valid-provider', null as any, undefined as any],
        prompts: ['valid-prompt', null as any, undefined as any],
      };

      const result = createMinimalValidConfig(input);

      expect(result.providers).toEqual(['valid-provider']);
      expect(result.prompts).toEqual(['valid-prompt']);
    });

    it('should preserve valid tests, derivedMetrics, scenarios, and extensions', () => {
      const input: Partial<UnifiedConfig> = {
        tests: [{ description: 'test1' }],
      };

      const result = createMinimalValidConfig(input);

      expect(result.tests).toEqual([{ description: 'test1' }]);
    });

    it('should preserve defaultTest and evaluateOptions fields', () => {
      const input: Partial<UnifiedConfig> = {
        defaultTest: { assert: [{ type: 'contains', value: 'hello' }] },
        evaluateOptions: {
          maxConcurrency: 5,
        },
      };

      const result = createMinimalValidConfig(input);

      expect(result.defaultTest).toEqual({ assert: [{ type: 'contains', value: 'hello' }] });
      expect(result.evaluateOptions).toEqual({
        maxConcurrency: 5,
      });
    });

    it('should handle providers array with only null and undefined values', () => {
      const input: Partial<UnifiedConfig> = {
        providers: [null as any, undefined as any],
      };

      const result = createMinimalValidConfig(input);

      expect(result.providers).toEqual(['openai:gpt-3.5-turbo']);
    });

    it('should preserve providers and prompts with invalid structures', () => {
      const input: Partial<UnifiedConfig> = {
        providers: [{ invalid: 'provider' } as any],
        prompts: [{ notRaw: 'prompt' } as any],
      };

      const result = createMinimalValidConfig(input);

      expect(result.providers).toEqual([{ invalid: 'provider' }]);
      expect(result.prompts).toEqual([{ notRaw: 'prompt' }]);
    });

    // [Tusk] FAILING TEST
    it('should use default description when description is an empty string', () => {
      const input: Partial<UnifiedConfig> = {
        description: '',
      };

      const result = createMinimalValidConfig(input);

      expect(result.description).toBe('Imported configuration');
    });

    // [Tusk] FAILING TEST
    it('should use default description when description contains only whitespace', () => {
      const input: Partial<UnifiedConfig> = {
        description: '   ',
      };

      const result = createMinimalValidConfig(input);

      expect(result.description).toBe('Imported configuration');
    });
  });
});
