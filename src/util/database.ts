import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { collectBlobHashes } from '../blobs/blobRefs';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { deleteTraceRecordsForEvals } from '../database/evalDeletion';
import { assertEvalNotRunning, EvalResultDeletionError } from '../database/evalRun';
import { getDb } from '../database/index';
import {
  blobReferencesTable,
  datasetsTable,
  evalResultsTable,
  evalsTable,
  evalsToDatasetsTable,
  evalsToPromptsTable,
  evalsToTagsTable,
  promptsTable,
  spansTable,
  tagsTable,
  tracesTable,
} from '../database/tables';
import { getAuthor } from '../globalConfig/accounts';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import { notifyEvaluationChanged, notifyEvaluationsDeleted } from '../models/evalMutation';
import { generateIdFromPrompt } from '../models/prompt';
import {
  type CompletedPrompt,
  type EvaluateSummaryV2,
  type EvaluateTable,
  type EvalWithMetadata,
  type PromptWithMetadata,
  type ResultsFile,
  type TestCasesWithMetadata,
  type TestCasesWithMetadataPrompt,
  type UnifiedConfig,
} from '../types/index';
import invariant from '../util/invariant';
import { sha256 } from './createHash';
import { getNamedMetricContribution, type NamedMetricAccumulator } from './namedMetrics';
import {
  getAssertionCounts,
  recomputeDerivedMetrics,
  subtractResultFromPromptMetrics,
} from './promptMetrics';
import { restoreAzureBlobSasTokens, sanitizeTracingConfigForPersistence } from './sanitizer';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
  setCachedStandaloneEvals,
} from './standaloneEvalCache';
import {
  accumulateResultTokenUsage,
  createEmptyTokenUsage,
  hasGradingTokenUsage,
} from './tokenUsageUtils';

import type { StandaloneEval } from './standaloneEvalCache';

export { clearStandaloneEvalCache } from './standaloneEvalCache';

export type { StandaloneEval };

export async function writeResultsToDatabase(
  results: EvaluateSummaryV2,
  config: Partial<UnifiedConfig>,
  createdAt: Date = new Date(),
): Promise<string> {
  createdAt = createdAt || (results.timestamp ? new Date(results.timestamp) : new Date());
  const evalId = createEvalId(createdAt);
  const db = await getDb();

  await db.transaction(async (tx) => {
    await tx
      .insert(evalsTable)
      .values({
        id: evalId,
        createdAt: createdAt.getTime(),
        author: getAuthor(),
        description: config.description,
        config: sanitizeTracingConfigForPersistence(config),
        results,
        isRedteam: config.redteam !== undefined,
      })
      .onConflictDoNothing()
      .run();

    logger.debug(`Inserting eval ${evalId}`);

    // Record prompt relation
    invariant(results.table, 'Table is required');

    for (const prompt of results.table.head.prompts) {
      const label = prompt.label || prompt.display || prompt.raw;
      const promptId = generateIdFromPrompt(prompt);

      await tx
        .insert(promptsTable)
        .values({
          id: promptId,
          prompt: label,
        })
        .onConflictDoNothing()
        .run();

      await tx
        .insert(evalsToPromptsTable)
        .values({
          evalId,
          promptId,
        })
        .onConflictDoNothing()
        .run();

      logger.debug(`Inserting prompt ${promptId}`);
    }

    // Record dataset relation
    const datasetId = sha256(JSON.stringify(config.tests || []));
    const testsForStorage = Array.isArray(config.tests) ? config.tests : [];

    // Log when non-array tests are converted to empty array for database storage
    if (config.tests && !Array.isArray(config.tests)) {
      const testsType = typeof config.tests;
      const hasPath =
        typeof config.tests === 'object' && config.tests !== null && 'path' in config.tests;
      logger.debug(
        `Converting non-array test configuration to empty array for database storage. Type: ${testsType}, hasPath: ${hasPath}`,
      );
    }

    await tx
      .insert(datasetsTable)
      .values({
        id: datasetId,
        tests: testsForStorage,
      })
      .onConflictDoNothing()
      .run();

    await tx
      .insert(evalsToDatasetsTable)
      .values({
        evalId,
        datasetId,
      })
      .onConflictDoNothing()
      .run();

    logger.debug(`Inserting dataset ${datasetId}`);

    // Record tags
    if (config.tags) {
      for (const [tagKey, tagValue] of Object.entries(config.tags)) {
        const tagId = sha256(`${tagKey}:${tagValue}`);

        await tx
          .insert(tagsTable)
          .values({
            id: tagId,
            name: tagKey,
            value: tagValue,
          })
          .onConflictDoNothing()
          .run();

        await tx
          .insert(evalsToTagsTable)
          .values({
            evalId,
            tagId,
          })
          .onConflictDoNothing()
          .run();

        logger.debug(`Inserting tag ${tagId}`);
      }
    }
  });

  notifyEvaluationChanged(evalId);

  return evalId;
}

