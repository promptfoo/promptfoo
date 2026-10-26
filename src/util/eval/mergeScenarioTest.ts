import type { AtomicTestCase, TestSuite } from '../../types/index';

export function mergeScenarioTest(
  testSuite: TestSuite,
  data: NonNullable<TestSuite['scenarios']>[number]['config'][number],
  test: NonNullable<TestSuite['scenarios']>[number]['tests'][number],
  scenarioIndex: number,
): AtomicTestCase {
  const defaultTest = typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined;
  const mergedMetadata = {
    ...(defaultTest?.metadata || {}),
    ...data.metadata,
    ...test.metadata,
  };
  mergedMetadata.conversationId ??= `__scenario_${scenarioIndex}__`;

  return {
    ...(defaultTest || {}),
    ...data,
    ...test,
    vars: {
      ...(defaultTest?.vars || {}),
      ...data.vars,
      ...test.vars,
    },
    options: {
      ...(defaultTest?.options || {}),
      ...data.options,
      ...test.options,
    },
    assert: [...(data.assert || []), ...(test.assert || [])],
    metadata: mergedMetadata,
  } as AtomicTestCase;
}
