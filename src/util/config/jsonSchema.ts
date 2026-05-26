/**
 * Provider JSON Schema locations that should be excluded from config-level
 * $ref dereferencing.
 *
 * These schemas may contain internal refs (for example, #/$defs/Type) that
 * are relative to the schema root, not the surrounding promptfoo config or
 * external test file. Provider APIs expect those refs to be preserved.
 *
 * @see https://github.com/promptfoo/promptfoo/issues/364
 */
const PROVIDER_CONFIG_PATH_PATTERNS: readonly RegExp[] = [
  /^#\/(?:providers|targets)\/\d+\/(?:[^/]+\/)?config(?:\/|$)/,
  /^#\/(?:[^/]+\/)*provider\/(?:[^/]+\/)?config(?:\/|$)/,
] as const;

const STANDALONE_JSON_SCHEMA_PATH_PATTERN =
  /\/(?:tools\/\d+\/function\/parameters|functions\/\d+\/parameters|response_format\/(?:json_schema\/)?schema)(?:\/.*)?$/;

export function isProviderJsonSchemaPath(refPath: string): boolean {
  return (
    STANDALONE_JSON_SCHEMA_PATH_PATTERN.test(refPath) &&
    PROVIDER_CONFIG_PATH_PATTERNS.some((pattern) => pattern.test(refPath))
  );
}