export async function readResult(
  id: string,
): Promise<{ id: string; result: ResultsFile; createdAt: Date } | undefined> {
  try {
    const eval_ = await Eval.findById(id);
    invariant(eval_, `Eval with ID ${id} not found.`);
    return {
      id,
      result: await eval_.toResultsFile(),
      createdAt: new Date(eval_.createdAt),
    };
  } catch (err) {
    logger.error(`Failed to read result with ID ${id} from database:\n${err}`);
  }
}

export async function updateResult(
  id: string,
  newConfig?: Partial<UnifiedConfig>,
  newTable?: EvaluateTable,
): Promise<void> {
  try {
    // Fetch the existing eval data from the database
    const existingEval = await Eval.findById(id);

    if (!existingEval) {
      logger.error(`Eval with ID ${id} not found.`);
      return;
    }

    if (newConfig) {
      existingEval.config = restoreAzureBlobSasTokens(newConfig, existingEval.config);
    }
    if (newTable) {
      existingEval.setTable(newTable);
    }

    await existingEval.save({ updatePrompts: false });

    logger.info(`Updated eval with ID ${id}`);
  } catch (err) {
    logger.error(`Failed to update eval with ID ${id}:\n${err}`);
    throw err;
  }
}

async function getPromptsWithPredicate(
  predicate: (eval_: Eval) => boolean,
  limit: number,
): Promise<PromptWithMetadata[]> {
  // TODO(ian): Make this use a proper database query
  const evals_ = await Eval.getMany(limit);

  const groupedPrompts: { [hash: string]: PromptWithMetadata } = {};

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    if (predicate(eval_)) {
      const datasetId = sha256(JSON.stringify(eval_.config.tests || []));
      for (const prompt of eval_.getPrompts()) {
        const promptId = sha256(prompt.raw);
        if (promptId in groupedPrompts) {
          groupedPrompts[promptId].recentEvalDate = new Date(
            Math.max(
              groupedPrompts[promptId].recentEvalDate.getTime(),
              new Date(createdAt).getTime(),
            ),
          );
          groupedPrompts[promptId].count += 1;
          groupedPrompts[promptId].evals.push({
            id: eval_.id,
            datasetId,
            metrics: prompt.metrics,
          });
        } else {
          groupedPrompts[promptId] = {
            count: 1,
            id: promptId,
            prompt,
            recentEvalDate: new Date(createdAt),
            recentEvalId: eval_.id,
            evals: [
              {
                id: eval_.id,
                datasetId,
                metrics: prompt.metrics,
              },
            ],
          };
        }
      }
    }
  }

  return Object.values(groupedPrompts);
}

export function getPromptsForTestCasesHash(
  testCasesSha256: string,
  limit: number = DEFAULT_QUERY_LIMIT,
) {
  return getPromptsWithPredicate((eval_) => {
    const testsJson = JSON.stringify(eval_.config.tests || []);
    const hash = sha256(testsJson);
    return hash === testCasesSha256;
  }, limit);
}

