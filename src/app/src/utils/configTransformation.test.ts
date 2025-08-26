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
      expect(result.prompts).toEqual(['Hello {{name}}', { id: 'prompt2', raw: 'Goodbye {{name}}' }]);
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
  });
});
