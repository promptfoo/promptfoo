import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import { evalResultsTable } from '../../database/tables';
import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';
import invariant from '../../util/invariant';

async function getFailedTestCases(pluginId: string, targetLabel: string): Promise<TestCase[]> {
  logger.warn(`Getting failed test cases for plugin '${pluginId}' and target '${targetLabel}'`);
  const db = getDb();

  try {
    // First, let's check what we have in the database
    const sampleResults = await db
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.success, 0 as any))
      .limit(1);

    if (sampleResults.length > 0) {
      logger.warn('Sample database record:');
      logger.warn(
        JSON.stringify(
          {
            metadata: sampleResults[0].metadata,
            provider: sampleResults[0].provider,
            success: sampleResults[0].success,
            testCase: sampleResults[0].testCase,
          },
          null,
          2,
        ),
      );
    }

    // Now try our actual query
    const query = and(
      eq(evalResultsTable.success, 0 as any),
      sql`json_valid(test_case)`,
      // Look for pluginId in both metadata and test_case.metadata
      sql`(
        (json_valid(metadata) AND json_extract(metadata, '$.pluginId') = ${pluginId})
        OR
        (json_extract(test_case, '$.metadata.pluginId') = ${pluginId})
      )`,
      // Look for label in both provider.label and test_case.provider.label
      sql`(
        (json_valid(provider) AND json_extract(provider, '$.label') = ${targetLabel})
        OR
        (json_extract(test_case, '$.provider.label') = ${targetLabel})
      )`,
    );

    const results = await db
      .select()
      .from(evalResultsTable)
      .where(query)
      .orderBy(evalResultsTable.createdAt)
      .limit(100);

    logger.warn(
      `Found ${results.length} failed test cases for plugin ${pluginId} and target ${targetLabel}`,
    );

    // Log all results for debugging
    if (results.length > 0) {
      logger.warn('First matching result:');
      logger.warn(
        JSON.stringify(
          {
            metadata: results[0].metadata,
            provider: results[0].provider,
            success: results[0].success,
            testCase: results[0].testCase,
          },
          null,
          2,
        ),
      );
    } else {
      // If no results, let's check if we have any failed test cases with this pluginId
      const pluginResults = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.success, 0 as any),
            sql`json_valid(test_case)`,
            sql`(
              (json_valid(metadata) AND json_extract(metadata, '$.pluginId') = ${pluginId})
              OR
              (json_extract(test_case, '$.metadata.pluginId') = ${pluginId})
            )`,
          ),
        )
        .limit(1);

      if (pluginResults.length > 0) {
        logger.warn(
          `Found records with pluginId ${pluginId} but no matching target label. Sample record:`,
        );
        logger.warn(
          JSON.stringify(
            {
              metadata: pluginResults[0].metadata,
              provider: pluginResults[0].provider,
              testCase: pluginResults[0].testCase,
            },
            null,
            2,
          ),
        );
      } else {
        logger.warn(`No records found with pluginId ${pluginId}`);
      }
    }

    // Parse test cases from results
    const testCases = results
      .map((r) => {
        try {
          return typeof r.testCase === 'string' ? JSON.parse(r.testCase) : r.testCase;
        } catch (e) {
          logger.error(`Failed to parse test case: ${e}`);
          return null;
        }
      })
      .filter((tc): tc is TestCase => tc !== null);

    logger.warn(`Successfully parsed ${testCases.length} test cases`);
    return testCases;
  } catch (error) {
    logger.error(`Error retrieving failed test cases: ${error}`);
    return [];
  }
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

  logger.error(`\n\n\nTarget labels: ${targetLabels.join(', ')}\n\n\n`);
  invariant(
    targetLabels.length > 0 && targetLabels.every((label) => typeof label === 'string'),
    'No target labels found in config. The retry strategy requires at least one target label to be specified.',
  );

  logger.warn(`Target labels: ${targetLabels.join(', ')}`);

  // For each plugin, get its failed test cases
  const retryTestCases: TestCase[] = [];
  for (const targetLabel of targetLabels) {
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
  }
  logger.debug(`Added ${retryTestCases.length} retry test cases`);
  return retryTestCases;
}
