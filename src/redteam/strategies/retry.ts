import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database/index';
import { evalResultsTable } from '../../database/tables';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { makeRequest } from '../../util/cloud';
import { deduplicateTestCases } from '../../util/comparison';
import invariant from '../../util/invariant';
import { AGENTIC_STRATEGIES, MULTI_TURN_STRATEGIES } from '../constants/strategies';

import type { ProviderResponse, TestCase, TestCaseWithPlugin } from '../../types/index';

// Single-turn strategies = AGENTIC but NOT MULTI_TURN
// These strategies iterate to find successful attacks but each attempt is a single turn
const SINGLE_TURN_STRATEGIES = AGENTIC_STRATEGIES.filter(
  (s) => !MULTI_TURN_STRATEGIES.includes(s as any),
);

function isSingleTurnStrategy(strategyId: string | undefined): boolean {
  return strategyId ? SINGLE_TURN_STRATEGIES.includes(strategyId as any) : false;
}

/**
 * Transform a raw result (testCase + response) into a TestCase ready for retry
 * Handles redteamFinalPrompt extraction for single-turn strategies
 */
function transformResult(
  testCase: TestCase,
  response: ProviderResponse | null,
  evalId: string,
): TestCase | null {
  try {
    const { strategyConfig: _strategyConfig, ...restMetadata } = testCase.metadata || {};
    const strategyId = testCase.metadata?.strategyId;

    // For single-turn strategies, use the final attack prompt from the response
    // This is the prompt that was actually used in the successful/failed attack
    let finalVars = testCase.vars;
    if (isSingleTurnStrategy(strategyId) && testCase.vars) {
      const redteamFinalPrompt = response?.metadata?.redteamFinalPrompt;
      if (redteamFinalPrompt) {
        // Find the injectVar key (usually 'prompt') and replace with final prompt
        const injectVar = (testCase.provider as any)?.config?.injectVar || 'prompt';
        finalVars = {
          ...testCase.vars,
          [injectVar]: redteamFinalPrompt,
        };
      }
    }

    return {
      ...testCase,
      vars: finalVars,
      metadata: {
        ...restMetadata,
        originalEvalId: evalId,
        strategyConfig: undefined,
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric?.split('/')[0],
      })),
    } as TestCase;
  } catch (e) {
    logger.debug(`Failed to transform test case: ${e}`);
    return null;
  }
}

async function getFailedTestCases(
  pluginId: string,
  targetId: string,
  limit: number = 100,
): Promise<TestCase[]> {
  const allTestCases: TestCase[] = [];

  try {
    // Try to fetch from cloud API if available
    if (cloudConfig.isEnabled()) {
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
          // Cloud API returns raw results with response field for transformation
          const cloudResults = data.results || [];
          const cloudTestCases = cloudResults
            .map((r: { testCase: TestCase; response: ProviderResponse | null; evalId: string }) =>
              transformResult(r.testCase, r.response, r.evalId),
            )
            .filter((tc: TestCase | null): tc is TestCase => tc !== null);
          allTestCases.push(...cloudTestCases);
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
          const response = typeof r.response === 'string' ? JSON.parse(r.response) : r.response;

          return transformResult(testCase, response, r.evalId);
        } catch (e) {
          logger.debug(`Failed to parse test case: ${e}`);
          return null;
        }
      })
      .filter((tc): tc is NonNullable<typeof tc> => tc !== null);

    allTestCases.push(...localTestCases);

    // Deduplicate combined results from both cloud and local
    return deduplicateTestCases(allTestCases);
  } catch (error) {
    logger.error(`Error retrieving failed test cases: ${error}`);
    return [];
  }
}

export async function addRetryTestCases(
  testCases: TestCaseWithPlugin[],
  _injectVar: string, // Unused - provider config (including injectVar) comes from stored test cases
  config: Record<string, unknown>,
): Promise<TestCase[]> {
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

  // For each plugin, get its failed test cases
  const retryTestCases: TestCase[] = [];
  for (const targetId of targetIds) {
    for (const [pluginId, tests] of testsByPlugin.entries()) {
      // Use configured numTests if available, otherwise use original test count
      const maxTests = typeof config.numTests === 'number' ? config.numTests : tests.length;

      // Fetch only the number of tests we need for efficiency
      const failedTests = await getFailedTestCases(pluginId, targetId, maxTests);

      // Use the stored provider from the database if it exists and has injectVar
      // Only add injectVar if it's missing from an agentic strategy test
      const testsWithProvider = failedTests.map((test) => {
        const existingProvider = test.provider as
          | { id?: string; config?: Record<string, unknown> }
          | undefined;

        // If test already has a complete provider with injectVar, use it directly
        if (existingProvider?.config?.injectVar) {
          return test;
        }

        // Strip the provider - these run directly against the target
        const { provider: _provider, ...testWithoutProvider } = test;
        return testWithoutProvider;
      });

      retryTestCases.push(...testsWithProvider);
    }
  }

  const deduped = deduplicateTestCases(retryTestCases);

  // Mark all retry tests with retry: true flag, preserve original strategyId (even if undefined)
  const marked = deduped.map((test) => ({
    ...test,
    metadata: {
      ...test.metadata,
      retry: true,
    },
  }));

  logger.debug(`[RETRY STRATEGY] Returning ${marked.length} retry test cases`);

  return marked;
}