async function getTestCasesWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<TestCasesWithMetadata[]> {
  const evals_ = await Eval.getMany(limit);

  const groupedTestCases: { [hash: string]: TestCasesWithMetadata } = {};

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    const resultWrapper: ResultsFile = await eval_.toResultsFile();
    const testCases = resultWrapper.config.tests;
    if (testCases && predicate(resultWrapper)) {
      const evalId = eval_.id;
      // For database storage, we need to handle the union type properly
      // Only store actual test case arrays, not generator configs
      let storableTestCases: string | Array<string | any>;
      if (typeof testCases === 'string') {
        storableTestCases = testCases;
      } else if (Array.isArray(testCases)) {
        storableTestCases = testCases;
      } else {
        // If it's a TestGeneratorConfig object, we can't store it directly
        // This case should be rare as the database typically stores resolved tests
        logger.warn('Skipping TestGeneratorConfig object in database storage');
        continue;
      }
      const datasetId = sha256(JSON.stringify(eval_.config.tests || []));

      if (datasetId in groupedTestCases) {
        groupedTestCases[datasetId].recentEvalDate = new Date(
          Math.max(groupedTestCases[datasetId].recentEvalDate.getTime(), eval_.createdAt),
        );
        groupedTestCases[datasetId].count += 1;
        const newPrompts = eval_.getPrompts().map((prompt) => ({
          id: sha256(prompt.raw),
          prompt,
          evalId,
        }));
        const promptsById: Record<string, TestCasesWithMetadataPrompt> = {};
        for (const prompt of groupedTestCases[datasetId].prompts.concat(newPrompts)) {
          if (!(prompt.id in promptsById)) {
            promptsById[prompt.id] = prompt;
          }
        }
        groupedTestCases[datasetId].prompts = Object.values(promptsById);
      } else {
        const newPrompts = eval_.getPrompts().map((prompt) => ({
          id: sha256(prompt.raw),
          prompt,
          evalId,
        }));
        const promptsById: Record<string, TestCasesWithMetadataPrompt> = {};
        for (const prompt of newPrompts) {
          if (!(prompt.id in promptsById)) {
            promptsById[prompt.id] = prompt;
          }
        }
        groupedTestCases[datasetId] = {
          id: datasetId,
          count: 1,
          testCases: storableTestCases,
          recentEvalDate: new Date(createdAt),
          recentEvalId: evalId,
          prompts: Object.values(promptsById),
        };
      }
    }
  }

  return Object.values(groupedTestCases);
}

export function getPrompts(limit: number = DEFAULT_QUERY_LIMIT) {
  return getPromptsWithPredicate(() => true, limit);
}

export async function getTestCases(limit: number = DEFAULT_QUERY_LIMIT) {
  return getTestCasesWithPredicate(() => true, limit);
}

export async function getPromptFromHash(hash: string) {
  const prompts = await getPrompts();
  for (const prompt of prompts) {
    if (prompt.id.startsWith(hash)) {
      return prompt;
    }
  }
  return undefined;
}

export async function getDatasetFromHash(hash: string) {
  const datasets = await getTestCases();
  for (const dataset of datasets) {
    if (dataset.id.startsWith(hash)) {
      return dataset;
    }
  }
  return undefined;
}

async function getEvalsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<EvalWithMetadata[]> {
  const db = await getDb();
  const evals_ = await db
    .select({
      id: evalsTable.id,
      createdAt: evalsTable.createdAt,
      author: evalsTable.author,
      results: evalsTable.results,
      config: evalsTable.config,
      description: evalsTable.description,
    })
    .from(evalsTable)
    .orderBy(desc(evalsTable.createdAt))
    .limit(limit)
    .all();

  const ret: EvalWithMetadata[] = [];

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    const resultWrapper: ResultsFile = {
      version: 3,
      createdAt,
      author: eval_.author,
      // @ts-ignore
      results: eval_.results,
      config: eval_.config,
    };
    if (predicate(resultWrapper)) {
      const evalId = eval_.id;
      ret.push({
        id: evalId,
        date: new Date(eval_.createdAt),
        config: eval_.config,
        // @ts-ignore
        results: eval_.results,
        description: eval_.description || undefined,
      });
    }
  }

  return ret;
}

async function getEvals(limit: number = DEFAULT_QUERY_LIMIT) {
  return getEvalsWithPredicate(() => true, limit);
}

export async function getEvalFromId(hash: string) {
  const evals_ = await getEvals();
  for (const eval_ of evals_) {
    if (eval_.id.startsWith(hash)) {
      return eval_;
    }
  }
  return undefined;
}

