import { describe, expect, it } from 'vitest';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  DPDP_MAPPING,
  FRAMEWORK_NAMES,
} from '../../../src/redteam/constants/frameworks';
import { PLUGIN_PRESET_DESCRIPTIONS } from '../../../src/redteam/constants/metadata';
import { ALL_PLUGINS } from '../../../src/redteam/constants/plugins';
import { FRAMEWORK_COMPLIANCE_IDS } from '../../../src/redteam/constants/strategies';

describe('India DPDP Act framework mapping', () => {
  describe('DPDP_MAPPING', () => {
    it('should map exactly the provisions documented in dpdp.md', () => {
      expect(Object.keys(DPDP_MAPPING)).toEqual([
        'dpdp:sec4',
        'dpdp:sec8-3',
        'dpdp:sec8-5',
        'dpdp:sec8-7',
        'dpdp:sec9',
        'dpdp:sec11',
        'dpdp:sec12',
      ]);
    });

    it('each provision mapping should have plugins and strategies arrays', () => {
      Object.values(DPDP_MAPPING).forEach((mapping) => {
        expect(Array.isArray(mapping.plugins)).toBe(true);
        expect(Array.isArray(mapping.strategies)).toBe(true);
        expect(mapping.plugins.length).toBeGreaterThan(0);
      });
    });

    it('all mapped plugins should be valid plugin IDs', () => {
      const validPluginIds = new Set<string>(ALL_PLUGINS);

      Object.values(DPDP_MAPPING).forEach((mapping) => {
        mapping.plugins.forEach((pluginId) => {
          expect(validPluginIds.has(pluginId)).toBe(true);
        });
      });
    });

    it('should not list a plugin twice within one provision', () => {
      Object.values(DPDP_MAPPING).forEach((mapping) => {
        expect(new Set(mapping.plugins).size).toBe(mapping.plugins.length);
      });
    });

    it('should not include plugins that need extra configuration before a preset can run', () => {
      const pluginsRequiringConfig = ['indirect-prompt-injection', 'prompt-extraction'];

      Object.values(DPDP_MAPPING).forEach((mapping) => {
        pluginsRequiringConfig.forEach((pluginId) => {
          expect(mapping.plugins).not.toContain(pluginId);
        });
      });
    });

    it('should map the children provision to the parental consent plugin', () => {
      expect(DPDP_MAPPING['dpdp:sec9'].plugins).toEqual(['coppa']);
    });

    it('should map reasonable security safeguards to access control plugins', () => {
      const plugins = DPDP_MAPPING['dpdp:sec8-5'].plugins;
      expect(plugins).toEqual(expect.arrayContaining(['rbac', 'bola', 'bfla']));
    });
  });

  describe('framework integration', () => {
    it('should register the DPDP framework display name', () => {
      expect(FRAMEWORK_NAMES.dpdp).toBe('India DPDP Act');
    });

    it('should include dpdp in aliased plugins', () => {
      expect(ALIASED_PLUGINS).toContain('dpdp');
    });

    it('should include all provision keys in aliased plugins', () => {
      Object.keys(DPDP_MAPPING).forEach((key) => {
        expect(ALIASED_PLUGINS).toContain(key);
      });
    });

    it('should map the dpdp alias to DPDP_MAPPING', () => {
      expect(ALIASED_PLUGIN_MAPPINGS.dpdp).toBe(DPDP_MAPPING);
    });

    it('should be selectable as a framework compliance ID', () => {
      expect(FRAMEWORK_COMPLIANCE_IDS).toContain('dpdp');
    });

    it('should have a preset description for the UI', () => {
      expect(PLUGIN_PRESET_DESCRIPTIONS['India DPDP Act']).toBeDefined();
    });
  });
});
