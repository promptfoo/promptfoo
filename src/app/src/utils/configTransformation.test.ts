import {
  transformResultsConfigToSetupConfig,
  validateConfigCompleteness,
  mergeConfigChanges,
  createMinimalValidConfig,
  hasMinimumRequiredFields,
  getConfigDifferences,
} from './configTransformation';
import type { UnifiedConfig } from '../../../types';

describe('configTransformation', () => {
  describe('transformResultsConfigToSetupConfig', () => {
    it('should transform a complete results config', () => {
      const resultsConfig: Partial<UnifiedConfig> = {
        description: 'Test Eval',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Hello {{name}}'],
        tests: [{ vars: { name: 'World' } }],
        env: { API_KEY: 'test' },
      };

      const setupConfig = transformResultsConfigToSetupConfig(resultsConfig);

      expect(setupConfig.description).toBe('Test Eval');
      expect(setupConfig.providers).toEqual([{ id: 'openai:gpt-4' }]);
      expect(setupConfig.prompts).toEqual(['Hello {{name}}']);
      expect(setupConfig.tests).toEqual([{ vars: { name: 'World' } }]);
      expect(setupConfig.env).toEqual({ API_KEY: 'test' });
    });

    it('should handle empty/null values gracefully', () => {
      const resultsConfig: Partial<UnifiedConfig> = {
        description: '',
        providers: null as any,
        prompts: undefined as any,
      };

      const setupConfig = transformResultsConfigToSetupConfig(resultsConfig);

      expect(setupConfig.description).toBe('');
      expect(setupConfig.providers).toEqual([]);
      expect(setupConfig.prompts).toEqual([]);
    });

    it('should filter out null/undefined array elements', () => {
      const resultsConfig: Partial<UnifiedConfig> = {
        providers: [{ id: 'openai:gpt-4' }, null, undefined, { id: 'anthropic:claude-3' }] as any,
        prompts: ['Hello', null, undefined, 'World'] as any,
      };

      const setupConfig = transformResultsConfigToSetupConfig(resultsConfig);

      expect(setupConfig.providers).toEqual([{ id: 'openai:gpt-4' }, { id: 'anthropic:claude-3' }]);
      expect(setupConfig.prompts).toEqual(['Hello', 'World']);
    });
  });

  describe('hasMinimumRequiredFields', () => {
    it('should return true when providers are present', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [{ id: 'openai:gpt-4' }],
      };

      expect(hasMinimumRequiredFields(config)).toBe(true);
    });

    it('should return true when prompts are present', () => {
      const config: Partial<UnifiedConfig> = {
        prompts: ['Hello world'],
      };

      expect(hasMinimumRequiredFields(config)).toBe(true);
    });

    it('should return false when neither providers nor prompts are present', () => {
      const config: Partial<UnifiedConfig> = {
        description: 'Test',
        env: {},
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });

    it('should return false when providers and prompts are empty arrays', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [],
        prompts: [],
      };

      expect(hasMinimumRequiredFields(config)).toBe(false);
    });
  });

  describe('createMinimalValidConfig', () => {
    it('should create a minimal config with defaults', () => {
      const config = createMinimalValidConfig();

      expect(config.description).toBe('Evaluation Configuration');
      expect(config.providers).toEqual([]);
      expect(config.prompts).toEqual([]);
      expect(config.tests).toEqual([]);
      expect(config.env).toEqual({});
    });

    it('should merge provided base config', () => {
      const baseConfig: Partial<UnifiedConfig> = {
        description: 'Custom Eval',
        providers: [{ id: 'openai:gpt-4' }],
      };

      const config = createMinimalValidConfig(baseConfig);

      expect(config.description).toBe('Custom Eval');
      expect(config.providers).toEqual([{ id: 'openai:gpt-4' }]);
      expect(config.prompts).toEqual([]);
    });
  });

  describe('mergeConfigChanges', () => {
    it('should prioritize user config over original', () => {
      const originalConfig: Partial<UnifiedConfig> = {
        description: 'Original',
        providers: [{ id: 'openai:gpt-3.5' }],
        tags: { version: '1.0' },
      };

      const userConfig: Partial<UnifiedConfig> = {
        description: 'User Modified',
        providers: [{ id: 'openai:gpt-4' }],
      };

      const merged = mergeConfigChanges(originalConfig, userConfig);

      expect(merged.description).toBe('User Modified');
      expect(merged.providers).toEqual([{ id: 'openai:gpt-4' }]);
      expect(merged.tags).toEqual({ version: '1.0' }); // Preserved from original
    });
  });

  describe('getConfigDifferences', () => {
    it('should identify added, modified, and removed fields', () => {
      const originalConfig: Partial<UnifiedConfig> = {
        description: 'Original',
        providers: [{ id: 'openai:gpt-3.5' }],
        env: { API_KEY: 'old' },
      };

      const newConfig: Partial<UnifiedConfig> = {
        description: 'Modified',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['New prompt'],
      };

      const differences = getConfigDifferences(originalConfig, newConfig);

      expect(differences.added).toContain('prompts');
      expect(differences.modified).toContain('description');
      expect(differences.modified).toContain('providers');
      expect(differences.removed).toContain('env');
    });

    it('should handle empty configs', () => {
      const differences = getConfigDifferences({}, {});

      expect(differences.added).toEqual([]);
      expect(differences.modified).toEqual([]);
      expect(differences.removed).toEqual([]);
    });
  });

  describe('validateConfigCompleteness', () => {
    it('should validate a complete config', () => {
      const config: Partial<UnifiedConfig> = {
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Hello world'],
      };

      const validation = validateConfigCompleteness(config);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.data).toBeTruthy();
    });

    it('should identify validation errors', () => {
      const config = {
        providers: 'invalid', // Should be an array - this should cause validation to fail
        // Missing prompts entirely
      } as any;

      const validation = validateConfigCompleteness(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.data).toBeNull();
    });
  });
});