export async function deleteEval(evalId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Clean up FK-referenced rows first; not all relationships have onDelete: 'cascade'.
    // Spans and traces in particular must be removed before the eval row, otherwise
    // SQLite raises "FOREIGN KEY constraint failed" (foreign_keys pragma is ON).
    await deleteTraceRecordsForEvals(tx, [evalId]);
    await tx.delete(evalsToPromptsTable).where(eq(evalsToPromptsTable.evalId, evalId)).run();
    await tx.delete(evalsToDatasetsTable).where(eq(evalsToDatasetsTable.evalId, evalId)).run();
    await tx.delete(evalsToTagsTable).where(eq(evalsToTagsTable.evalId, evalId)).run();
    await tx.delete(evalResultsTable).where(eq(evalResultsTable.evalId, evalId)).run();

    // Finally, delete the eval record
    const deletedIds = await tx.delete(evalsTable).where(eq(evalsTable.id, evalId)).run();
    if (deletedIds.rowsAffected === 0) {
      throw new Error(`Eval with ID ${evalId} not found`);
    }
  });
  notifyEvaluationsDeleted([evalId]);
}

export class EvalResultNotFoundError extends Error {
  constructor(evalId: string, resultId: string) {
    super(`Eval result not found: evalId=${evalId} resultId=${resultId}`);
    this.name = 'EvalResultNotFoundError';
  }
}

export async function getEvalIdForResult(resultId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db
    .select({ evalId: evalResultsTable.evalId })
    .from(evalResultsTable)
    .where(eq(evalResultsTable.id, resultId))
    .get();
  return row?.evalId ?? null;
}

type UsageResult = Pick<typeof evalResultsTable.$inferSelect, 'response' | 'gradingResult'>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

type BlobUsageResult = typeof evalResultsTable.$inferSelect;
type DatabaseTransaction = Parameters<
  Parameters<Awaited<ReturnType<typeof getDb>>['transaction']>[0]
>[0];

const BLOB_SURVIVOR_SCAN_BATCH_SIZE = 500;

function mentionsBlobHash(value: unknown, blobHash: string): boolean {
  return collectBlobHashes(value).has(blobHash.toLowerCase());
}

async function traceUsesBlobHash(
  tx: DatabaseTransaction,
  evalId: string,
  blobHash: string,
): Promise<boolean> {
  let cursor: { traceId: string; spanId: string | null } | undefined;
  for (;;) {
    const rows = await tx
      .select()
      .from(tracesTable)
      .leftJoin(spansTable, eq(spansTable.traceId, tracesTable.traceId))
      .where(
        and(
          eq(tracesTable.evaluationId, evalId),
          cursor &&
            or(
              gt(tracesTable.id, cursor.traceId),
              cursor.spanId === null
                ? undefined
                : and(eq(tracesTable.id, cursor.traceId), gt(spansTable.id, cursor.spanId)),
            ),
        ),
      )
      .orderBy(tracesTable.id, spansTable.id)
      .limit(BLOB_SURVIVOR_SCAN_BATCH_SIZE)
      .all();
    if (rows.some((row) => mentionsBlobHash(row, blobHash))) {
      return true;
    }
    if (rows.length < BLOB_SURVIVOR_SCAN_BATCH_SIZE) {
      return false;
    }
    const last = rows[rows.length - 1];
    cursor = { traceId: last.traces.id, spanId: last.spans?.id ?? null };
  }
}

async function findSurvivingResultUsingBlobHash(
  tx: DatabaseTransaction,
  evalId: string,
  resultId: string,
  blobHash: string,
  scope?: { testIdx: number | null; promptIdx: number | null },
): Promise<BlobUsageResult | undefined> {
  let lastId: string | undefined;
  for (;;) {
    const rows = await tx
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          ne(evalResultsTable.id, resultId),
          lastId ? gt(evalResultsTable.id, lastId) : undefined,
          scope?.testIdx == null ? undefined : eq(evalResultsTable.testIdx, scope.testIdx),
          scope?.promptIdx == null ? undefined : eq(evalResultsTable.promptIdx, scope.promptIdx),
        ),
      )
      .orderBy(evalResultsTable.id)
      .limit(BLOB_SURVIVOR_SCAN_BATCH_SIZE)
      .all();

    const match = rows.find((survivingResult) => mentionsBlobHash(survivingResult, blobHash));
    if (match || rows.length < BLOB_SURVIVOR_SCAN_BATCH_SIZE) {
      return match;
    }
    lastId = rows[rows.length - 1].id;
  }
}

