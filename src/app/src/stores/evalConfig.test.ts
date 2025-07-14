import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore, DEFAULT_CONFIG } from './evalConfig';

describe('evalConfig store', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useStore.getState().reset();
    // Clear localStorage
    localStorage.clear();
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('config management', () => {
    it('should initialize with default config', () => {
      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
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
      // Other fields should be undefined due to cleanConfig
      expect(config.prompts).toBeUndefined();
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

  describe('auto-save functionality', () => {
    it('should initialize with idle save status', () => {
      const { saveStatus, saveError, lastSavedAt } = useStore.getState();
      expect(saveStatus).toBe('idle');
      expect(saveError).toBeNull();
      expect(lastSavedAt).toBeNull();
    });

    it('should update save status when updating config', () => {
      const { updateConfig } = useStore.getState();

      // Update config
      updateConfig({ description: 'Test' });

      // Should now show saved status
      const state = useStore.getState();
      expect(state.saveStatus).toBe('saved');
      expect(state.lastSavedAt).toBeGreaterThan(0);
      expect(state.saveError).toBeNull();
    });

    it('should handle save errors gracefully', () => {
      // Mock localStorage.setItem to throw an error
      const originalSetItem = Storage.prototype.setItem;
      let errorThrown = false;
      Storage.prototype.setItem = vi.fn().mockImplementation((key, value) => {
        if (key === 'promptfoo' && !errorThrown) {
          errorThrown = true;
          throw new Error('Storage error');
        }
        return originalSetItem.call(localStorage, key, value);
      });

      const { updateConfig } = useStore.getState();

      // Update config
      updateConfig({ description: 'Test error handling' });

      // Should show error status
      const state = useStore.getState();
      expect(state.saveStatus).toBe('error');
      expect(state.saveError).toContain('Storage error');

      // Restore original implementation
      Storage.prototype.setItem = originalSetItem;
    });

    it('should clear saved data', () => {
      const { updateConfig, clearSavedData } = useStore.getState();

      // First add some data
      updateConfig({ description: 'Test data' });

      // Clear saved data
      clearSavedData();

      // Should reset to default state
      const state = useStore.getState();
      expect(state.config).toEqual(DEFAULT_CONFIG);
      expect(state.saveStatus).toBe('idle');
      expect(state.lastSavedAt).toBeNull();
    });

    it('should calculate saved data size', () => {
      const { updateConfig, getSavedDataSize } = useStore.getState();

      // Initially should be 0
      expect(getSavedDataSize()).toBe(0);

      // Add some data
      updateConfig({
        description: 'Test data',
        prompts: ['This is a test prompt'],
      });

      // Size should be greater than 0
      const size = getSavedDataSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should handle localStorage quota errors', () => {
      // Mock localStorage.setItem to throw quota exceeded error
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      const { updateConfig } = useStore.getState();

      // Update config
      updateConfig({ description: 'Test' });

      // Should show error status with specific message
      const state = useStore.getState();
      expect(state.saveStatus).toBe('error');
      expect(state.saveError).toContain('Storage quota exceeded');

      // Restore original implementation
      Storage.prototype.setItem = originalSetItem;
    });

    it('should persist and rehydrate data', async () => {
      const testConfig = {
        description: 'Persisted test',
        prompts: ['Test prompt'],
        providers: [{ id: 'test-provider' }],
      };

      // Update config
      useStore.getState().updateConfig(testConfig);

      // Manually trigger rehydration
      await useStore.persist.rehydrate();

      // Check that data was restored
      const rehydratedState = useStore.getState();
      expect(rehydratedState.config.description).toBe(testConfig.description);
      expect(rehydratedState.config.prompts).toEqual(testConfig.prompts);
      expect(rehydratedState.config.providers).toEqual(testConfig.providers);
    });
  });
});
