import {
  ADDITIONAL_PLUGINS,
  ADDITIONAL_STRATEGIES,
  AGENTIC_EXEMPT_PLUGINS,
  AGENTIC_PLUGINS,
  ALL_PLUGINS,
  ALL_STRATEGIES,
  BASE_PLUGINS,
  COLLECTIONS,
  CONFIG_REQUIRED_PLUGINS,
  categoryAliases,
  categoryDescriptions,
  DATASET_EXEMPT_PLUGINS,
  DATASET_PLUGINS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  displayNameOverrides,
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  PII_PLUGINS,
  pluginDescriptions,
  REDTEAM_MODEL,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  riskCategories,
  riskCategorySeverityMap,
  Severity,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
  STRATEGY_EXEMPT_PLUGINS,
  severityDisplayNames,
  strategyDescriptions,
  strategyDisplayNames,
  subCategoryDescriptions,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../src/redteam/constants';

describe('constants', () => {
  it('ALL_PLUGINS should contain all plugins sorted', () => {
    expect(ALL_PLUGINS).toEqual(
      [
        ...new Set([
          ...DEFAULT_PLUGINS,
          ...ADDITIONAL_PLUGINS,
          ...CONFIG_REQUIRED_PLUGINS,
          ...AGENTIC_PLUGINS,
        ]),
      ].sort(),
    );
  });

  it('should have descriptions for all risk categories', () => {
    const categories = Object.keys(riskCategories) as (keyof typeof categoryDescriptions)[];
    categories.forEach((category) => {
      expect(categoryDescriptions[category]).toBeDefined();
      expect(typeof categoryDescriptions[category]).toBe('string');
    });
  });
});
