import {
  categoryAliases,
  categoryAliasesReverse,
  categoryDescriptions,
  categoryLabels,
  categoryMapReverse,
  DEFAULT_OUTPUT_PATH,
  displayNameOverrides,
  PLUGIN_PRESET_DESCRIPTIONS,
  pluginDescriptions,
  riskCategories,
  riskCategorySeverityMap,
  Severity,
  severityDisplayNames,
  strategyDescriptions,
  strategyDisplayNames,
  subCategoryDescriptions,
} from '../../../src/redteam/constants/metadata';

import type { Plugin } from '../../../src/redteam/constants/plugins';
import type { Strategy } from '../../../src/redteam/constants/strategies';

describe('metadata constants', () => {
  describe('Severity enum and display names', () => {
    it('should have matching severity levels and display names', () => {
      expect(Object.keys(severityDisplayNames)).toEqual(Object.values(Severity));
      expect(severityDisplayNames[Severity.Critical]).toBe('Critical');
      expect(severityDisplayNames[Severity.High]).toBe('High');
      expect(severityDisplayNames[Severity.Medium]).toBe('Medium');
      expect(severityDisplayNames[Severity.Low]).toBe('Low');
    });
  });

  describe('Risk category severity map', () => {
    it('should have valid severity levels', () => {
      Object.values(riskCategorySeverityMap).forEach((severity) => {
        expect(Object.values(Severity)).toContain(severity);
      });
    });

    it('should include memory poisoning plugin with high severity', () => {
      expect(riskCategorySeverityMap['agentic:memory-poisoning']).toBe(Severity.High);
    });
  });

  describe('Risk categories', () => {
    it('should have valid category descriptions', () => {
      Object.keys(riskCategories).forEach((category) => {
        // @ts-expect-error: categoryDescriptions is only indexed by TopLevelCategory (not string)
        expect(categoryDescriptions[category]).toBeDefined();
        // @ts-expect-error: categoryDescriptions is only indexed by TopLevelCategory (not string)
        expect(typeof categoryDescriptions[category]).toBe('string');
      });
    });

    it('should have valid category mapping for each plugin', () => {
      Object.entries(categoryMapReverse).forEach(([plugin, category]) => {
        const foundInCategory = Object.entries(riskCategories).some(
          ([cat, plugins]) => cat === category && plugins.includes(plugin as Plugin),
        );
        expect(foundInCategory).toBe(true);
      });
    });

    it('should have matching category labels', () => {
      expect(categoryLabels).toEqual(Object.keys(categoryMapReverse));
    });

    it('should not include duplicate plugin ids within a category', () => {
      Object.entries(riskCategories).forEach(([category, plugins]) => {
        const uniquePlugins = new Set(plugins);
        expect(uniquePlugins.size).toBe(plugins.length);
      });
    });
  });

  describe('Category aliases', () => {
    it('should have valid aliases mapping', () => {
      const uniqueValues = new Set(Object.values(categoryAliases));
      uniqueValues.forEach((value) => {
        const keys = Object.entries(categoryAliases)
          .filter(([, v]) => v === value)
          .map(([k]) => k);
        const reverseKey = categoryAliasesReverse[value];
        expect(keys).toContain(reverseKey);
      });
    });
  });

  describe('Plugin and strategy descriptions', () => {
    it('should have descriptions for all plugins', () => {
      Object.keys(pluginDescriptions).forEach((plugin) => {
        expect(typeof pluginDescriptions[plugin as Plugin]).toBe('string');
        expect(pluginDescriptions[plugin as Plugin].length).toBeGreaterThan(0);
      });
    });

    it('should have descriptions for all strategies', () => {
      Object.keys(strategyDescriptions).forEach((strategy) => {
        expect(typeof strategyDescriptions[strategy as Strategy]).toBe('string');
        expect(strategyDescriptions[strategy as Strategy].length).toBeGreaterThan(0);
      });
    });

    it('should have display names for all strategies', () => {
      Object.keys(strategyDisplayNames).forEach((strategy) => {
        expect(typeof strategyDisplayNames[strategy as Strategy]).toBe('string');
        expect(strategyDisplayNames[strategy as Strategy].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Plugin preset descriptions', () => {
    it('should have valid preset descriptions', () => {
      Object.entries(PLUGIN_PRESET_DESCRIPTIONS).forEach(([preset, description]) => {
        expect(typeof preset).toBe('string');
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Display name overrides', () => {
    it('should have display names for memory poisoning plugin', () => {
      expect(displayNameOverrides['agentic:memory-poisoning']).toBe('Agentic Memory Poisoning');
    });

    it('should have matching subcategory descriptions', () => {
      Object.keys(displayNameOverrides).forEach((key) => {
        const keyAsPluginOrStrategy = key as Plugin | Strategy;
        expect(subCategoryDescriptions[keyAsPluginOrStrategy]).toBeDefined();
      });
    });
  });

  describe('Default output path', () => {
    it('should be defined correctly', () => {
      expect(DEFAULT_OUTPUT_PATH).toBe('redteam.yaml');
    });
  });
});