async function updatePromptMetricsForDeletedResult(
  tx: DatabaseTransaction,
  evalId: string,
  resultId: string,
  result: typeof evalResultsTable.$inferSelect,
): Promise<void> {
  const evalRow = await tx
    .select({ config: evalsTable.config, prompts: evalsTable.prompts })
    .from(evalsTable)
    .where(eq(evalsTable.id, evalId))
    .get();
  const prompts = evalRow?.prompts ?? null;
  const prompt = prompts?.[result.promptIdx];
  if (!prompts || !prompt?.metrics) {
    return;
  }

  const accountedCount =
    (prompt.metrics.testPassCount ?? 0) +
    (prompt.metrics.testFailCount ?? 0) +
    (prompt.metrics.testErrorCount ?? 0);
  const persistedCount =
    (
      await tx
        .select({ count: sql<number>`count(*)` })
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            eq(evalResultsTable.promptIdx, result.promptIdx),
          ),
        )
        .get()
    )?.count ?? 0;
  if (isFiniteNumber(accountedCount) && accountedCount < persistedCount) {
    throw new EvalResultDeletionError(
      `Evaluation ${evalId} has incomplete prompt metrics. Resume it to rebuild metrics from saved results before deleting results.`,
    );
  }
  const completePopulation = accountedCount === persistedCount;
  const resultAssertionCounts = getAssertionCounts(result.gradingResult);
  const derivedMetrics = Array.isArray(evalRow?.config?.derivedMetrics)
    ? evalRow.config.derivedMetrics
    : undefined;
  const shouldRecomputeAssertionTokenUsage =
    completePopulation &&
    !hasGradingTokenUsage(result.gradingResult) &&
    Boolean(prompt.metrics.tokenUsage?.assertions);
  const namedMetricsToRecompute = new Map<string, Set<keyof NamedMetricAccumulator>>();
  for (const [metricName, metricValue] of Object.entries(result.namedScores ?? {})) {
    if (!isFiniteNumber(metricValue)) {
      continue;
    }
    const contribution = getNamedMetricContribution({
      metricName,
      metricValue,
      gradingResult: result.gradingResult,
      metadata: result.metadata,
    });
    const unknownBuckets = new Set(
      (Object.keys(contribution) as (keyof NamedMetricAccumulator)[]).filter(
        (bucket) => contribution[bucket] === undefined && prompt.metrics?.[bucket] !== undefined,
      ),
    );
    if (completePopulation && unknownBuckets.size) {
      namedMetricsToRecompute.set(metricName, unknownBuckets);
    }
  }
  let survivingAssertionCounts =
    !resultAssertionCounts && completePopulation ? { pass: 0, fail: 0 } : undefined;
  let survivingAssertionTokenUsage = shouldRecomputeAssertionTokenUsage
    ? createEmptyTokenUsage()
    : undefined;
  if (survivingAssertionTokenUsage && prompt.metrics.tokenUsage?.incurredTokenUsage) {
    survivingAssertionTokenUsage.incurredTokenUsage = {};
  }
  const survivingNamedMetrics: Required<NamedMetricAccumulator> = {
    namedScores: {},
    namedScoresCount: {},
    namedScoreWeights: {},
  };
  const survivorCondition = and(
    eq(evalResultsTable.evalId, evalId),
    eq(evalResultsTable.promptIdx, result.promptIdx),
    ne(evalResultsTable.id, resultId),
  );
  // Missing legacy contributions are unknown. Rebuild only buckets with complete survivor evidence.
  let afterId: string | undefined;
  while (survivingAssertionCounts || survivingAssertionTokenUsage || namedMetricsToRecompute.size) {
    const batch = await tx
      .select({
        id: evalResultsTable.id,
        gradingResult: evalResultsTable.gradingResult,
        namedScores: namedMetricsToRecompute.size ? evalResultsTable.namedScores : sql<null>`NULL`,
        metadata: namedMetricsToRecompute.size
          ? sql`json_type(${evalResultsTable.metadata}, '$.__promptfoo.originallyUngraded') = 'true'`.mapWith(
              (value) => ({ __promptfoo: { originallyUngraded: value === 1 } }),
            )
          : sql<null>`NULL`,
        response: survivingAssertionTokenUsage
          ? sql<
              UsageResult['response']
            >`CASE WHEN ${evalResultsTable.response} IS NULL THEN NULL ELSE
            json_object('tokenUsage', json_extract(${evalResultsTable.response}, '$.tokenUsage'),
                        'cached', json_extract(${evalResultsTable.response}, '$.cached')) END`.mapWith(
              (value: string | null) => (value === null ? null : JSON.parse(value)),
            )
          : sql<null>`NULL`,
      })
      .from(evalResultsTable)
      .where(and(survivorCondition, afterId ? gt(evalResultsTable.id, afterId) : undefined))
      .orderBy(evalResultsTable.id)
      .limit(500)
      .all();
    for (const row of batch) {
      if (survivingAssertionCounts) {
        const counts = getAssertionCounts(row.gradingResult);
        if (counts) {
          survivingAssertionCounts.pass += counts.pass;
          survivingAssertionCounts.fail += counts.fail;
        } else {
          survivingAssertionCounts = undefined;
        }
      }
      if (survivingAssertionTokenUsage) {
        if (hasGradingTokenUsage(row.gradingResult)) {
          accumulateResultTokenUsage(survivingAssertionTokenUsage, row);
        } else {
          survivingAssertionTokenUsage = undefined;
        }
      }
      for (const [metricName, buckets] of namedMetricsToRecompute) {
        const metricValue = row.namedScores?.[metricName];
        if (!isFiniteNumber(metricValue)) {
          continue;
        }
        const contribution = getNamedMetricContribution({
          metricName,
          metricValue,
          gradingResult: row.gradingResult,
          metadata: row.metadata,
        });
        for (const bucket of buckets) {
          const value = contribution[bucket];
          if (value === undefined) {
            buckets.delete(bucket);
          } else {
            survivingNamedMetrics[bucket][metricName] =
              (survivingNamedMetrics[bucket][metricName] ?? 0) + value;
          }
        }
        if (!buckets.size) {
          namedMetricsToRecompute.delete(metricName);
        }
      }
    }
    if (batch.length < 500) {
      break;
    }
    afterId = batch[batch.length - 1].id;
  }

  const updatedPrompts: CompletedPrompt[] = prompts.map((p, i) =>
    i === result.promptIdx && p.metrics
      ? { ...p, metrics: { ...p.metrics, tokenUsage: structuredClone(p.metrics.tokenUsage) } }
      : p,
  );
  const updatedPrompt = updatedPrompts[result.promptIdx];
  invariant(updatedPrompt?.metrics, 'cloned prompt is missing metrics');
  subtractResultFromPromptMetrics(
    updatedPrompt.metrics,
    result,
    survivingAssertionCounts,
    survivingAssertionTokenUsage,
  );
  for (const [metricName, buckets] of namedMetricsToRecompute) {
    for (const bucket of buckets) {
      const value = survivingNamedMetrics[bucket][metricName];
      if (value === undefined) {
        delete updatedPrompt.metrics[bucket]?.[metricName];
      } else {
        updatedPrompt.metrics[bucket]![metricName] = value;
      }
    }
  }
  const previousUsage = prompt.metrics.tokenUsage;
  const updatedUsage = updatedPrompt.metrics.tokenUsage;
  for (const [previous, updated] of [
    [previousUsage?.assertions, updatedUsage?.assertions],
    [previousUsage?.incurredTokenUsage?.assertions, updatedUsage?.incurredTokenUsage?.assertions],
  ]) {
    for (const [before, after] of [
      [previous, updated],
      [previous?.completionDetails, updated?.completionDetails],
    ]) {
      for (const [key, value] of Object.entries(before ?? {})) {
        const next = (after as Record<string, unknown> | undefined)?.[key];
        if (isFiniteNumber(value) && value >= 0 && isFiniteNumber(next) && next < 0) {
          throw new EvalResultDeletionError(
            `Evaluation ${evalId} has incomplete grading metrics. Retry failed results before deleting results.`,
          );
        }
      }
    }
  }
  if (derivedMetrics?.length) {
    const remainingCount =
      updatedPrompt.metrics.testPassCount +
      updatedPrompt.metrics.testFailCount +
      updatedPrompt.metrics.testErrorCount;
    await recomputeDerivedMetrics(updatedPrompt.metrics, derivedMetrics, remainingCount);
  }
  await tx
    .update(evalsTable)
    .set({ prompts: updatedPrompts })
    .where(eq(evalsTable.id, evalId))
    .run();
}

