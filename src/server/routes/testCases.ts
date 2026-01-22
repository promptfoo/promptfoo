import { Router } from 'express';
import logger from '../../logger';
import TestCaseModel from '../../models/testCase';
import type { Request, Response } from 'express';

export const testCasesRouter = Router();

/**
 * GET /api/test-cases
 * List test cases with optional pagination
 */
testCasesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const includeStats = req.query.includeStats === 'true';

    logger.debug(
      `[TestCasesRoute] Listing test cases (limit=${limit}, offset=${offset}, includeStats=${includeStats})`,
    );

    // Use optimized single-query method when stats are requested
    if (includeStats) {
      const results = await TestCaseModel.listWithStats({ limit, offset });
      const testCasesWithStats = results.map(({ testCase, stats }) => ({
        ...testCase.toJSON(),
        stats,
      }));
      res.json({ testCases: testCasesWithStats });
      return;
    }

    // Without stats, use the simple list method
    const testCases = await TestCaseModel.list({ limit, offset });
    res.json({ testCases: testCases.map((tc) => tc.toJSON()) });
  } catch (error) {
    logger.error(`[TestCasesRoute] Error listing test cases: ${error}`);
    res.status(500).json({ error: 'Failed to list test cases' });
  }
});

/**
 * GET /api/test-cases/:id
 * Get a specific test case by ID
 */
testCasesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    logger.debug(`[TestCasesRoute] Fetching test case ${id}`);

    const testCase = await TestCaseModel.findById(id);

    if (!testCase) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }

    // Include stats by default for individual test case
    const stats = await testCase.getStats();

    res.json({
      testCase: {
        ...testCase.toJSON(),
        stats,
      },
    });
  } catch (error) {
    logger.error(`[TestCasesRoute] Error fetching test case: ${error}`);
    res.status(500).json({ error: 'Failed to fetch test case' });
  }
});

/**
 * GET /api/test-cases/:id/history
 * Get the history of results for a test case across all evaluations
 */
testCasesRouter.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    logger.debug(`[TestCasesRoute] Fetching history for test case ${id}`);

    const testCase = await TestCaseModel.findById(id);

    if (!testCase) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }

    const history = await testCase.getHistory({ limit, offset });

    res.json({ history });
  } catch (error) {
    logger.error(`[TestCasesRoute] Error fetching test case history: ${error}`);
    res.status(500).json({ error: 'Failed to fetch test case history' });
  }
});

/**
 * GET /api/test-cases/:id/stats
 * Get aggregate statistics for a test case.
 * Uses static method that queries eval_results directly, so it works
 * even if the test case doesn't exist in the test_cases table.
 */
testCasesRouter.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    logger.debug(`[TestCasesRoute] Fetching stats for test case ${id}`);

    // Use static method that queries eval_results directly
    const stats = await TestCaseModel.getStatsById(id);

    if (!stats) {
      res.status(404).json({ error: 'No results found for this test case' });
      return;
    }

    res.json({ stats });
  } catch (error) {
    logger.error(`[TestCasesRoute] Error fetching test case stats: ${error}`);
    res.status(500).json({ error: 'Failed to fetch test case stats' });
  }
});

/**
 * POST /api/test-cases/backfill
 * Trigger backfill of test case IDs for existing eval results
 * This is an admin operation and should be called with care
 */
testCasesRouter.post('/backfill', async (req: Request, res: Response) => {
  try {
    const batchSize = Math.min(
      Math.max(parseInt(req.query.batchSize as string) || 1000, 100),
      5000,
    );

    logger.info(`[TestCasesRoute] Starting test case backfill (batchSize=${batchSize})`);

    const updatedCount = await TestCaseModel.backfillFromEvalResults({ batchSize });

    logger.info(`[TestCasesRoute] Backfill complete: ${updatedCount} results updated`);

    res.json({
      success: true,
      updatedCount,
    });
  } catch (error) {
    logger.error(`[TestCasesRoute] Error during backfill: ${error}`);
    res.status(500).json({ error: 'Failed to backfill test cases' });
  }
});
