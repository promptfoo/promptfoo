import { describe, expect, it } from 'vitest';
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
  strategyDescriptions,
  strategyDisplayNames,
  subCategoryDescriptions,
} from '../../../src/redteam/constants/metadata';
import {
  ADDITIONAL_PLUGINS,
  BASE_PLUGINS,
  BIAS_PLUGINS,
  FINANCIAL_PLUGINS,
  HARM_PLUGINS,
  MEDICAL_PLUGINS,
  PII_PLUGINS,
} from '../../../src/redteam/constants/plugins';

import type { Plugin } from '../../../src/redteam/constants/plugins';
import type { Strategy } from '../../../src/redteam/constants/strategies';

describe('metadata constants', () => {
  describe('Risk category severity map', () => {
    it('should have valid severity levels', () => {
      Object.values(riskCategorySeverityMap).forEach((severity) => {
        expect(Object.values(Severity)).toContain(severity);
      });
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
      Object.entries(riskCategories).forEach(([_category, plugins]) => {
        const uniquePlugins = new Set(plugins);
        expect(uniquePlugins.size).toBe(plugins.length);
      });
    });

    it('should include all defined plugins in risk categories', () => {
      // Get all plugins from risk categories
      const riskCategoryPlugins = new Set<Plugin>();
      Object.values(riskCategories).forEach((plugins) => {
        plugins.forEach((plugin) => {
          riskCategoryPlugins.add(plugin);
        });
      });

      // Get all defined plugins from constants
      const allDefinedPlugins = new Set<Plugin>();

      // Add plugins from various constant arrays
      [...BASE_PLUGINS].forEach((plugin) => allDefinedPlugins.add(plugin));
      [...ADDITIONAL_PLUGINS].forEach((plugin) => allDefinedPlugins.add(plugin));
      [...BIAS_PLUGINS].forEach((plugin) => allDefinedPlugins.add(plugin));
      [...PII_PLUGINS].forEach((plugin) => allDefinedPlugins.add(plugin));
      [...MEDICAL_PLUGINS].forEach((plugin) => allDefinedPlugins.add(plugin));
      [...FINANCIAL_PLUGINS].forEach((plugin) => allDefinedPlugins.add(plugin));

      // Add plugins from HARM_PLUGINS object
      Object.keys(HARM_PLUGINS).forEach((plugin) => {
        allDefinedPlugins.add(plugin as Plugin);
      });

      // Special plugins that shouldn't be in risk categories (collections and custom plugins)
      const excludedPlugins = new Set([
        'intent', // Custom intent plugin handled separately in UI
        'policy', // Custom policy plugin handled separately in UI
        'default', // Collection
        'foundation', // Collection
        'harmful', // Collection
        'bias', // Collection
        'pii', // Collection
        'medical', // Collection
        'guardrails-eval', // Collection
      ]);

      // Find plugins that are defined but missing from risk categories
      const missingPlugins = Array.from(allDefinedPlugins).filter(
        (plugin) => !riskCategoryPlugins.has(plugin) && !excludedPlugins.has(plugin),
      );

      if (missingPlugins.length > 0) {
        throw new Error(
          `The following plugins are defined but missing from risk categories: ${missingPlugins.join(
            ', ',
          )}. Please add them to the appropriate category in riskCategories object in metadata.ts`,
        );
      }

      expect(missingPlugins).toEqual([]);
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