async function cleanupBlobReferencesForDeletedResult(
  tx: DatabaseTransaction,
  evalId: string,
  resultId: string,
  result: typeof evalResultsTable.$inferSelect,
): Promise<void> {
  const blobReferences = await tx
    .select({
      id: blobReferencesTable.id,
      blobHash: blobReferencesTable.blobHash,
      testIdx: blobReferencesTable.testIdx,
      promptIdx: blobReferencesTable.promptIdx,
      location: blobReferencesTable.location,
    })
    .from(blobReferencesTable)
    .where(
      and(
        eq(blobReferencesTable.evalId, evalId),
        or(eq(blobReferencesTable.testIdx, result.testIdx), isNull(blobReferencesTable.testIdx)),
        or(
          eq(blobReferencesTable.promptIdx, result.promptIdx),
          isNull(blobReferencesTable.promptIdx),
        ),
      ),
    )
    .all();

  if (blobReferences.length === 0) {
    return;
  }
  const evalRow = await tx
    .select({ prompts: evalsTable.prompts })
    .from(evalsTable)
    .where(eq(evalsTable.id, evalId))
    .get();

  for (const blobReference of blobReferences) {
    const isEvalLevelReference = blobReference.testIdx === null && blobReference.promptIdx === null;
    const isImportedReference = blobReference.location === 'import';
    if (isEvalLevelReference && !mentionsBlobHash(result, blobReference.blobHash)) {
      continue;
    }

    // Imports authorize media for the eval, even when reference recording retained cell
    // coordinates. Runtime provenance is limited to its recorded coordinates; providers
    // may omit one coordinate, but copied data outside that scope cannot inherit it.
    const survivingBlobResult = await findSurvivingResultUsingBlobHash(
      tx,
      evalId,
      resultId,
      blobReference.blobHash,
      isImportedReference ? undefined : blobReference,
    );
    if (survivingBlobResult) {
      if (isImportedReference && !isEvalLevelReference) {
        await tx
          .update(blobReferencesTable)
          .set({
            testIdx: survivingBlobResult.testIdx,
            promptIdx: survivingBlobResult.promptIdx,
          })
          .where(eq(blobReferencesTable.id, blobReference.id))
          .run();
      }
    } else if (
      isImportedReference &&
      (mentionsBlobHash(evalRow?.prompts, blobReference.blobHash) ||
        (await traceUsesBlobHash(tx, evalId, blobReference.blobHash)))
    ) {
      if (!isEvalLevelReference) {
        await tx
          .update(blobReferencesTable)
          .set({
            testIdx: null,
            promptIdx: null,
            location: 'import',
          })
          .where(eq(blobReferencesTable.id, blobReference.id))
          .run();
      }
    } else {
      await tx
        .delete(blobReferencesTable)
        .where(eq(blobReferencesTable.id, blobReference.id))
        .run();
    }
  }
}

