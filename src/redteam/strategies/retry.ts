import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import { evalResultsTable } from '../../database/tables';
import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';
import { isApiProvider } from '../../types/providers';
import invariant from '../../util/invariant';

async function getFailedTestCases(pluginId: string, targetLabel: string): Promise<TestCase[]> {
  const db = getDb();
  const conditions = [
    eq(evalResultsTable.success, false),
    sql`json_extract(metadata, '$.pluginId') = ${pluginId}`,
    sql`json_extract(provider, '$.label') = ${targetLabel}`,
  ];

  const results = await db
    .select()
    .from(evalResultsTable)
    .where(and(...conditions))
    .limit(100); // Reasonable limit to avoid performance issues

  return results.map((r) => r.testCase);
}

function deduplicateTests(tests: TestCase[]): TestCase[] {
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

export async function addRetryTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding retry test cases from previous failures');

  // Get target label from config
  let targetLabel: string | undefined;
  if (config.provider) {
    if (typeof config.provider === 'string') {
      targetLabel = config.provider;
    } else if (isApiProvider(config.provider)) {
      targetLabel = config.provider.label;
    }
  }

  invariant(
    targetLabel,
    'No target label found in config. The retry strategy requires a target label to be specified.',
  );

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

  // For each plugin, get its failed test cases
  const retryTestCases: TestCase[] = [];
  for (const [pluginId, tests] of testsByPlugin.entries()) {
    const failedTests = await getFailedTestCases(pluginId, targetLabel);
    logger.debug(
      `Found ${failedTests.length} failed test cases for plugin ${pluginId} and target ${targetLabel}`,
    );

    // Combine current and failed tests, deduplicate, and take up to the configured number
    const combined = [...tests, ...failedTests];
    const deduped = deduplicateTests(combined);

    // Use configured numTests if available, otherwise use original test count
    const maxTests = typeof config.numTests === 'number' ? config.numTests : tests.length;
    const selected = deduped.slice(0, maxTests);

    retryTestCases.push(...selected);
  }

  logger.debug(`Added ${retryTestCases.length} retry test cases`);
  return retryTestCases;
}
