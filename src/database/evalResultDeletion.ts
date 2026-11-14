import { and, eq, gt, sql } from 'drizzle-orm';
import { notifyEvaluationChanged } from '../models/evalMutation';
import { createDefaultPromptMetrics, updatePromptResultCounts } from '../util/eval/promptMetrics';
import { accumulateNamedMetric } from '../util/namedMetrics';
import { accumulateGradingTokenUsage, accumulateResponseTokenUsage } from '../util/tokenUsageUtils';
import {
  EvalResultDeletionConflict,
  RESULT_WRITER,
  resultDeletionRevision,
} from './evalResultWrite';
import { getDb } from './index';
import { evalResultsTable, evalsTable } from './tables';

export class EvalResultNotFoundError extends Error {}

type PromptMetrics = ReturnType<typeof createDefaultPromptMetrics>;
type ResultRow = typeof evalResultsTable.$inferSelect;

function accumulate(metrics: PromptMetrics, row: ResultRow) {
  updatePromptResultCounts(metrics, {
    success: row.success,
    failureReason: row.failureReason as Parameters<
      typeof updatePromptResultCounts
    >[1]['failureReason'],
    response: row.response ?? undefined,
  });
  metrics.score += row.score;
  metrics.totalLatencyMs += row.latencyMs ?? 0;
  const incurredCost = row.response?.incurredCost ?? (row.response?.cached ? 0 : undefined);
  if (incurredCost !== undefined || metrics.incurredCost !== undefined) {
    metrics.incurredCost = (metrics.incurredCost ?? metrics.cost) + (incurredCost ?? row.cost ?? 0);
  }
  metrics.cost += row.cost ?? 0;

  for (const component of row.gradingResult?.componentResults ?? []) {
    if (component.pass) {
      metrics.assertPassCount++;
    } else {
      metrics.assertFailCount++;
    }
  }
  const namedScores = Object.entries(row.namedScores ?? {});
  if (namedScores.some(([name]) => Object.hasOwn(Object.prototype, name))) {
    throw new EvalResultDeletionConflict('The saved result has an unsupported metric name.');
  }
  if (
    namedScores.length &&
    row.gradingResult?.componentResults?.some(({ assertion }) =>
      /\{[{%#]/.test(assertion?.metric ?? ''),
    )
  ) {
    throw new EvalResultDeletionConflict(
      'The saved metric counts require rendering assertion templates.',
    );
  }
  for (const [metricName, metricValue] of namedScores) {
    accumulateNamedMetric(metrics, { metricName, metricValue, gradingResult: row.gradingResult });
  }
  if (row.response) {
    accumulateResponseTokenUsage(metrics.tokenUsage, row.response);
  }
  if (row.gradingResult?.tokensUsed) {
    accumulateGradingTokenUsage(metrics.tokenUsage, row.gradingResult.tokensUsed, {
      cached: row.gradingResult.metadata?.cachedResponse,
    });
  }
}

export async function deleteEvalResult(evalId: string, resultId: string): Promise<void> {
  const db = await getDb();
  const belongsToEval = and(eq(evalResultsTable.evalId, evalId), eq(evalResultsTable.id, resultId));
  await db.transaction(async (tx) => {
    const result = await tx.select().from(evalResultsTable).where(belongsToEval).get();
    if (!result) {
      throw new EvalResultNotFoundError('Eval result not found');
    }
    const row = await tx.select().from(evalsTable).where(eq(evalsTable.id, evalId)).get();
    const prompt = row?.prompts?.[result.promptIdx];
    if (!row || !prompt?.metrics || Object.hasOwn(row.results ?? {}, RESULT_WRITER)) {
      throw new EvalResultDeletionConflict(
        'Wait for the evaluation to finish or resume interrupted work before deleting results.',
      );
    }
    if (row.config.derivedMetrics?.length) {
      throw new EvalResultDeletionConflict('Individual deletion cannot rebuild derived metrics.');
    }

    const original = prompt.metrics;
    if (Object.values(original.redteam ?? {}).some((bucket) => Object.keys(bucket).length)) {
      throw new EvalResultDeletionConflict(
        'Individual deletion cannot rebuild saved red-team metrics.',
      );
    }
    const remaining = createDefaultPromptMetrics();
    let after: string | undefined;
    // The CLI and API take the exact saved row ID. Keep all other IDs and indices as written.
    while (true) {
      const batch = await tx
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            eq(evalResultsTable.promptIdx, result.promptIdx),
            after ? gt(evalResultsTable.id, after) : undefined,
          ),
        )
        .orderBy(evalResultsTable.id)
        .limit(200)
        .all();
      for (const sibling of batch) {
        if (sibling.id !== resultId) {
          accumulate(remaining, sibling);
        }
      }
      if (batch.length < 200) {
        break;
      }
      after = batch[batch.length - 1].id;
    }
    const observed = structuredClone(remaining);
    accumulate(observed, result);
    const counts = [
      'testPassCount',
      'testFailCount',
      'testErrorCount',
      'assertPassCount',
      'assertFailCount',
    ] as const;
    const closeEnough = (a: number, b: number) =>
      Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
    const metricBuckets = ['namedScores', 'namedScoresCount', 'namedScoreWeights'] as const;
    if (
      counts.some((key) => original[key] !== observed[key]) ||
      metricBuckets.some((bucket) => {
        const saved = original[bucket];
        const recomputed = observed[bucket];
        return (
          saved &&
          recomputed &&
          (Object.keys(saved).length !== Object.keys(recomputed).length ||
            Object.entries(saved).some(([name, value]) => !closeEnough(value, recomputed[name])))
        );
      })
    ) {
      throw new EvalResultDeletionConflict(
        'The saved results do not account for the prompt metrics. Resume the evaluation before deleting results.',
      );
    }

    if (original.incurredCost !== undefined) {
      remaining.incurredCost ??= remaining.cost;
    }

    // Trace and media records have evaluation-level or coordinate-level ownership. Keep them
    // available to remaining results, including repeats that share the same coordinates.
    await tx.delete(evalResultsTable).where(belongsToEval).run();
    await tx
      .update(evalsTable)
      .set({
        results: sql`json_set(${evalsTable.results}, '$.__promptfooResultDeletionRevision', ${resultDeletionRevision} + 1)`,
        prompts: row.prompts!.map((item, index) =>
          index === result.promptIdx ? { ...item, metrics: { ...original, ...remaining } } : item,
        ),
      })
      .where(eq(evalsTable.id, evalId))
      .run();
  });
  notifyEvaluationChanged(evalId);
}

export async function deleteEvalResultById(id: string): Promise<void> {
  const db = await getDb();
  const row = await db
    .select({ evalId: evalResultsTable.evalId })
    .from(evalResultsTable)
    .where(eq(evalResultsTable.id, id))
    .get();
  if (!row) {
    throw new EvalResultNotFoundError('Eval result not found');
  }
  await deleteEvalResult(row.evalId, id);
}
