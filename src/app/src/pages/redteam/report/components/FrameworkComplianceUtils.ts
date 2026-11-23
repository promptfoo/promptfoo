import {
  ALIASED_PLUGIN_MAPPINGS,
  categoryAliases,
  DOD_AI_ETHICS_PRINCIPLE_NAMES,
  displayNameOverrides,
  OWASP_API_TOP_10_NAMES,
  OWASP_LLM_TOP_10_NAMES,
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

export function getFrameworkPlugins(framework: string, stats: CategoryStats) {
  const controls = Object.values(ALIASED_PLUGIN_MAPPINGS[framework] ?? {});
  return expandPluginCollections(
    controls.flatMap(({ plugins }) => plugins),
    stats,
  );
}

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

const numberedCategories: Partial<Record<string, string[]>> = {
  'owasp:llm': OWASP_LLM_TOP_10_NAMES,
  'owasp:api': OWASP_API_TOP_10_NAMES,
  'dod:ai:ethics': DOD_AI_ETHICS_PRINCIPLE_NAMES,
};

export function hasNamedCategories(framework: string) {
  return framework in numberedCategories || framework === 'aiuc:1';
}

export function getCategoryLabel(framework: string, categoryId: string) {
  const name = ALIASED_PLUGIN_MAPPINGS[framework]?.[categoryId]?.name;
  if (name) {
    return name;
  }
  const number = categoryId.split(':').pop() ?? categoryId;
  const label = numberedCategories[framework]?.[Number(number) - 1] ?? `Category ${number}`;
  return `${number}. ${label}`;
}

// A missing control (including one without a built-in plugin) is not a pass.
export function getAiucCoverageGap(
  stats: CategoryStats,
): 'Not tested' | 'Partial coverage' | undefined {
  const controls = Object.values(ALIASED_PLUGIN_MAPPINGS['aiuc:1']);
  const tested = (id: string) => stats[id]?.total > 0;
  if (!controls.some(({ plugins }) => plugins.some(tested))) {
    return 'Not tested';
  }
  if (
    controls.some(
      ({ plugins, untestedBehavior }) =>
        untestedBehavior || !plugins.length || !plugins.every(tested),
    )
  ) {
    return 'Partial coverage';
  }
}

export const FRAMEWORK_DESCRIPTIONS: Record<string, string> = {
  'aiuc:1': 'Technical tests for AIUC-1 readiness, not a certification assessment.',
  'dod:ai:ethics': 'DoD AI ethical principles framework',
  'mitre:atlas': 'MITRE ATLAS framework for adversarial threat landscape for AI systems',
  'nist:ai:measure': 'NIST AI Risk Management Framework for responsible AI development',
  'owasp:api': 'OWASP API Top 10 security risks for application programming interfaces',
  'owasp:llm': 'OWASP LLM Top 10 security vulnerabilities for large language models',
  'eu:ai-act': 'EU AI Act for responsible AI development',
};
