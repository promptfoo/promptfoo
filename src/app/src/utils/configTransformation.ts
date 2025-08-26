import { UnifiedConfigSchema } from '../../../types';
import type { UnifiedConfig } from '../../../types';

/**
 * Transforms a results config (from table store) into a setup config (for eval config store)
 * Ensures all required fields are properly mapped and validated
 */
export function transformResultsConfigToSetupConfig(
  resultsConfig: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  // Create a clean copy of the config
  const setupConfig: Partial<UnifiedConfig> = {
    // Core required fields
    description: resultsConfig.description || '',

    // Providers - ensure it's an array of proper provider objects
    providers: Array.isArray(resultsConfig.providers)
      ? resultsConfig.providers.filter((provider) => provider !== null && provider !== undefined)
      : [],

    // Prompts - handle various prompt formats
    prompts: Array.isArray(resultsConfig.prompts)
      ? resultsConfig.prompts.filter((prompt) => prompt !== null && prompt !== undefined)
      : [],

    // Tests/testCases - ensure proper format
    tests: Array.isArray(resultsConfig.tests)
      ? resultsConfig.tests.filter((test) => test !== null && test !== undefined)
      : [],

    // Optional fields with defaults
    defaultTest: resultsConfig.defaultTest || {},
    derivedMetrics: resultsConfig.derivedMetrics || [],
    env: resultsConfig.env || {},
    evaluateOptions: resultsConfig.evaluateOptions || {},
    scenarios: resultsConfig.scenarios || [],
    extensions: resultsConfig.extensions || [],

    // Preserve additional metadata
    tags: resultsConfig.tags,
    sharing: resultsConfig.sharing,
    redteam: resultsConfig.redteam,
    metadata: resultsConfig.metadata,
  };

  // Remove undefined fields to keep the config clean
  Object.keys(setupConfig).forEach((key) => {
    if (setupConfig[key as keyof typeof setupConfig] === undefined) {
      delete setupConfig[key as keyof typeof setupConfig];
    }
  });

  return setupConfig;
}

/**
 * Validates a config object against the UnifiedConfig schema
 * Returns validation result with success flag and any errors
 */
export function validateConfigCompleteness(config: Partial<UnifiedConfig>) {
  const validation = UnifiedConfigSchema.safeParse(config);

  return {
    isValid: validation.success,
    errors: validation.success ? [] : validation.error.errors,
    data: validation.success ? validation.data : null,
  };
}

/**
 * Merges user changes from the setup config back with the original results config
 * Preserves important metadata while allowing user modifications
 */
export function mergeConfigChanges(
  originalConfig: Partial<UnifiedConfig>,
  userConfig: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  // Start with the user's changes as the base
  const merged = { ...userConfig };

  // Preserve important metadata from the original that users shouldn't lose
  if (originalConfig.tags && !merged.tags) {
    merged.tags = originalConfig.tags;
  }

  if (originalConfig.metadata && !merged.metadata) {
    merged.metadata = originalConfig.metadata;
  }

  // Preserve evaluation options if user didn't modify them
  if (originalConfig.evaluateOptions && !merged.evaluateOptions) {
    merged.evaluateOptions = originalConfig.evaluateOptions;
  }

  return merged;
}

/**
 * Creates a minimal valid config for cases where the results config is incomplete
 */
export function createMinimalValidConfig(
  baseConfig?: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  return {
    description: baseConfig?.description || 'Evaluation Configuration',
    providers: baseConfig?.providers || [],
    prompts: baseConfig?.prompts || [],
    tests: baseConfig?.tests || [],
    defaultTest: baseConfig?.defaultTest || {},
    derivedMetrics: baseConfig?.derivedMetrics || [],
    env: baseConfig?.env || {},
    evaluateOptions: baseConfig?.evaluateOptions || {},
    scenarios: baseConfig?.scenarios || [],
    extensions: baseConfig?.extensions || [],
    ...baseConfig,
  };
}

/**
 * Checks if a config has the minimum required fields to be useful in the setup page
 */
export function hasMinimumRequiredFields(config: Partial<UnifiedConfig>): boolean {
  return Boolean(
    config &&
      ((Array.isArray(config.providers) && config.providers.length > 0) ||
        (Array.isArray(config.prompts) && config.prompts.length > 0)),
  );
}

/**
 * Extracts the configuration differences between two configs
 * Useful for showing users what changed during edit and re-run
 */
export function getConfigDifferences(
  originalConfig: Partial<UnifiedConfig>,
  newConfig: Partial<UnifiedConfig>,
): {
  added: string[];
  modified: string[];
  removed: string[];
} {
  const differences = {
    added: [] as string[],
    modified: [] as string[],
    removed: [] as string[],
  };

  const originalKeys = new Set(Object.keys(originalConfig));
  const newKeys = new Set(Object.keys(newConfig));

  // Find added keys
  for (const key of newKeys) {
    if (!originalKeys.has(key)) {
      differences.added.push(key);
    }
  }

  // Find removed keys
  for (const key of originalKeys) {
    if (!newKeys.has(key)) {
      differences.removed.push(key);
    }
  }

  // Find modified keys
  for (const key of originalKeys) {
    if (newKeys.has(key)) {
      const originalValue = originalConfig[key as keyof UnifiedConfig];
      const newValue = newConfig[key as keyof UnifiedConfig];

      if (JSON.stringify(originalValue) !== JSON.stringify(newValue)) {
        differences.modified.push(key);
      }
    }
  }

  return differences;
}
