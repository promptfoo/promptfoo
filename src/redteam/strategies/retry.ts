import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database/index';
import { evalResultsTable } from '../../database/tables';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { makeRequest } from '../../util/cloud';
import invariant from '../../util/invariant';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

/**
 * Check if we should use cloud mode for fetching failed test cases
 */
function isCloudMode(): boolean {
  return cloudConfig.isEnabled();
}

export function deduplicateTests(tests: TestCase[]): TestCase[] {
  const seen = new Set<string>();
  return tests.filter((test) => {
    // Include strategyId in deduplication key - tests with the same prompt but different
    // strategies (e.g., plugin-only vs goat) should be considered different test cases
    const strategyId = test.metadata?.strategyId || 'none';
    const key = JSON.stringify({ vars: test.vars, strategyId });
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getFailedTestCases(
  pluginId: string,
  targetId: string,
  limit: number = 100,
): Promise<TestCase[]> {
  logger.debug(
    `Searching for failed test cases: plugin='${pluginId}', targetId='${targetId}', limit=${limit}, cloudMode=${isCloudMode()}`,
  );

  const allTestCases: TestCase[] = [];

  try {
    // Try to fetch from cloud API if available
    if (isCloudMode()) {
      logger.debug(
        `Fetching failed test cases from cloud API: plugin='${pluginId}', targetId='${targetId}'`,
      );

      try {
        // makeRequest already prepends the apiHost and /api/v1/, so just pass the path
        // Use GET with query params
        const queryParams = new URLSearchParams({
          pluginId,
          targetId,
          limit: String(limit),
        });
        const response = await makeRequest(`results/failed-tests?${queryParams.toString()}`, 'GET');

        if (response.ok) {
          const data = await response.json();
          const cloudTestCases = (data.testCases || []).map((testCase: TestCase) => {
            // Strip the provider from cloud test cases - redteam providers (best-of-n, goat, etc.)
            // require runtime config (injectVar) that isn't stored in the cloud database.
            const { provider: _provider, ...testCaseWithoutProvider } = testCase;
            return testCaseWithoutProvider;
          });
          allTestCases.push(...cloudTestCases);

          logger.debug(
            `Retrieved ${cloudTestCases.length} failed test cases from cloud for plugin '${pluginId}' and target '${targetId}'`,
          );
        } else {
          logger.error(
            `Failed to fetch failed test cases from cloud API: ${response.status} ${response.statusText}`,
          );
        }
      } catch (cloudError) {
        logger.error(`Error fetching from cloud API: ${cloudError}`);
      }
    }

    // Always also check local SQLite database
    logger.debug(
      `Fetching failed test cases from local SQLite database: plugin='${pluginId}', targetId='${targetId}'`,
    );

    const db = getDb();

    const targetResults = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.success, 0 as any),
          sql`json_valid(provider)`,
          sql`json_extract(provider, '$.id') = ${targetId}`,
        ),
      )
      .orderBy(desc(evalResultsTable.updatedAt))
      .limit(1);

    if (targetResults.length === 0) {
      logger.debug(`No failed test cases found for targetId '${targetId}'`);
      return [];
    }

    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.success, 0 as any),
          sql`json_valid(provider)`,
          sql`json_extract(provider, '$.id') = ${targetId}`,
          sql`json_valid(test_case)`,
          sql`json_extract(test_case, '$.metadata.pluginId') = ${pluginId}`,
        ),
      )
      .orderBy(desc(evalResultsTable.updatedAt))
      .limit(limit);

    const localTestCases = results
      .map((r) => {
        try {
          const testCase: TestCase =
            typeof r.testCase === 'string' ? JSON.parse(r.testCase) : r.testCase;

          const { strategyConfig: _strategyConfig, ...restMetadata } = testCase.metadata || {};

          // Strip the provider from retry tests - redteam providers (best-of-n, goat, etc.)
          // require runtime config (injectVar) that isn't stored in the database.
          // The eval will use the default target provider instead.
          const { provider: _provider, ...testCaseWithoutProvider } = testCase;

          const result = {
            ...testCaseWithoutProvider,
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

          logger.debug(
            `Retrieved test case - pluginId: ${result.metadata?.pluginId}, strategyId: ${result.metadata?.strategyId}`,
          );
          logger.debug(`  Prompt: ${JSON.stringify(result.vars?.prompt || result.vars)?.substring(0, 200)}...`);

          return result;
        } catch (e) {
          logger.debug(`Failed to parse test case: ${e}`);
          return null;
        }
      })
      .filter((tc): tc is NonNullable<typeof tc> => tc !== null);

    allTestCases.push(...localTestCases);

    logger.debug(
      `Found ${results.length} failed test cases in local SQLite for plugin '${pluginId}' and target '${targetId}'`,
    );

    // Deduplicate combined results from both cloud and local
    const unique = deduplicateTests(allTestCases);
    logger.debug(
      `Total: ${allTestCases.length} failed test cases (cloud + local), ${unique.length} unique`,
    );
    return unique;
  } catch (error) {
    logger.error(`Error retrieving failed test cases: ${error}`);
    return [];
  }
}

export async function addRetryTestCases(
  testCases: TestCaseWithPlugin[],
  _injectVar: string,
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

  const targetIds: string[] = (config?.targetIds ?? []) as string[];

  invariant(
    targetIds.length > 0 && targetIds.every((id) => typeof id === 'string'),
    'No target IDs found in config. The retry strategy requires at least one target ID to be specified.',
  );

  logger.debug(`Processing target IDs: ${targetIds.join(', ')}`);

  // For each plugin, get its failed test cases
  const retryTestCases: TestCase[] = [];
  for (const targetId of targetIds) {
    for (const [pluginId, tests] of testsByPlugin.entries()) {
      // Use configured numTests if available, otherwise use original test count
      const maxTests = typeof config.numTests === 'number' ? config.numTests : tests.length;

      // Fetch only the number of tests we need for efficiency
      const failedTests = await getFailedTestCases(pluginId, targetId, maxTests);

      // Don't add a provider to retry test cases - the eval will use the default target provider.
      // Redteam providers (best-of-n, goat, etc.) require runtime config (injectVar) that
      // isn't stored in the database, so we intentionally leave retry tests without a provider.
      retryTestCases.push(...failedTests);
    }
  }

  const deduped = deduplicateTests(retryTestCases);

  // Mark all retry tests with retry: true flag, preserve original strategyId (even if undefined)
  const marked = deduped.map((test) => ({
    ...test,
    metadata: {
      ...test.metadata,
      retry: true,
    },
  }));

  logger.debug(`Added ${marked.length} unique retry test cases`);
  return marked;
}
