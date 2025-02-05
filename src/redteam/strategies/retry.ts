import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import { evalResultsTable } from '../../database/tables';
import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';
import invariant from '../../util/invariant';

export function deduplicateTests(tests: TestCase[]): TestCase[] {
  const seen = new Set<string>();
  return tests.filter((test) => {
    const key = JSON.stringify(test.vars);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getFailedTestCases(pluginId: string, targetLabel: string): Promise<TestCase[]> {
  logger.debug(`Searching for failed test cases: plugin='${pluginId}', target='${targetLabel}'`);
  const db = getDb();

  try {
    const targetResults = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.success, 0 as any),
          sql`json_valid(provider)`,
          sql`json_extract(provider, '$.label') = ${targetLabel}`,
        ),
      )
      .orderBy(evalResultsTable.createdAt)
      .limit(1);

    if (targetResults.length === 0) {
      logger.debug(`No failed test cases found for target '${targetLabel}'`);
      return [];
    }

    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.success, 0 as any),
          sql`json_valid(provider)`,
          sql`json_extract(provider, '$.label') = ${targetLabel}`,
          sql`json_valid(test_case)`,
          sql`json_extract(test_case, '$.metadata.pluginId') = ${pluginId}`,
        ),
      )
      .orderBy(evalResultsTable.createdAt)
      .limit(100);

    const testCases = results
      .map((r) => {
        try {
          const testCase: TestCase =
            typeof r.testCase === 'string' ? JSON.parse(r.testCase) : r.testCase;

          const { options: _options, ...rest } = testCase;
          const { strategyConfig: _strategyConfig, ...restMetadata } = rest.metadata || {};

          return {
            ...rest,
            ...(testCase.provider ? { provider: testCase.provider } : {}),
            metadata: {
              ...restMetadata,
              originalEvalId: r.evalId,
              strategyConfig: undefined,
            },
            assert: testCase.assert?.map((assertion) => ({
              ...assertion,
              metric: assertion.metric?.split('/')[0],
            })),
          } as TestCase;
        } catch (e) {
          logger.debug(`Failed to parse test case: ${e}`);
          return null;
        }
      })
      .filter((tc): tc is NonNullable<typeof tc> => tc !== null);

    const unique = deduplicateTests(testCases);
    logger.debug(
      `Found ${results.length} failed test cases for plugin '${pluginId}' and target '${targetLabel}', ${unique.length} unique`,
    );
    return unique;
  } catch (error) {
    logger.debug(`Error retrieving failed test cases: ${error}`);
    return [];
  }
}

export async function addRetryTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding retry test cases from previous failures');

  // Group test cases by plugin ID
  const testsByPlugin = new Map<string, TestCaseWithPlugin[]>();
  for (const test of testCases) {
    const pluginId = test.metadata?.pluginId;
    if (!pluginId) {
      continue;
    }

    if (!testsByPlugin.has(pluginId)) {
      testsByPlugin.set(pluginId, []);
    }
    testsByPlugin.get(pluginId)!.push(test);
  }

  const targetLabels: string[] = (config?.targetLabels ?? []) as string[];

  invariant(
    targetLabels.length > 0 && targetLabels.every((label) => typeof label === 'string'),
    'No target labels found in config. The retry strategy requires at least one target label to be specified.',
  );

  logger.debug(`Processing target labels: ${targetLabels.join(', ')}`);

  // For each plugin, get its failed test cases
  const retryTestCases: TestCase[] = [];
  for (const targetLabel of targetLabels) {
    for (const [pluginId, tests] of testsByPlugin.entries()) {
      const failedTests = await getFailedTestCases(pluginId, targetLabel);
      // Use configured numTests if available, otherwise use original test count
      const maxTests = typeof config.numTests === 'number' ? config.numTests : tests.length;
      const selected = failedTests.slice(0, maxTests);

      // Get provider configuration from an existing test case if available
      const existingTest = tests.find((t) => t.provider && typeof t.provider === 'object');

      // Ensure each test case has a proper provider configuration
      const withProvider = selected.map((test) => {
        // If test has a provider in object format already, keep it
        if (test.provider && typeof test.provider === 'object') {
          return test;
        }

        // If test has a string provider, convert it to object format
        if (test.provider && typeof test.provider === 'string') {
          return {
            ...test,
            provider: {
              id: test.provider,
              config: {
                injectVar,
              },
            },
          };
        }

        // If no provider, use the one from existing test if available
        if (existingTest?.provider) {
          return {
            ...test,
            provider: existingTest.provider,
          };
        }
        return test;
      });

      retryTestCases.push(...withProvider);
    }
  }

  const deduped = deduplicateTests(retryTestCases);
  logger.debug(`Added ${deduped.length} unique retry test cases`);
  return deduped;
}
