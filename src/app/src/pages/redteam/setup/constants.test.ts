import { describe, expect, it } from 'vitest';
import {
  isPluginConfigComplete,
  PLUGINS_REQUIRING_CONFIG,
  requiresPluginConfig,
} from './constants';

describe('requiresPluginConfig', () => {
  it('should return true for indirect-prompt-injection plugin', () => {
    expect(requiresPluginConfig('indirect-prompt-injection')).toBe(true);
  });

  it('should return true for prompt-extraction plugin', () => {
    expect(requiresPluginConfig('prompt-extraction')).toBe(true);
  });

  it('should return true for privacy-policy-consistency plugin', () => {
    expect(requiresPluginConfig('privacy-policy-consistency')).toBe(true);
  });

  it('should return true for privacy rights workflow plugin', () => {
    expect(requiresPluginConfig('privacy:rights-request-workflow-integrity')).toBe(true);
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
      const narrowedPlugin:
        | 'indirect-prompt-injection'
        | 'privacy-policy-consistency'
        | 'privacy:rights-request-workflow-integrity'
        | 'prompt-extraction' = plugin;
      expect(narrowedPlugin).toBe('indirect-prompt-injection');
    }
  });

  it('should be case-sensitive', () => {
    expect(requiresPluginConfig('Indirect-Prompt-Injection')).toBe(false);
    expect(requiresPluginConfig('PROMPT-EXTRACTION')).toBe(false);
  });
});

describe('isPluginConfigComplete', () => {
  const plugin = 'privacy:rights-request-workflow-integrity';

  it('accepts supported modern geography config', () => {
    expect(isPluginConfigComplete(plugin, { geographies: ['california-ccpa'] })).toBe(true);
    expect(isPluginConfigComplete(plugin, { geographies: 'california-ccpa, eu-gdpr' })).toBe(true);
  });

  it('accepts supported legacy framework config', () => {
    expect(isPluginConfigComplete(plugin, { frameworks: ['ccpa'] })).toBe(true);
  });

  it('rejects unsupported modern geography config', () => {
    expect(isPluginConfigComplete(plugin, { geographies: ['unsupported'] })).toBe(false);
    expect(
      isPluginConfigComplete(plugin, { geographies: ['california-ccpa', 'unsupported'] }),
    ).toBe(false);
  });

  it('prefers supported modern geographies over stale legacy framework config', () => {
    expect(
      isPluginConfigComplete(plugin, {
        geographies: ['california-ccpa'],
        frameworks: ['hipaa'],
      }),
    ).toBe(true);
  });

  it('rejects unsupported legacy framework config', () => {
    expect(isPluginConfigComplete(plugin, { frameworks: ['hipaa'] })).toBe(false);
  });

  it('allows empty optional workflow evidence but rejects non-file URI references', () => {
    expect(
      isPluginConfigComplete(plugin, {
        geographies: ['eu-gdpr'],
        rightsRequestPolicy: '',
      }),
    ).toBe(true);
    expect(
      isPluginConfigComplete(plugin, {
        geographies: ['eu-gdpr'],
        rightsRequestPolicy: 'https://example.com/workflow',
      }),
    ).toBe(false);
  });

  it('validates privacy policy consistency references', () => {
    expect(
      isPluginConfigComplete('privacy-policy-consistency', {
        privacyPolicy: 'file://privacy-policy.md',
      }),
    ).toBe(true);
    expect(
      isPluginConfigComplete('privacy-policy-consistency', {
        privacyPolicy: 'https://example.com/privacy-policy',
      }),
    ).toBe(false);
  });
});