/** Delete a result and update its metrics and blob references atomically. Traces remain eval-scoped. */
export async function deleteEvalResult(evalId: string, resultId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const result = await tx
      .select()
      .from(evalResultsTable)
      .where(and(eq(evalResultsTable.id, resultId), eq(evalResultsTable.evalId, evalId)))
      .get();
    if (!result) {
      throw new EvalResultNotFoundError(evalId, resultId);
    }

    await assertEvalNotRunning(tx, evalId);
    await updatePromptMetricsForDeletedResult(tx, evalId, resultId, result);
    await cleanupBlobReferencesForDeletedResult(tx, evalId, resultId, result);

    await tx
      .delete(evalResultsTable)
      .where(and(eq(evalResultsTable.id, resultId), eq(evalResultsTable.evalId, evalId)))
      .run();
  });
  notifyEvaluationChanged(evalId);
}

/**
 * Deletes evals by their IDs.
 * @param ids - The IDs of the evals to delete.
 */
export async function deleteEvals(ids: string[]): Promise<void> {
  // Deleting zero evals must not emit a delete signal: the watcher would broadcast an empty
  // deletedEvalIds list, which clients interpret as "all evals deleted" and reload/clear.
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await deleteTraceRecordsForEvals(tx, ids);
    await tx.delete(evalsToPromptsTable).where(inArray(evalsToPromptsTable.evalId, ids)).run();
    await tx.delete(evalsToDatasetsTable).where(inArray(evalsToDatasetsTable.evalId, ids)).run();
    await tx.delete(evalsToTagsTable).where(inArray(evalsToTagsTable.evalId, ids)).run();
    await tx.delete(evalResultsTable).where(inArray(evalResultsTable.evalId, ids)).run();
    await tx.delete(evalsTable).where(inArray(evalsTable.id, ids)).run();
  });
  notifyEvaluationsDeleted(ids);
}

