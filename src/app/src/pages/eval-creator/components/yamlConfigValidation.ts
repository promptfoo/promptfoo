import type { UnifiedConfig } from '@promptfoo/types';

export const INVALID_FULL_CONFIG_YAML_MESSAGE =
  'Invalid YAML configuration. Upload a full configuration with top-level fields such as providers, prompts, and tests. To import individual test cases, use Import CSV or YAML in Test Cases.';

const TEST_CASE_FIELDS = new Set(['vars', 'assert', 'options']);
const FULL_CONFIG_FIELDS = new Set([
  'providers',
  'targets',
  'prompts',
  'tests',
  'scenarios',
  'defaultTest',
  'evaluateOptions',
  'commandLineOptions',
  'env',
  'derivedMetrics',
  'extensions',
  'redteam',
  'sharing',
  'outputPath',
  'nunjucksFilters',
  'tracing',
  'writeLatestResults',
]);

export function isFullYamlConfig(value: unknown): value is Partial<UnifiedConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const looksLikeSingleTestCase =
    keys.some((key) => TEST_CASE_FIELDS.has(key)) &&
    !keys.some((key) => FULL_CONFIG_FIELDS.has(key));

  return !looksLikeSingleTestCase;
}
