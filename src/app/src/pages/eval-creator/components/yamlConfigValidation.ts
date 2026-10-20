import {
  type ConfigDraft,
  normalizeConfigDraft,
  UnifiedConfigDraftSchema,
} from '@promptfoo/types/configDraft';

export function validateYamlConfigDraft(
  value: unknown,
): { success: true; config: ConfigDraft } | { success: false; error: string } {
  const result = UnifiedConfigDraftSchema.safeParse(value);
  if (result.success) {
    // Keep the authored values and unknown keys; only normalize the alias the form cannot store.
    return { success: true, config: normalizeConfigDraft(value as ConfigDraft) };
  }

  const issue = result.error.issues[0];
  return {
    success: false,
    error: issue.path.length
      ? `Invalid YAML configuration at ${issue.path.map(String).join('.')}: ${issue.message}`
      : 'Invalid YAML configuration',
  };
}

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

export function isFullYamlConfig(value: unknown): value is ConfigDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const looksLikeSingleTestCase =
    keys.length > 0 &&
    keys.every((key) => TEST_CASE_FIELDS.has(key)) &&
    !keys.some((key) => FULL_CONFIG_ONLY_FIELDS.has(key));

  return !looksLikeSingleTestCase;
}
