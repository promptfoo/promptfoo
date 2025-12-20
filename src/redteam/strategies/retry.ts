import dedent from 'dedent';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database/index';
import { evalResultsTable } from '../../database/tables';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { makeRequest } from '../../util/cloud';
import invariant from '../../util/invariant';
import { AGENTIC_STRATEGIES, MULTI_TURN_STRATEGIES } from '../constants/strategies';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

// Single-turn strategies = AGENTIC but NOT MULTI_TURN
// These strategies iterate to find successful attacks but each attempt is a single turn
const SINGLE_TURN_STRATEGIES = AGENTIC_STRATEGIES.filter(
  (s) => !MULTI_TURN_STRATEGIES.includes(s as any),
);

function isSingleTurnStrategy(strategyId: string | undefined): boolean {
  return strategyId ? SINGLE_TURN_STRATEGIES.includes(strategyId as any) : false;
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
    `Searching for failed test cases: plugin='${pluginId}', targetId='${targetId}', limit=${limit}, cloudMode=${cloudConfig.isEnabled()}`,
  );

  const allTestCases: TestCase[] = [];

  try {
    // Try to fetch from cloud API if available
    if (cloudConfig.isEnabled()) {
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
          const cloudTestCases = data.testCases || [];
          allTestCases.push(...cloudTestCases);

          logger.debug(
            `Retrieved ${cloudTestCases.length} failed test cases from cloud for plugin '${pluginId}' and target '${targetId}'`,
          );

          // Log details of cloud test cases
          cloudTestCases.forEach((tc: TestCase, idx: number) => {
            logger.debug(dedent`
              [CLOUD] Test ${idx + 1}/${cloudTestCases.length}:
                pluginId: ${tc.metadata?.pluginId}
                strategyId: ${tc.metadata?.strategyId || '(none)'}
                provider: ${JSON.stringify(tc.provider, null, 2)}
                provider.config.injectVar: ${(tc.provider as any)?.config?.injectVar}
            `);
          });
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
          const response = typeof r.response === 'string' ? JSON.parse(r.response) : r.response;

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
              logger.debug(dedent`
                [SINGLE-TURN] Replaced prompt with redteamFinalPrompt for ${strategyId}
                  Original: ${String(testCase.vars[injectVar]).substring(0, 100)}...
                  Final: ${redteamFinalPrompt.substring(0, 100)}...
              `);
            } else {
              logger.warn(
                `[RETRY] Single-turn strategy '${strategyId}' has no redteamFinalPrompt in response, using original prompt`,
              );
            }
          }

          // Keep the provider - we'll use it directly if it has injectVar
          const result = {
            ...testCase,
            vars: finalVars,
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

          logger.debug(dedent`
            Retrieved test case - pluginId: ${result.metadata?.pluginId}, strategyId: ${result.metadata?.strategyId}
              Prompt: ${JSON.stringify(result.vars?.prompt || result.vars)?.substring(0, 200)}...
              [DB] Provider stored in database: ${JSON.stringify(testCase.provider, null, 2)}
              [DB] Provider.config.injectVar: ${(testCase.provider as any)?.config?.injectVar}
              [DB] Provider.config.maxTurns: ${(testCase.provider as any)?.config?.maxTurns}
          `);

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
  _injectVar: string, // Unused - provider config (including injectVar) comes from stored test cases
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug(dedent`
    ========================================
    [RETRY STRATEGY] Starting addRetryTestCases
    ========================================
    [INPUT] config: ${JSON.stringify(config, null, 2)}
    [INPUT] Number of input testCases: ${testCases.length}
    Adding retry test cases from previous failures
  `);

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

      // Use the stored provider from the database if it exists and has injectVar
      // Only add injectVar if it's missing from an agentic strategy test
      const testsWithProvider = failedTests.map((test, index) => {
        const strategyId = test.metadata?.strategyId;
        const promptPreview = JSON.stringify(test.vars?.prompt || test.vars)?.substring(0, 100);
        const existingProvider = test.provider as
          | { id?: string; config?: Record<string, unknown> }
          | undefined;

        logger.debug(dedent`
          ----------------------------------------
          [PROCESSING] Test ${index + 1}/${failedTests.length} for plugin '${pluginId}'
            strategyId: ${strategyId || '(none - plugin only)'}
            prompt: ${promptPreview}...
            [STORED] test.provider: ${JSON.stringify(test.provider, null, 2)}
        `);

        // If test already has a complete provider with injectVar, use it directly
        if (existingProvider && existingProvider.config?.injectVar) {
          logger.debug(dedent`
            [ACTION] Using stored provider as-is (already has injectVar: '${existingProvider.config.injectVar}')
            [RESULT] provider: ${JSON.stringify(test.provider, null, 2)}
          `);
          return test;
        }

        // Warn if we have a provider or strategyId but can't use them properly
        // This is unexpected - either the provider should have injectVar, or there should be no provider
        if (existingProvider || strategyId) {
          logger.warn(
            `[RETRY] Test has strategyId '${strategyId || '(none)'}' but no complete provider with injectVar. ` +
              `This test will run against the target directly, which may not be the intended behavior. ` +
              `Provider stored: ${JSON.stringify(existingProvider)}`,
          );
        }

        // Strip the provider - these run directly against the target
        logger.debug(dedent`
          [ACTION] Stripping provider (no complete provider with injectVar found)
          [RESULT] provider: undefined (stripped)
        `);
        const { provider: _provider, ...testWithoutProvider } = test;
        return testWithoutProvider;
      });

      retryTestCases.push(...testsWithProvider);
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

  logger.debug(`[RETRY STRATEGY] Returning ${marked.length} retry test cases`);

  return marked;
}
