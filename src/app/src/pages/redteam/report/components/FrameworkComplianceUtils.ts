import { categoryAliases, displayNameOverrides } from '@promptfoo/redteam/constants';

export type TestResultStats = {
  // The count of successful defenses (tests that passed)
  pass: number;
  // The total number of tests run
  total: number;
  // The count of successful defenses due to content moderation filtering
  passWithFilter?: number;
  // The number of successful attacks
  failCount: number;
};

// Types for utility functions
export type CategoryStats = Record<string, TestResultStats>;

type PluginCategories = {
  compliant: string[];
  nonCompliant: string[];
  untested: string[];
};

/**
 * Expands plugin collections like 'harmful' into their individual plugins
 */
export const expandPluginCollections = (
  plugins: string[],
  categoryStats: CategoryStats,
): Set<string> => {
  const expandedPlugins = new Set<string>();
  plugins.forEach((plugin) => {
    if (plugin === 'harmful') {
      // Add all harmful:* plugins that have stats
      Object.keys(categoryStats)
        .filter((key) => key.startsWith('harmful:'))
        .forEach((key) => expandedPlugins.add(key));
    } else {
      expandedPlugins.add(plugin);
    }
  });
  return expandedPlugins;
};

/**
 * Categorizes plugins into compliant, non-compliant, and untested based on pass rates
 */
export const categorizePlugins = (
  plugins: Set<string> | string[],
  categoryStats: CategoryStats,
  passRateThreshold: number,
): PluginCategories => {
  const compliantPlugins: string[] = [];
  const nonCompliantPlugins: string[] = [];
  const untestedPlugins: string[] = [];

  // Process all plugins in the category
  Array.from(plugins).forEach((plugin) => {
    // Check if plugin has test data
    if (categoryStats[plugin] && categoryStats[plugin].total > 0) {
      // Plugin was tested
      const stats = categoryStats[plugin];
      if (stats.pass / stats.total >= passRateThreshold) {
        compliantPlugins.push(plugin);
      } else {
        nonCompliantPlugins.push(plugin);
      }
    } else {
      // Plugin was not tested
      untestedPlugins.push(plugin);
    }
  });

  return {
    compliant: compliantPlugins,
    nonCompliant: nonCompliantPlugins,
    untested: untestedPlugins,
  };
};

/**
 * Gets a display name for a plugin
 */
export const getPluginDisplayName = (plugin: string): string => {
  return (
    displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
    categoryAliases[plugin as keyof typeof categoryAliases] ||
    plugin
  );
};

export const FRAMEWORK_DESCRIPTIONS: Record<string, string> = {
  'mitre:atlas': 'MITRE ATLAS framework for adversarial threat landscape for AI systems',
  'nist:ai:measure': 'NIST AI Risk Management Framework for responsible AI development',
  'owasp:api': 'OWASP API Top 10 security risks for application programming interfaces',
  'owasp:llm': 'OWASP LLM Top 10 security vulnerabilities for large language models',
  'eu:ai-act': 'EU AI Act for responsible AI development',
};
