import {
  type AssertionOrSet,
  type TestCase,
  type TestSuite,
  TestSuiteConfigSchema,
} from '../../types/index';

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
  return Object.keys(rawConfig).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key));
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

function hasEffectiveAssertions(assertions: AssertionOrSet[] | undefined): boolean {
  return (
    Array.isArray(assertions) &&
    assertions.some(
      (assertion) => assertion.type !== 'assert-set' || hasEffectiveAssertions(assertion.assert),
    )
  );
}

/**
 * Return indices for each effective eval row that has no assertion after evaluator-style
 * expansion of implicit and scenario tests.
 */
export function findTestSuiteRowsWithoutAssertions(
  testSuite: Pick<TestSuite, 'defaultTest' | 'scenarios' | 'tests'>,
): number[] {
  const defaultTest = typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined;
  const directTests =
    testSuite.tests && testSuite.tests.length > 0
      ? testSuite.tests
      : testSuite.scenarios
        ? []
        : ([{}] as TestCase[]);
  const scenarioTests =
    testSuite.scenarios?.flatMap((scenario) =>
      scenario.config.flatMap((data) =>
        (scenario.tests || ([{}] as TestCase[])).map((test) => ({
          ...test,
          options: {
            ...(defaultTest?.options || {}),
            ...(test.options || {}),
          },
          assert: [...(data.assert || []), ...(test.assert || [])],
        })),
      ),
    ) || [];

  return findTestsWithoutAssertions([...directTests, ...scenarioTests], defaultTest);
}
