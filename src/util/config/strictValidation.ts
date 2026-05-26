import { type AssertionOrSet, type TestCase, TestSuiteConfigSchema } from '../../types/index';

/**
 * Top-level config keys accepted by the unified config schema, including the deprecated aliases
 * that {@link resolveConfigs} auto-migrates (`plugins`, `strategies`).
 */
const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  // Keys defined on TestSuiteConfigSchema.
  ...Object.keys(TestSuiteConfigSchema.shape),
  // Keys added by UnifiedConfigSchema.extend(...).
  'evaluateOptions',
  'commandLineOptions',
  'targets',
  // Conventional JSON Schema declaration used for editor tooling.
  '$schema',
  // Conventional JSON Schema reusable definition containers.
  '$defs',
  'definitions',
  // Reusable assertion container supported by examples using local `$ref` values.
  'assertionTemplates',
  // Deprecated aliases auto-migrated by the loader — not typos.
  'plugins',
  'strategies',
]);

/**
 * Return the list of top-level keys in `rawConfig` that do not match any documented
 * UnifiedConfig field. Useful for catching typos like `assert:` written at the top level when the
 * user meant `defaultTest.assert`.
 *
 * `rawConfig` should be the config object as parsed from disk, before zod stripping or property
 * renames, so that typos are still visible.
 */
export function findUnknownTopLevelKeys(rawConfig: Record<string, unknown>): string[] {
  return Object.keys(rawConfig).filter(
    (key) => !KNOWN_TOP_LEVEL_KEYS.has(key) && !key.startsWith('x-'),
  );
}

/**
 * Return the indices of tests that have no assertions configured, taking into account assertions
 * inherited from `defaultTest`. Tests that only override metadata or vars but still inherit a
 * non-empty `defaultTest.assert` are considered to have assertions.
 *
 * Used by strict mode to fail evaluations that would otherwise silently "pass" because no
 * assertion was ever evaluated.
 */
export function findTestsWithoutAssertions(
  tests: TestCase[],
  defaultTest?: Partial<TestCase>,
): number[] {
  const offenders: number[] = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    if (!t) {
      continue;
    }
    const inheritsDefaultAssertions = t.options?.disableDefaultAsserts !== true;
    if (
      hasEffectiveAssertions(t.assert) ||
      (inheritsDefaultAssertions && hasEffectiveAssertions(defaultTest?.assert))
    ) {
      continue;
    }
    offenders.push(i);
  }
  return offenders;
}

function hasEffectiveAssertions(
  assertions: AssertionOrSet[] | undefined,
  nestedInAssertionSet = false,
): boolean {
  return (
    Array.isArray(assertions) &&
    assertions.some((assertion) => {
      if (assertion.type === 'assert-set') {
        return hasEffectiveAssertions(assertion.assert, true);
      }
      if (
        nestedInAssertionSet &&
        (assertion.type.startsWith('select-') || assertion.type === 'max-score')
      ) {
        return false;
      }
      return true;
    })
  );
}
