import { describe, expect, it } from 'vitest';
import {
  AGENTIC_EXEMPT_PLUGINS,
  ALL_PLUGINS,
  DATASET_EXEMPT_PLUGINS,
  STRATEGY_EXEMPT_PLUGINS,
} from '../../../src/redteam/constants/plugins';

describe('plugins constants', () => {
  it('should have ALL_PLUGINS as sorted array', () => {
    const sorted = [...ALL_PLUGINS].sort();
    expect(ALL_PLUGINS).toEqual(sorted);
  });

  it('should have unique values in ALL_PLUGINS', () => {
    const uniquePlugins = new Set(ALL_PLUGINS);
    expect(uniquePlugins.size).toBe(ALL_PLUGINS.length);
  });

  describe('DATASET_EXEMPT_PLUGINS', () => {
    it('should include static dataset plugins', () => {
      expect(DATASET_EXEMPT_PLUGINS).toContain('aegis');
      expect(DATASET_EXEMPT_PLUGINS).toContain('beavertails');
      expect(DATASET_EXEMPT_PLUGINS).toContain('cyberseceval');
      expect(DATASET_EXEMPT_PLUGINS).toContain('donotanswer');
      expect(DATASET_EXEMPT_PLUGINS).toContain('harmbench');
      expect(DATASET_EXEMPT_PLUGINS).toContain('pliny');
      expect(DATASET_EXEMPT_PLUGINS).toContain('toxic-chat');
      expect(DATASET_EXEMPT_PLUGINS).toContain('unsafebench');
      expect(DATASET_EXEMPT_PLUGINS).toContain('vlguard');
      expect(DATASET_EXEMPT_PLUGINS).toContain('vlsu');
      expect(DATASET_EXEMPT_PLUGINS).toContain('xstest');
    });

    it('should have unique values', () => {
      const uniquePlugins = new Set(DATASET_EXEMPT_PLUGINS);
      expect(uniquePlugins.size).toBe(DATASET_EXEMPT_PLUGINS.length);
    });
  });

  describe('AGENTIC_EXEMPT_PLUGINS', () => {
    it('should include agentic plugins', () => {
      expect(AGENTIC_EXEMPT_PLUGINS).toContain('system-prompt-override');
      expect(AGENTIC_EXEMPT_PLUGINS).toContain('agentic:memory-poisoning');
    });

    it('should have unique values', () => {
      const uniquePlugins = new Set(AGENTIC_EXEMPT_PLUGINS);
      expect(uniquePlugins.size).toBe(AGENTIC_EXEMPT_PLUGINS.length);
    });
  });

  describe('STRATEGY_EXEMPT_PLUGINS', () => {
    it('should include both agentic and dataset plugins', () => {
      // Should include all agentic plugins
      AGENTIC_EXEMPT_PLUGINS.forEach((plugin) => {
        expect(STRATEGY_EXEMPT_PLUGINS).toContain(plugin);
      });

      // Should include all dataset plugins
      DATASET_EXEMPT_PLUGINS.forEach((plugin) => {
        expect(STRATEGY_EXEMPT_PLUGINS).toContain(plugin);
      });
    });

    it('should have unique values', () => {
      const uniquePlugins = new Set(STRATEGY_EXEMPT_PLUGINS);
      expect(uniquePlugins.size).toBe(STRATEGY_EXEMPT_PLUGINS.length);
    });

    it('should be the union of agentic and dataset plugins', () => {
      const expectedLength = AGENTIC_EXEMPT_PLUGINS.length + DATASET_EXEMPT_PLUGINS.length;
      expect(STRATEGY_EXEMPT_PLUGINS.length).toBe(expectedLength);
    });
  });
});
