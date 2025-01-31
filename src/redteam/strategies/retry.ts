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
    logger.warn('Step 1: Finding failed test cases from target...');
    // First find all failed test cases from this target
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

    logger.warn(`Found ${targetResults.length} results for target`);

    if (targetResults.length === 0) {
      logger.warn(`No failed test cases found for target ${targetLabel}`);
      // Let's check if we have any records with this target label at all
      const anyTargetResults = await db
        .select()
        .from(evalResultsTable)
        .where(sql`json_extract(provider, '$.label') = ${targetLabel}`)
        .limit(1);

      if (anyTargetResults.length > 0) {
        logger.warn('Found records with this target label, but none failed');
        const provider =
          typeof anyTargetResults[0].provider === 'string'
            ? JSON.parse(anyTargetResults[0].provider)
            : anyTargetResults[0].provider;
        logger.warn(`Sample provider info: ${JSON.stringify(provider, null, 2)}`);
      } else {
        logger.warn('No records found with this target label at all');

        // Let's check what provider labels we do have
        const sampleProviders = await db
          .select()
          .from(evalResultsTable)
          .where(sql`json_valid(provider)`)
          .limit(5);

        if (sampleProviders.length > 0) {
          logger.warn('Available provider labels:');
          sampleProviders.forEach((r) => {
            const provider = typeof r.provider === 'string' ? JSON.parse(r.provider) : r.provider;
            logger.warn(`- ${provider.label || '(empty label)'} (${provider.id})`);
          });
        }
      }
      return [];
    }

    // Log a sample target result
    logger.warn('Sample target result:');
    const sampleProvider =
      typeof targetResults[0].provider === 'string'
        ? JSON.parse(targetResults[0].provider)
        : targetResults[0].provider;
    logger.warn(
      JSON.stringify(
        {
          provider: sampleProvider,
          success: targetResults[0].success,
        },
        null,
        2,
      ),
    );

    logger.warn('Step 2: Finding failed test cases from target and plugin...');
    // Now find all failed test cases from this target and plugin
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

    logger.warn(
      `Found ${results.length} failed test cases for plugin ${pluginId} and target ${targetLabel}`,
    );

    // Log the first matching result
    if (results.length > 0) {
      logger.warn('First matching result:');
      const firstProvider =
        typeof results[0].provider === 'string'
          ? JSON.parse(results[0].provider)
          : results[0].provider;
      const firstTestCase =
        typeof results[0].testCase === 'string'
          ? JSON.parse(results[0].testCase)
          : results[0].testCase;
      logger.warn(
        JSON.stringify(
          {
            provider: firstProvider,
            testCase: firstTestCase,
            success: results[0].success,
          },
          null,
          2,
        ),
      );
    } else {
      // If we found target results but no plugin results, let's check the test cases
      logger.warn('Examining test cases to debug why no matches were found...');
      const sampleTestCases = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.success, 0 as any),
            sql`json_valid(provider)`,
            sql`json_extract(provider, '$.label') = ${targetLabel}`,
            sql`json_valid(test_case)`,
          ),
        )
        .limit(3);

      if (sampleTestCases.length > 0) {
        logger.warn('Sample test cases from target:');
        sampleTestCases.forEach((tc, i) => {
          const testCase = typeof tc.testCase === 'string' ? JSON.parse(tc.testCase) : tc.testCase;
          const provider = typeof tc.provider === 'string' ? JSON.parse(tc.provider) : tc.provider;
          logger.warn(
            `Test case ${i + 1}: ${JSON.stringify(
              {
                provider,
                testCase,
                metadata: testCase.metadata,
              },
              null,
              2,
            )}`,
          );
        });
      }
    }

    // Parse test cases from results
    logger.warn('Step 3: Parsing test cases...');
    const testCases = results
      .map((r) => {
        try {
          const parsed = typeof r.testCase === 'string' ? JSON.parse(r.testCase) : r.testCase;
          logger.warn(
            `Successfully parsed test case: ${JSON.stringify(
              {
                pluginId: parsed.metadata?.pluginId,
                vars: parsed.vars,
              },
              null,
              2,
            )}`,
          );
          return parsed;
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
      // Use configured numTests if available, otherwise use original test count
      const maxTests = typeof config.numTests === 'number' ? config.numTests : tests.length;
      const selected = failedTests.slice(0, maxTests);

      retryTestCases.push(...selected);
    }
  }
  logger.debug(`Added ${retryTestCases.length} retry test cases`);
  const deduped = deduplicateTests(retryTestCases);
  return deduped;
}
