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

const qualify = (plugin: string) => `promptfoo:redteam:${plugin}`;

/** Report versions can store separate results under both spellings of an ID. */
export function getFrameworkPluginStats(
  plugin: string,
  categoryStats: CategoryStats,
): TestResultStats & { alias?: string } {
  const id = getFrameworkPluginId(plugin);
  const short = categoryStats[id];
  const qualified = categoryStats[qualify(id)];
  if (!short || !qualified) {
    return short ?? qualified ?? { pass: 0, total: 0, failCount: 0 };
  }
  return {
    pass: short.pass + qualified.pass,
    total: short.total + qualified.total,
    failCount: short.failCount + qualified.failCount,
    passWithFilter: (short.passWithFilter ?? 0) + (qualified.passWithFilter ?? 0),
    alias: plugin === id ? qualify(id) : id,
  };
}

/** Keep one key per plugin, preserving qualified IDs for links into older reports. */
export const expandPluginCollections = (
  plugins: string[],
  categoryStats: CategoryStats,
): Set<string> => {
  const expanded = new Set<string>();
  const add = (id: string) => {
    expanded.add(!categoryStats[id] && categoryStats[qualify(id)] ? qualify(id) : id);
  };
  for (const plugin of plugins.map(getFrameworkPluginId)) {
    if (plugin === 'harmful') {
      for (const id of Object.keys(categoryStats).map(getFrameworkPluginId)) {
        if (id === 'harmful' || id.startsWith('harmful:')) {
          add(id);
        }
      }
    } else {
      add(plugin);
    }
  }
  return expanded;
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
    const stats = getFrameworkPluginStats(plugin, categoryStats);
    if (stats.total > 0) {
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
