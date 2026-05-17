import { describe, expect, it } from 'vitest';
import { PLUGINS_REQUIRING_CONFIG, requiresPluginConfig } from './constants';

describe('requiresPluginConfig', () => {
  it('should return true for indirect-prompt-injection plugin', () => {
    expect(requiresPluginConfig('indirect-prompt-injection')).toBe(true);
  });

  it('should return true for prompt-extraction plugin', () => {
    expect(requiresPluginConfig('prompt-extraction')).toBe(true);
  });

  it('should return false for plugins that do not require config', () => {
    expect(requiresPluginConfig('bola')).toBe(false);
    expect(requiresPluginConfig('harmful:hate')).toBe(false);
    expect(requiresPluginConfig('policy')).toBe(false);
    expect(requiresPluginConfig('intent')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(requiresPluginConfig('')).toBe(false);
  });

  it('should return false for arbitrary plugin names', () => {
    expect(requiresPluginConfig('non-existent-plugin')).toBe(false);
    expect(requiresPluginConfig('random-plugin-name')).toBe(false);
  });

  it('should work with all values in PLUGINS_REQUIRING_CONFIG constant', () => {
    // Test all plugins in the constant array
    PLUGINS_REQUIRING_CONFIG.forEach((plugin) => {
      expect(requiresPluginConfig(plugin)).toBe(true);
    });
  });

  it('should handle type narrowing correctly', () => {
    const plugin: string = 'indirect-prompt-injection';

    if (requiresPluginConfig(plugin)) {
      // TypeScript should narrow the type to PluginRequiringConfig
      // This is a type-level test - if it compiles, the type guard works
      const narrowedPlugin: 'indirect-prompt-injection' | 'prompt-extraction' = plugin;
      expect(narrowedPlugin).toBe('indirect-prompt-injection');
    }
  });

  it('should be case-sensitive', () => {
    expect(requiresPluginConfig('Indirect-Prompt-Injection')).toBe(false);
    expect(requiresPluginConfig('PROMPT-EXTRACTION')).toBe(false);
  });
});
