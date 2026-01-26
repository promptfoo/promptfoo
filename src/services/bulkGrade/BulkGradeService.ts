import { eq, sql } from 'drizzle-orm';
import { HUMAN_ASSERTION_TYPE } from '../../constants';
import { getDb } from '../../database/index';
import { evalResultsTable, evalsTable } from '../../database/tables';
import logger from '../../logger';
import Eval from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { getCurrentTimestamp } from '../../util/time';
import { evalLockManager } from './lock';
import {
  BULK_RATING_CONSTANTS,
  type BulkRatingRequest,
  type BulkRatingResponse,
  type MetricDeltas,
  type PromptMetricDeltas,
} from './types';

import type { EvalResultsFilterMode, GradingResult } from '../../types/index';

/**
 * Service for bulk grading/rating operations on eval results.
 */
export class BulkGradeService {
  /**
   * Performs bulk manual rating on results matching the given filter.
   * This applies a pass/fail override to all matching results.
   *
   * @param evalId - The eval ID to operate on
   * @param request - The bulk rating request
   * @returns Response with success status and counts
   */
  async bulkManualRating(evalId: string, request: BulkRatingRequest): Promise<BulkRatingResponse> {
    // Validate reason length
    if (request.reason && request.reason.length > BULK_RATING_CONSTANTS.MAX_REASON_LENGTH) {
      return {
        success: false,
        matched: 0,
        updated: 0,
        skipped: 0,
        error: `Reason exceeds maximum length of ${BULK_RATING_CONSTANTS.MAX_REASON_LENGTH} characters`,
      };
    }

    // Acquire lock for this eval
    if (!evalLockManager.acquire(evalId, 'bulk-manual-rating')) {
      return {
        success: false,
        matched: 0,
        updated: 0,
        skipped: 0,
        error: 'Another bulk operation is in progress for this eval',
      };
    }

    try {
      // Load the eval
      const eval_ = await Eval.findById(evalId);
      if (!eval_) {
        return {
          success: false,
          matched: 0,
          updated: 0,
          skipped: 0,
          error: 'Eval not found',
        };
      }

      // Get all matching test indices
      const { testIndices, filteredCount } = await eval_.getAllFilteredTestIndices({
        filterMode: request.filterMode,
        filters: request.filters,
        searchQuery: request.searchQuery,
      });

      // Check confirmation threshold
      if (filteredCount >= BULK_RATING_CONSTANTS.CONFIRMATION_THRESHOLD && !request.confirmBulk) {
        return {
          success: false,
          matched: filteredCount,
          updated: 0,
          skipped: 0,
          error: `Bulk operation affects ${filteredCount} results. Set confirmBulk: true to proceed.`,
        };
      }

      if (testIndices.length === 0) {
        return {
          success: true,
          matched: 0,
          updated: 0,
          skipped: 0,
        };
      }

      // Fetch all results in batches
      const allResults = await EvalResult.findManyByEvalIdAndTestIndices(evalId, testIndices);

      if (allResults.length === 0) {
        return {
          success: true,
          matched: 0,
          updated: 0,
          skipped: 0,
        };
      }

      // Track metric deltas per prompt
      const promptDeltas: PromptMetricDeltas = new Map();

      // Process results and build updates
      const resultsToUpdate: EvalResult[] = [];
      let skipped = 0;

      for (const result of allResults) {
        // Check if result already has the same pass/fail state
        if (result.success === request.pass) {
          // Check if already has the same manual rating
          const existingHumanAssertion = result.gradingResult?.componentResults?.find(
            (r) => r.assertion?.type === HUMAN_ASSERTION_TYPE,
          );
          if (existingHumanAssertion && existingHumanAssertion.reason === request.reason) {
            skipped++;
            continue;
          }
        }

        // Calculate metric changes
        const deltas = this.calculateMetricDeltas(
          result.success,
          result.score,
          request.pass,
          request.pass ? 1 : 0,
          this.hasExistingManualOverride(result.gradingResult),
        );

        // Accumulate deltas per prompt
        const promptIdx = result.promptIdx;
        const existing = promptDeltas.get(promptIdx) || this.createEmptyDeltas();
        promptDeltas.set(promptIdx, this.mergeDeltas(existing, deltas));

        // Build the new grading result
        const newGradingResult = this.buildGradingResult(
          result.gradingResult,
          request.pass,
          request.reason,
        );

        // Update result fields
        result.gradingResult = newGradingResult;
        result.success = request.pass;
        result.score = request.pass ? 1 : 0;

        resultsToUpdate.push(result);
      }

      if (resultsToUpdate.length === 0) {
        return {
          success: true,
          matched: allResults.length,
          updated: 0,
          skipped: allResults.length,
        };
      }

      // Apply updates in a transaction using synchronous operations
      // IMPORTANT: Both result updates AND eval metrics update must be in the same transaction
      // to ensure atomicity. If either fails, both are rolled back.
      const db = getDb();
      const currentTimestamp = getCurrentTimestamp();

      db.transaction(() => {
        // Batch update results using chunked processing to avoid SQLite limits
        // SQLite has a ~1MB statement size limit, so we process in batches
        const BATCH_SIZE = BULK_RATING_CONSTANTS.BATCH_SIZE;

        for (let i = 0; i < resultsToUpdate.length; i += BATCH_SIZE) {
          const batch = resultsToUpdate.slice(i, i + BATCH_SIZE);
          const batchIds = batch.map((r) => r.id);

          // Use a single UPDATE with CASE statements for the batch
          // This is more efficient than individual updates
          if (batch.length === 1) {
            // Single result - use simple update
            const result = batch[0];
            db.update(evalResultsTable)
              .set({
                gradingResult: result.gradingResult,
                success: result.success,
                score: result.score,
                updatedAt: currentTimestamp,
              })
              .where(eq(evalResultsTable.id, result.id))
              .run();
          } else {
            // Multiple results - build CASE statements for batch update
            // Build CASE expressions for each field
            const gradingResultCases = batch
              .map(
                (r) =>
                  `WHEN id = '${r.id}' THEN '${JSON.stringify(r.gradingResult).replace(/'/g, "''")}'`,
              )
              .join(' ');
            const successCases = batch
              .map((r) => `WHEN id = '${r.id}' THEN ${r.success ? 1 : 0}`)
              .join(' ');
            const scoreCases = batch.map((r) => `WHEN id = '${r.id}' THEN ${r.score}`).join(' ');

            db.run(sql`
              UPDATE ${evalResultsTable}
              SET
                grading_result = CASE ${sql.raw(gradingResultCases)} END,
                success = CASE ${sql.raw(successCases)} END,
                score = CASE ${sql.raw(scoreCases)} END,
                updated_at = ${currentTimestamp}
              WHERE id IN (${sql.join(
                batchIds.map((id) => sql`${id}`),
                sql`, `,
              )})
            `);
          }
        }

        // Apply metric deltas to prompts (with Math.max to prevent negative counts)
        for (const [promptIdx, deltas] of promptDeltas) {
          const prompt = eval_.prompts[promptIdx];
          if (prompt?.metrics) {
            prompt.metrics.testPassCount = Math.max(
              0,
              prompt.metrics.testPassCount + deltas.testPassDelta,
            );
            prompt.metrics.testFailCount = Math.max(
              0,
              prompt.metrics.testFailCount + deltas.testFailDelta,
            );
            prompt.metrics.assertPassCount = Math.max(
              0,
              prompt.metrics.assertPassCount + deltas.assertPassDelta,
            );
            prompt.metrics.assertFailCount = Math.max(
              0,
              prompt.metrics.assertFailCount + deltas.assertFailDelta,
            );
            prompt.metrics.score += deltas.scoreDelta;
          }
        }

        // Save eval prompts (metrics) within the same transaction for atomicity
        // This uses synchronous .run() to stay within the transaction
        // Note: evalsTable doesn't have an updatedAt column, so we only update prompts
        db.update(evalsTable)
          .set({
            prompts: eval_.prompts,
          })
          .where(eq(evalsTable.id, eval_.id))
          .run();
      });

      logger.info(`Bulk rating completed for eval ${evalId}`, {
        matched: allResults.length,
        updated: resultsToUpdate.length,
        skipped,
        pass: request.pass,
      });

      return {
        success: true,
        matched: allResults.length,
        updated: resultsToUpdate.length,
        skipped,
      };
    } catch (error) {
      logger.error(`Bulk rating failed for eval ${evalId}`, { error });
      return {
        success: false,
        matched: 0,
        updated: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // Always release the lock
      evalLockManager.release(evalId);
    }
  }

  /**
   * Gets the count of results matching the given filter (for preview).
   */
  async getFilteredResultsCount(
    evalId: string,
    filterMode: EvalResultsFilterMode,
    filters?: string[],
    searchQuery?: string,
  ): Promise<number> {
    const eval_ = await Eval.findById(evalId);
    if (!eval_) {
      return 0;
    }

    const { filteredCount } = await eval_.getAllFilteredTestIndices({
      filterMode,
      filters,
      searchQuery,
    });

    return filteredCount;
  }

  /**
   * Calculates metric deltas for a single result transition.
   */
  private calculateMetricDeltas(
    currentSuccess: boolean,
    currentScore: number,
    newSuccess: boolean,
    newScore: number,
    hasExistingManualOverride: boolean,
  ): MetricDeltas {
    const successChanged = currentSuccess !== newSuccess;
    const scoreChange = newScore - currentScore;

    const deltas: MetricDeltas = {
      testPassDelta: 0,
      testFailDelta: 0,
      assertPassDelta: 0,
      assertFailDelta: 0,
      scoreDelta: scoreChange,
    };

    if (successChanged) {
      if (newSuccess) {
        // Changed from fail to pass
        deltas.testPassDelta = 1;
        deltas.testFailDelta = -1;
        deltas.assertPassDelta = 1;
        if (hasExistingManualOverride) {
          deltas.assertFailDelta = -1;
        }
      } else {
        // Changed from pass to fail
        deltas.testPassDelta = -1;
        deltas.testFailDelta = 1;
        deltas.assertFailDelta = 1;
        if (hasExistingManualOverride) {
          deltas.assertPassDelta = -1;
        }
      }
    } else if (!hasExistingManualOverride) {
      // No change in success, but adding a new assertion
      if (newSuccess) {
        deltas.assertPassDelta = 1;
      } else {
        deltas.assertFailDelta = 1;
      }
    }

    return deltas;
  }

  /**
   * Checks if a grading result has an existing human (manual) override.
   */
  private hasExistingManualOverride(gradingResult: GradingResult | null): boolean {
    return Boolean(
      gradingResult?.componentResults?.some((r) => r.assertion?.type === HUMAN_ASSERTION_TYPE),
    );
  }

  /**
   * Builds a new grading result with the manual rating applied.
   */
  private buildGradingResult(
    existingResult: GradingResult | null,
    pass: boolean,
    reason: string,
  ): GradingResult {
    const humanAssertion = {
      pass,
      score: pass ? 1 : 0,
      reason,
      assertion: {
        type: HUMAN_ASSERTION_TYPE,
      },
    };

    // If there's an existing result, preserve component results but update/add human assertion
    if (existingResult) {
      const existingComponents = existingResult.componentResults || [];
      // Remove any existing human assertions
      const filteredComponents = existingComponents.filter(
        (r) => r.assertion?.type !== HUMAN_ASSERTION_TYPE,
      );

      return {
        ...existingResult,
        pass,
        score: pass ? 1 : 0,
        reason,
        componentResults: [...filteredComponents, humanAssertion],
      };
    }

    // Create a new grading result
    return {
      pass,
      score: pass ? 1 : 0,
      reason,
      componentResults: [humanAssertion],
    };
  }

  /**
   * Creates an empty metric deltas object.
   */
  private createEmptyDeltas(): MetricDeltas {
    return {
      testPassDelta: 0,
      testFailDelta: 0,
      assertPassDelta: 0,
      assertFailDelta: 0,
      scoreDelta: 0,
    };
  }

  /**
   * Merges two metric deltas objects.
   */
  private mergeDeltas(a: MetricDeltas, b: MetricDeltas): MetricDeltas {
    return {
      testPassDelta: a.testPassDelta + b.testPassDelta,
      testFailDelta: a.testFailDelta + b.testFailDelta,
      assertPassDelta: a.assertPassDelta + b.assertPassDelta,
      assertFailDelta: a.assertFailDelta + b.assertFailDelta,
      scoreDelta: a.scoreDelta + b.scoreDelta,
    };
  }
}

/**
 * Singleton instance of the bulk grade service.
 */
export const bulkGradeService = new BulkGradeService();
