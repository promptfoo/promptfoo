import { describe, expect, it } from 'vitest';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  DOD_AI_ETHICS_MAPPING,
  DOD_AI_ETHICS_PRINCIPLE_NAMES,
  FRAMEWORK_NAMES,
} from '../../../src/redteam/constants/frameworks';
import { ALL_PLUGINS } from '../../../src/redteam/constants/plugins';

describe('DoD AI Ethical Principles framework mapping', () => {
  describe('DOD_AI_ETHICS_PRINCIPLE_NAMES', () => {
    it('should contain all 5 principles', () => {
      expect(DOD_AI_ETHICS_PRINCIPLE_NAMES).toHaveLength(5);
    });

    it('should have the expected principle names in order', () => {
      expect(DOD_AI_ETHICS_PRINCIPLE_NAMES).toEqual([
        'Responsible',
        'Equitable',
        'Traceable',
        'Reliable',
        'Governable',
      ]);
    });
  });

  describe('DOD_AI_ETHICS_MAPPING', () => {
    it('should have mappings for all 5 principles', () => {
      const expectedKeys = Array.from(
        { length: 5 },
        (_, i) => `dod:ai:ethics:${String(i + 1).padStart(2, '0')}`,
      );
      expectedKeys.forEach((key) => {
        expect(DOD_AI_ETHICS_MAPPING).toHaveProperty(key);
      });
    });

    it('each principle mapping should have plugins and strategies arrays', () => {
      Object.values(DOD_AI_ETHICS_MAPPING).forEach((mapping) => {
        expect(Array.isArray(mapping.plugins)).toBe(true);
        expect(Array.isArray(mapping.strategies)).toBe(true);
        expect(mapping.plugins.length).toBeGreaterThan(0);
      });
    });

    it('all mapped plugins should be valid plugin IDs', () => {
      const validPluginIds = new Set<string>(ALL_PLUGINS);

      Object.values(DOD_AI_ETHICS_MAPPING).forEach((mapping) => {
        mapping.plugins.forEach((pluginId) => {
          expect(validPluginIds.has(pluginId)).toBe(true);
        });
      });
    });
  });

  describe('framework integration', () => {
    it('should register DoD framework display name', () => {
      expect(FRAMEWORK_NAMES['dod:ai:ethics']).toBe('DoD AI Ethical Principles');
    });

    it('should include dod:ai:ethics in aliased plugins', () => {
      expect(ALIASED_PLUGINS).toContain('dod:ai:ethics');
    });

    it('should include all principle keys in aliased plugins', () => {
      Object.keys(DOD_AI_ETHICS_MAPPING).forEach((key) => {
        expect(ALIASED_PLUGINS).toContain(key);
      });
    });

    it('should map dod:ai:ethics alias to DOD_AI_ETHICS_MAPPING', () => {
      expect(ALIASED_PLUGIN_MAPPINGS['dod:ai:ethics']).toBe(DOD_AI_ETHICS_MAPPING);
    });
  });
});
