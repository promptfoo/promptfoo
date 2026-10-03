import {
  categoryAliases,
  displayNameOverrides,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';

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

export type CategoryStats = Record<string, TestResultStats>;

export type PluginCategories = {
  compliant: string[];
  nonCompliant: string[];
  untested: string[];
};

export const getFrameworkPluginId = (pluginId: string): string =>
  pluginId.replace(/^promptfoo:redteam:/, '');

export const getPluginSeverity = (pluginId: string): Severity =>
  riskCategorySeverityMap[getFrameworkPluginId(pluginId) as keyof typeof riskCategorySeverityMap] ||
  Severity.Low;

/** Resolves mapped plugins to the keys present in the report. */
export const expandPluginCollections = (
  plugins: string[],
  categoryStats: CategoryStats,
): Set<string> => {
  const statsKeys = new Map<string, string>();
  for (const key of Object.keys(categoryStats)) {
    const pluginId = getFrameworkPluginId(key);
    // Prefer the short ID when an imported report contains both aliases.
    if (!statsKeys.has(pluginId) || key === pluginId) {
      statsKeys.set(pluginId, key);
    }
  }

  const expandedPlugins = new Set<string>();
  for (const plugin of plugins) {
    if (plugin === 'harmful') {
      for (const [pluginId, key] of statsKeys) {
        if (pluginId === 'harmful' || pluginId.startsWith('harmful:')) {
          expandedPlugins.add(key);
        }
      }
    } else {
      expandedPlugins.add(statsKeys.get(plugin) ?? plugin);
    }
  }
  return expandedPlugins;
};

/** Groups results by the report's pass-rate threshold. */
export const categorizePlugins = (
  plugins: Set<string> | string[],
  categoryStats: CategoryStats,
  passRateThreshold: number,
): PluginCategories => {
  const compliantPlugins: string[] = [];
  const nonCompliantPlugins: string[] = [];
  const untestedPlugins: string[] = [];

  for (const plugin of plugins) {
    const stats = categoryStats[plugin];
    if (stats && stats.total > 0) {
      if (stats.pass / stats.total >= passRateThreshold) {
        compliantPlugins.push(plugin);
      } else {
        nonCompliantPlugins.push(plugin);
      }
    } else {
      untestedPlugins.push(plugin);
    }
  }

  return {
    compliant: compliantPlugins,
    nonCompliant: nonCompliantPlugins,
    untested: untestedPlugins,
  };
};

export const getPluginDisplayName = (plugin: string): string => {
  const shortPluginId = getFrameworkPluginId(plugin);
  return (
    displayNameOverrides[shortPluginId as keyof typeof displayNameOverrides] ||
    categoryAliases[shortPluginId as keyof typeof categoryAliases] ||
    shortPluginId
  );
};

export const FRAMEWORK_DESCRIPTIONS: Record<string, string> = {
  'dod:ai:ethics': 'DoD AI ethical principles framework',
  'mitre:atlas': 'MITRE ATLAS framework for adversarial threat landscape for AI systems',
  'nist:ai:measure': 'NIST AI Risk Management Framework for responsible AI development',
  'owasp:api': 'OWASP API Top 10 security risks for application programming interfaces',
  'owasp:llm': 'OWASP LLM Top 10 security vulnerabilities for large language models',
  'eu:ai-act': 'EU AI Act for responsible AI development',
};
