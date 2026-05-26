/**
 * Standalone JSON Schema locations that should be excluded from surrounding
 * config or external test-file $ref dereferencing.
 *
 * These schemas may contain internal refs (for example, #/$defs/Type) that
 * are relative to the schema root, not the surrounding promptfoo config or
 * external test file. Provider APIs expect those refs to be preserved,
 * whether supplied on a provider, prompt, or test option.
 *
 * @see https://github.com/promptfoo/promptfoo/issues/364
 */
const STANDALONE_SCHEMA_CONTEXT_PATH_PATTERNS: readonly RegExp[] = [
  /^#\/(?:providers|targets)\/\d+\/(?:[^/]+\/)?config(?:\/|$)/,
  /^#\/(?:[^/]+\/)*provider\/(?:[^/]+\/)?config(?:\/|$)/,
  /^#\/prompts\/\d+\/(?:[^/]+\/)?config(?:\/|$)/,
  /^#\/(?:[^/]+\/)*options(?:\/|$)/,
] as const;

const STANDALONE_JSON_SCHEMA_PATH_PATTERN =
  /\/(?:tools\/\d+\/function\/parameters|functions\/\d+\/parameters|response_format\/(?:json_schema\/)?schema)(?:\/.*)?$/;

export function isStandaloneJsonSchemaPath(refPath: string): boolean {
  return (
    STANDALONE_JSON_SCHEMA_PATH_PATTERN.test(refPath) &&
    STANDALONE_SCHEMA_CONTEXT_PATH_PATTERNS.some((pattern) => pattern.test(refPath))
  );
}
