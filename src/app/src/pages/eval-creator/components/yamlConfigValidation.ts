import type { UnifiedConfig } from '@promptfoo/types';

export const INVALID_FULL_CONFIG_YAML_MESSAGE =
  'Invalid YAML configuration. Upload a full configuration with top-level fields such as providers, prompts, and tests. To import individual test cases, use Import CSV or YAML in Test Cases.';

const TEST_CASE_FIELDS = new Set([
  'description',
  'vars',
  'provider',
  'providers',
  'prompts',
  'providerOutput',
  'assert',
  'assertScoringFunction',
  'options',
  'threshold',
  'metadata',
]);
const TEST_CASE_ONLY_FIELDS = new Set([
  'vars',
  'provider',
  'providerOutput',
  'assert',
  'assertScoringFunction',
  'threshold',
  'metadata',
  'options',
]);
const FULL_CONFIG_ONLY_FIELDS = new Set([
  'targets',
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
  const hasConfigSection = keys.some((key) => key === 'providers' || key === 'prompts');
  const looksLikeSingleTestCase =
    keys.length > 0 &&
    keys.every((key) => TEST_CASE_FIELDS.has(key)) &&
    !keys.some((key) => FULL_CONFIG_ONLY_FIELDS.has(key)) &&
    (!hasConfigSection || keys.some((key) => TEST_CASE_ONLY_FIELDS.has(key)));

  return !looksLikeSingleTestCase;
}
