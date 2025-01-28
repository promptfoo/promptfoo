import { getDb } from '../../database';
import { evalResultsTable } from '../../database/tables';
import { eq, and, desc } from 'drizzle-orm';
import type { TestCase } from '../../types';
import EvalResult from '../../models/evalResult';
import type { RedTeamPlugin } from '../types';

interface RetryPreviousConfig {
  /**
   * Number of tests to retry (default: 5)
   */
  numTests?: number;
  
  /**
   * Only retry tests that failed with specific failure reasons
   */
  failureReasons?: string[];
}

export const retryPreviousPlugin: RedTeamPlugin = {
  key: 'regression',
  description: 'Tests if previously successful red team probes can still bypass safety measures',
  category: 'misinformation and misuse',
  severity: 'high',
  validate: (config: RetryPreviousConfig = {}) => {
    if (config.numTests !== undefined && typeof config.numTests !== 'number') {
      throw new Error('numTests must be a number');
    }
    if (config.failureReasons !== undefined && !Array.isArray(config.failureReasons)) {
      throw new Error('failureReasons must be an array');
    }
  },
  action: async ({ provider, n = 5, config = {} }) => {
    const db = getDb();
    const numTests = config.numTests || n;

    // Query for previously successful red team probes
    const failedResults = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.success, false),
          // Add more conditions if needed
        ),
      )
      .orderBy(desc(evalResultsTable.id)) // Most recent first
      .limit(numTests);

    // Convert results to test cases
    return failedResults.map((result) => {
      const evalResult = new EvalResult(result);
      const testCase = evalResult.testCase;

      return {
        ...testCase,
        metadata: {
          ...(testCase.metadata || {}),
          isRetry: true,
          originalEvalId: evalResult.evalId,
          originalTestId: evalResult.id,
          failureReason: evalResult.failureReason,
          pluginId: 'regression',
        },
      };
    });
  },
}; 