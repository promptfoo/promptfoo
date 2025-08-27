import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, useStore } from './evalConfig';
import * as configTransformation from '../utils/configTransformation';

describe('evalConfig store', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useStore.getState().reset();
  });

  describe('config management', () => {
    it('should initialize with default config', () => {
      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    // [Tusk] FAILING TEST
    it('should not change configSource when updateConfig is called with empty updates', () => {
      const { updateConfig, configSource } = useStore.getState();
      expect(configSource).toBe('fresh');

      updateConfig({});

      expect(useStore.getState().configSource).toBe('fresh');
    });

    it('should update config with updateConfig', () => {
      const updates = {
        description: 'Test Description',
        providers: [{ id: 'openai:gpt-4' }],
      };

      useStore.getState().updateConfig(updates);

      const { config } = useStore.getState();
      expect(config.description).toBe('Test Description');
      expect(config.providers).toEqual([{ id: 'openai:gpt-4' }]);
      // Other fields should remain as defaults
      expect(config.prompts).toEqual([]);
    });

    it('should replace entire config with setConfig', () => {
      const newConfig = {
        description: 'New Config',
        providers: [{ id: 'anthropic:claude' }],
        prompts: ['Test prompt'],
      };

      useStore.getState().setConfig(newConfig);

      const { config } = useStore.getState();
      expect(config).toEqual(newConfig);
      // Note: fields not in newConfig are undefined, not defaults
      expect(config.env).toBeUndefined();
    });

    it('should reset to default config', () => {
      // First, modify the config
      useStore.getState().updateConfig({
        description: 'Modified',
        providers: [{ id: 'test' }],
      });

      // Then reset
      useStore.getState().reset();

      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('defaultTest handling', () => {
    it('should accept string defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });

      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);
    });

    it('should accept object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
        options: { provider: 'openai:gpt-4' },
      };

      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });

      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle undefined defaultTest', () => {
      // Set to undefined explicitly
      useStore.getState().updateConfig({ defaultTest: undefined as any });

      // When set to undefined, it becomes undefined
      expect(useStore.getState().config.defaultTest).toBeUndefined();
    });

    it('should update from object to string defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });
      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);

      const stringDefaultTest = 'file://new/path/defaultTest.yaml';
      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });

      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);
    });

    it('should update from string to object defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });
      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);

      const objectDefaultTest = {
        assert: [{ type: 'contains' as const, value: 'new' }],
        metadata: { suite: 'test' },
      };
      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });

      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);
    });
  });

  describe('getTestSuite', () => {
    it('should return config with string defaultTest', () => {
      const stringDefaultTest = 'file://shared/defaultTest.yaml';

      useStore.getState().updateConfig({
        description: 'Test config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
        defaultTest: stringDefaultTest,
      });

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toBe(stringDefaultTest);
      expect(config.description).toBe('Test config');
    });

    it('should return config with object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().updateConfig({
        description: 'Test config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
        defaultTest: objectDefaultTest as any,
      });

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle complex prompts configuration', () => {
      // Test string prompts
      useStore.getState().updateConfig({ prompts: ['Test prompt'] });
      expect(useStore.getState().config.prompts).toEqual(['Test prompt']);

      // Test array of prompts
      const multiplePrompts = ['Prompt 1', 'Prompt 2'];
      useStore.getState().updateConfig({ prompts: multiplePrompts });
      expect(useStore.getState().config.prompts).toEqual(multiplePrompts);
    });

    it('should include new fields like derivedMetrics automatically', () => {
      const derivedMetrics = [
        { name: 'precision', value: 'tp / (tp + fp)' },
        { name: 'recall', value: 'tp / (tp + fn)' },
      ];

      useStore.getState().updateConfig({ derivedMetrics });

      const testSuite = useStore.getState().getTestSuite();
      expect(testSuite.derivedMetrics).toEqual(derivedMetrics);
    });
  });

  describe('setConfigFromResults', () => {
    it("should update config, configSource, originalResultsConfig, and isLoading correctly when setConfigFromResults is called with a valid resultsConfig, and validationStatus should reflect the new config's validity after transformation", async () => {
      const resultsConfig = {
        description: 'Results Config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
      };

      await useStore.getState().setConfigFromResults(resultsConfig);

      const { config, configSource, originalResultsConfig, isLoading, validationStatus } =
        useStore.getState();

      expect(config).toMatchObject(resultsConfig);
      expect(configSource).toBe('results');
      expect(originalResultsConfig).toEqual(resultsConfig);
      expect(isLoading).toBe(false);
      expect(validationStatus.isValid).toBe(true);
      expect(validationStatus.errors).toEqual([]);
      expect(validationStatus.hasMinimumFields).toBe(true);
    });
  });

  describe('setConfigFromResults error handling', () => {
    it('should always reset isLoading to false even if an unexpected error occurs', async () => {
      const resultsConfig = { description: 'Results Config' };
      const originalConsoleError = console.error;
      console.error = vi.fn();

      const transformSpy = vi
        .spyOn(configTransformation, 'transformResultsConfigToSetupConfig')
        .mockImplementation(() => {
          throw new Error('Unexpected error during transformation');
        });

      try {
        await useStore.getState().setConfigFromResults(resultsConfig);
      } catch (_error) {}

      expect(useStore.getState().isLoading).toBe(false);

      console.error = originalConsoleError;
      transformSpy.mockRestore();
    });
  });

  describe('restoreOriginal', () => {
    it('should restore config and configSource to the original results config and update validationStatus when restoreOriginal is called and originalResultsConfig is present', () => {
      const originalResultsConfig = {
        description: 'Original Description',
        providers: [{ id: 'openai:gpt-3.5-turbo' }],
        prompts: ['Original Prompt'],
      };

      const transformedConfig = {
        description: 'Transformed Description',
        providers: [{ id: 'transformed:provider' }],
        prompts: ['Transformed Prompt'],
      };

      const transformSpy = vi
        .spyOn(configTransformation, 'transformResultsConfigToSetupConfig')
        .mockReturnValue(transformedConfig);

      useStore.setState({ originalResultsConfig });

      const { restoreOriginal } = useStore.getState();
      restoreOriginal();

      expect(transformSpy).toHaveBeenCalledWith(originalResultsConfig);
      expect(useStore.getState().config).toEqual(transformedConfig);
      expect(useStore.getState().configSource).toBe('results');
      expect(useStore.getState().validationStatus).toBeDefined();
    });

    it('should not transform config when originalResultsConfig is null', () => {
      const initialConfig = { ...useStore.getState().config };
      useStore.getState().restoreOriginal();
      const currentConfig = useStore.getState().config;
      expect(currentConfig).toEqual(initialConfig);
    });
  });
});
