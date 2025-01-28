import { getDb } from '../../database';
import { evalResultsTable } from '../../database/tables';
import { eq, and, desc } from 'drizzle-orm';
import type { TestCase } from '../../types';
import EvalResult from '../../models/evalResult';

interface RetryPreviousConfig {
  /**
   * Number of tests to retry per plugin ID
   */
  testsPerPlugin?: number;
  
  /**
   * Only retry tests that failed with specific failure reasons
   */
  failureReasons?: string[];
  
  /**
   * Plugin configurations to apply to retried tests
   */
  plugins?: {
    id: string;
    numTests?: number;
    config?: Record<string, any>;
  }[];
}

export async function retryPreviousTests(
  testCases: TestCase[],
  injectVar: string,
  config: RetryPreviousConfig = {},
): Promise<TestCase[]> {
  const db = getDb();
  const defaultTestsPerPlugin = config.testsPerPlugin || 5;

  // Get all unique plugin IDs from the test cases
  const pluginIds = new Set(testCases.map(t => t.metadata?.pluginId).filter(Boolean));

  // Query for failed test cases for each plugin ID
  const retryTestCases: TestCase[] = [];
  
  for (const pluginId of pluginIds) {
    // Get plugin-specific config if it exists
    const pluginConfig = config.plugins?.find(p => p.id === pluginId);
    const testsToRetry = pluginConfig?.numTests || defaultTestsPerPlugin;

    const failedResults = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.success, false),
          // Filter by plugin ID if specified in metadata
          eq(evalResultsTable.metadata.pluginId, pluginId),
        ),
      )
      .orderBy(desc(evalResultsTable.id)) // Most recent first
      .limit(testsToRetry);

    // Convert failed results to test cases
    const pluginRetryTests = failedResults.map((result) => {
      const evalResult = new EvalResult(result);
      const testCase = evalResult.testCase;

      // Add metadata to track this is a retry
      return {
        ...testCase,
        metadata: {
          ...(testCase.metadata || {}),
          isRetry: true,
          originalEvalId: evalResult.evalId,
          originalTestId: evalResult.id,
          failureReason: evalResult.failureReason,
        },
        // Apply plugin-specific config if provided
        ...(pluginConfig?.config && { config: { ...testCase.config, ...pluginConfig.config } }),
      };
    });

    retryTestCases.push(...pluginRetryTests);
  }

  // Return both original test cases and retry test cases
  return [...testCases, ...retryTestCases];
} 