/**
 * Deletes all evaluations and related records with foreign keys from the database.
 * @async
 * @returns {Promise<void>}
 */
export async function deleteAllEvals(): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(spansTable).run();
    await tx.delete(tracesTable).run();
    await tx.delete(evalResultsTable).run();
    await tx.delete(evalsToPromptsTable).run();
    await tx.delete(evalsToDatasetsTable).run();
    await tx.delete(evalsToTagsTable).run();
    await tx.delete(evalsTable).run();
  });
  notifyEvaluationsDeleted();
}

export async function getStandaloneEvals({
  limit = DEFAULT_QUERY_LIMIT,
  tag,
  description,
}: {
  limit?: number;
  tag?: { key: string; value: string };
  description?: string;
} = {}): Promise<StandaloneEval[]> {
  const cacheKey = getStandaloneEvalCacheKey({ limit, tag, description });
  const cachedResult = getCachedStandaloneEvals(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  const db = await getDb();
  const results = await db
    .select({
      evalId: evalsTable.id,
      description: evalsTable.description,
      results: evalsTable.results,
      createdAt: evalsTable.createdAt,
      promptId: evalsToPromptsTable.promptId,
      datasetId: evalsToDatasetsTable.datasetId,
      tagName: tagsTable.name,
      tagValue: tagsTable.value,
      isRedteam: evalsTable.isRedteam,
    })
    .from(evalsTable)
    .leftJoin(evalsToPromptsTable, eq(evalsTable.id, evalsToPromptsTable.evalId))
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .leftJoin(evalsToTagsTable, eq(evalsTable.id, evalsToTagsTable.evalId))
    .leftJoin(tagsTable, eq(evalsToTagsTable.tagId, tagsTable.id))
    .where(
      and(
        tag ? and(eq(tagsTable.name, tag.key), eq(tagsTable.value, tag.value)) : undefined,
        description ? eq(evalsTable.description, description) : undefined,
      ),
    )
    .orderBy(desc(evalsTable.createdAt))
    .limit(limit)
    .all();

  // Conservative optimization: Reduce N+1 by batching eval lookups while maintaining exact logic
  const uniqueEvalIds = Array.from(new Set(results.map((r) => r.evalId)));

  // Batch load all unique evals to reduce N+1 queries
  const evalPromises = uniqueEvalIds.map(async (evalId) => {
    const eval_ = await Eval.findById(evalId);
    invariant(eval_, `Eval with ID ${evalId} not found`);
    const table = (await eval_.getTable()) || { body: [] };
    return { evalId, eval_, table };
  });

  const evalData = await Promise.all(evalPromises);
  const evalMap = new Map(evalData.map(({ evalId, eval_, table }) => [evalId, { eval_, table }]));

  const standaloneEvals = results.flatMap((result) => {
    const { description, createdAt, evalId, promptId, datasetId, isRedteam } = result;

    const evalInfo = evalMap.get(evalId);
    invariant(evalInfo, `Eval with ID ${evalId} not found in map`);
    const { eval_, table } = evalInfo;

    // @ts-ignore
    return eval_.getPrompts().map((col, index) => {
      // Compute some stats - keep original logic exactly
      const pluginCounts = table.body.reduce<{
        pluginPassCount: Record<string, number>;
        pluginFailCount: Record<string, number>;
      }>(
        // @ts-ignore
        (acc, row) => {
          const pluginId = row.test.metadata?.pluginId;
          if (pluginId) {
            const output = row.outputs[index];
            if (!output) {
              return acc;
            }
            const isPass = output.pass;
            acc.pluginPassCount[pluginId] = (acc.pluginPassCount[pluginId] || 0) + (isPass ? 1 : 0);
            acc.pluginFailCount[pluginId] = (acc.pluginFailCount[pluginId] || 0) + (isPass ? 0 : 1);
          }
          return acc;
        },
        { pluginPassCount: {}, pluginFailCount: {} },
      );

      return {
        evalId,
        description,
        promptId,
        datasetId,
        createdAt,
        isRedteam,
        ...pluginCounts,
        ...col,
      };
    });
  });

  // Ensure each row has a UUID as the `id` and `evalId` properties are not unique!
  const withUUIDs = standaloneEvals.map((eval_) => ({
    ...eval_,
    uuid: crypto.randomUUID(),
  }));

  setCachedStandaloneEvals(cacheKey, withUUIDs);
  return withUUIDs;
}
