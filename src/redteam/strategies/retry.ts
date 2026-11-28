import { isDeepStrictEqual } from 'node:util';

import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../database/index';
import { evalResultsTable } from '../../database/tables';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { makeRequest } from '../../util/cloud';
import invariant from '../../util/invariant';
import {
  AGENTIC_STRATEGIES_SET,
  ALL_STRATEGIES,
  isMultiTurnStrategy,
  MULTI_MODAL_STRATEGIES_SET,
} from '../constants/strategies';

import type { ProviderResponse, TestCase, TestCaseWithPlugin } from '../../types/index';

function isSingleTurnStrategy(id: string | undefined): boolean {
  return !!id && AGENTIC_STRATEGIES_SET.has(id) && !isMultiTurnStrategy(id);
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

// Cloud history supplies input, never the provider, grading rules or other executable settings.
function cloudTemplate(tests: TestCaseWithPlugin[], injectVar: string) {
  let template: TestCaseWithPlugin | undefined;
  const goals = new Set<string>();
  for (const { description: _description, ...test } of tests) {
    const { [injectVar]: input, ...vars } = test.vars ?? {};
    const { goal, ...metadata } = test.metadata;
    if (goal !== undefined) {
      goals.add(goal);
    }
    if (
      typeof input !== 'string' ||
      metadata.pluginConfig?.inputs ||
      metadata.inputVars ||
      metadata.inputMaterialization ||
      test.providerOutput !== undefined
    ) {
      return;
    }
    const candidate = { ...test, vars, metadata };
    if (template && !isDeepStrictEqual(template, candidate)) {
      return;
    }
    template = candidate;
  }
  return template && { template, goals };
}

interface CloudResult {
  testCase: TestCase;
  response?: ProviderResponse;
  evalId: string;
  targetId?: string;
  provider?: string | { id: string };
  success?: boolean;
}

// Compare plugin-specific markers and companion inputs without importing any of them from Cloud.
function matchingGradingInputs(previous: TestCase, current: TestCase) {
  const assertions = (test: TestCase) =>
    test.assert?.map((a) => ({ ...a, metric: undefined })) ?? [];
  const metadata = (test: TestCase) => {
    const result = { ...test.metadata };
    for (const key of [
      'goal',
      'strategyId',
      'strategyConfig',
      'originalText',
      'originalEvalId',
      'retry',
      'testCaseId',
      '__promptfoo',
    ]) {
      delete result[key];
    }
    // The suite supplies these defaults after generation.
    for (const key of ['purpose', 'entities']) {
      if (current.metadata?.[key] === undefined) {
        delete result[key];
      }
    }
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
  };
  return (
    Array.isArray(previous.assert ?? []) &&
    isDeepStrictEqual(assertions(previous), assertions(current)) &&
    isDeepStrictEqual(metadata(previous), metadata(current)) &&
    Object.entries(current.vars ?? {}).every(([key, value]) =>
      isDeepStrictEqual(previous.vars?.[key], value),
    )
  );
}

// Structured inputs can materialize other variables. References and templates can read local files.
function isPlainText(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    !!input.trim() &&
    !/^\s*(?:\[|\{|data:)|file:\/\/|package:|\{[{%#]/i.test(input)
  );
}

function cloudRetry(
  row: CloudResult,
  { template, goals }: NonNullable<ReturnType<typeof cloudTemplate>>,
  targetId: string,
  injectVar: string,
): TestCase | undefined {
  const test = row?.testCase;
  const strategyId = test?.metadata?.strategyId;
  const providerId = typeof row?.provider === 'string' ? row.provider : row?.provider?.id;
  if (
    test?.metadata?.pluginId !== template.metadata.pluginId ||
    row.success ||
    (row.targetId !== undefined && row.targetId !== targetId) ||
    (row.provider !== undefined && providerId !== targetId) ||
    typeof row.evalId !== 'string' ||
    row.evalId.length > 200 ||
    !/^[\w-]+(?::\d\d:\d\d)?$/.test(row.evalId) ||
    !matchingGradingInputs(test, template) ||
    (strategyId !== undefined &&
      (!ALL_STRATEGIES.includes(strategyId) ||
        isMultiTurnStrategy(strategyId) ||
        strategyId === 'layer' ||
        strategyId === 'authoritative-markup-injection' ||
        MULTI_MODAL_STRATEGIES_SET.has(strategyId)))
  ) {
    return;
  }

  const input =
    isSingleTurnStrategy(strategyId) || strategyId === 'best-of-n'
      ? row.response?.metadata?.redteamFinalPrompt
      : test.vars?.[injectVar];
  const needsGoal =
    goals.size > 0 || /^(?:promptfoo:redteam:)?intent$/.test(template.metadata.pluginId);
  const goal = needsGoal ? test.metadata?.goal : undefined;
  if (!isPlainText(input) || (needsGoal && (!isPlainText(goal) || !goals.has(goal)))) {
    return;
  }
  return {
    ...template,
    vars: { ...template.vars, [injectVar]: input },
    metadata: {
      ...template.metadata,
      ...(goal && { goal }),
      strategyId,
      originalEvalId: row.evalId,
    },
  };
}

async function getFailedTestCases(
  tests: TestCaseWithPlugin[],
  injectVar: string,
  targetId: string,
  limit: number,
): Promise<TestCase[]> {
  const pluginId = tests[0].metadata.pluginId;
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
          const { results = [] } = await response.json();
          const template = cloudTemplate(tests, injectVar);
          for (const row of results.slice(0, limit)) {
            const retry = template && cloudRetry(row, template, targetId, injectVar);
            if (retry) {
              allTestCases.push(retry);
            }
          }
          if (allTestCases.length < Math.min(limit, results.length)) {
            logger.warn(
              'Skipped incompatible Cloud retry cases. A matching local test and plain-text input are required.',
            );
          }
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
    const db = await getDb();

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
  } catch (error) {
    logger.error(`Error retrieving failed test cases: ${error}`);
  }
  return allTestCases;
}

export async function addRetryTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  const testsByPlugin = new Map<string, TestCaseWithPlugin[]>();
  for (const test of testCases) {
    const pluginId = test.metadata?.pluginId;
    if (!pluginId) {
      continue;
    }

    const group = testsByPlugin.get(pluginId) ?? [];
    group.push(test);
    testsByPlugin.set(pluginId, group);
  }

  const targetIds: string[] = (config?.targetIds ?? []) as string[];

  invariant(
    targetIds.length > 0 && targetIds.every((id) => typeof id === 'string'),
    'No target IDs found in config. The retry strategy requires at least one target ID to be specified.',
  );

  // For each plugin, get its failed test cases
  const retryTestCases: TestCase[] = [];
  for (const targetId of targetIds) {
    for (const tests of testsByPlugin.values()) {
      // Use configured numTests if available, otherwise use original test count
      const maxTests = typeof config.numTests === 'number' ? config.numTests : tests.length;

      // Fetch only the number of tests we need for efficiency
      const failedTests = await getFailedTestCases(tests, injectVar, targetId, maxTests);

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
