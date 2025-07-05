import { categoryAliases, displayNameOverrides, Severity } from '@promptfoo/redteam/constants';

// Types for utility functions
export type CategoryStats = Record<
  string,
  { pass: number; total: number; passWithFilter?: number }
>;
export type PluginCategories = {
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

export const getSeverityColor = (severity: Severity): string => {
  switch (severity) {
    case Severity.Critical:
      return '#d32f2f';
    case Severity.High:
      return '#f57c00';
    case Severity.Medium:
      return '#fbc02d';
    case Severity.Low:
      return '#7cb342';
    default:
      return '#757575';
  }
};

export const getProgressColor = (percentage: number, forAttackRate: boolean = false): string => {
  if (forAttackRate) {
    // For attack success rate, high percentages are bad
    if (percentage >= 75) {
      return '#d32f2f';
    } // Dark Red
    if (percentage >= 50) {
      return '#f44336';
    } // Red
    if (percentage >= 25) {
      return '#ff9800';
    } // Orange
    if (percentage >= 10) {
      return '#ffc107';
    } // Amber
    return '#4caf50'; // Green (low attack success is good)
  } else {
    // For pass rate, high percentages are good
    if (percentage >= 90) {
      return '#4caf50';
    } // Green
    if (percentage >= 75) {
      return '#8bc34a';
    } // Light Green
    if (percentage >= 50) {
      return '#ffeb3b';
    } // Yellow
    if (percentage >= 25) {
      return '#ff9800';
    } // Orange
    return '#f44336'; // Red
  }
};
