import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  BLOB_SCAN_MAX_DEPTH,
  BLOB_SCAN_MAX_STRING_LENGTH,
  collectBlobHashes,
} from '../blobs/blobRefs';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { deleteTraceRecordsForEvals } from '../database/evalDeletion';
import { assertEvalNotRunning } from '../database/evalRun';
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
  type DerivedMetric,
  type EvaluateSummaryV2,
  type EvaluateTable,
  type EvalWithMetadata,
  type PromptMetrics,
  type PromptWithMetadata,
  ResultFailureReason,
  type ResultsFile,
  type TestCasesWithMetadata,
  type TestCasesWithMetadataPrompt,
  type TokenUsage,
  type UnifiedConfig,
} from '../types/index';
import invariant from '../util/invariant';
import { sha256 } from './createHash';
import {
  accumulateNamedMetric,
  hasNamedMetricContribution,
  type NamedMetricAccumulator,
  subtractNamedMetric,
} from './namedMetrics';
import { restoreAzureBlobSasTokens, sanitizeTracingConfigForPersistence } from './sanitizer';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
  setCachedStandaloneEvals,
} from './standaloneEvalCache';
import {
  accumulateComparisonTokenUsage,
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
  subtractTokenUsage,
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

function getAssertionCounts(result: Pick<typeof evalResultsTable.$inferSelect, 'gradingResult'>): {
  pass: number;
  fail: number;
} | null {
  const gradingResult = result.gradingResult;
  if (!gradingResult || typeof gradingResult !== 'object' || Array.isArray(gradingResult)) {
    return null;
  }
  const componentResults = gradingResult.componentResults;
  if (!Array.isArray(componentResults)) {
    return Object.prototype.hasOwnProperty.call(gradingResult, 'componentResults') ||
      typeof gradingResult.pass !== 'boolean' ||
      !['human', 'select-best', 'max-score'].includes(gradingResult.assertion?.type ?? '')
      ? null
      : { pass: gradingResult.pass ? 1 : 0, fail: gradingResult.pass ? 0 : 1 };
  }
  return {
    pass: componentResults.filter((r) => r?.pass === true).length,
    fail: componentResults.filter((r) => r?.pass === false).length,
  };
}

type UsageResult = Pick<typeof evalResultsTable.$inferSelect, 'response' | 'gradingResult'>;

function hasGradingTokenUsage(
  grade: UsageResult['gradingResult'],
): grade is NonNullable<UsageResult['gradingResult']> & { tokensUsed: TokenUsage } {
  return Boolean(
    grade &&
      typeof grade === 'object' &&
      !Array.isArray(grade) &&
      grade.tokensUsed &&
      typeof grade.tokensUsed === 'object' &&
      !Array.isArray(grade.tokensUsed),
  );
}

function accumulateResultTokenUsage(usage: TokenUsage, result: UsageResult): void {
  accumulateResponseTokenUsage(usage, result.response ?? undefined);
  const grade = result.gradingResult;
  if (!hasGradingTokenUsage(grade)) {
    return;
  }

  // Comparisons are appended after ordinary grading and credit their reported counts verbatim.
  const comparisons = Array.isArray(grade.componentResults)
    ? grade.componentResults.filter(
        (r) =>
          r?.assertion?.type === 'select-best' &&
          r.tokensUsed &&
          typeof r.tokensUsed === 'object' &&
          !Array.isArray(r.tokensUsed),
      )
    : grade.assertion?.type === 'select-best'
      ? [grade]
      : [];
  if (comparisons[0] !== grade) {
    const initialTokens = structuredClone(grade.tokensUsed);
    const initialUsage: TokenUsage = {
      assertions: initialTokens,
      ...(initialTokens.incurredTokenUsage && {
        incurredTokenUsage: { assertions: initialTokens.incurredTokenUsage },
      }),
    };
    for (const comparison of comparisons) {
      const comparisonUsage: TokenUsage = initialTokens.incurredTokenUsage
        ? { incurredTokenUsage: {} }
        : {};
      accumulateComparisonTokenUsage(comparisonUsage, comparison.tokensUsed!, {
        cached: comparison.metadata?.cachedResponse,
      });
      subtractTokenUsage(initialUsage, comparisonUsage);
    }
    accumulateGradingTokenUsage(usage, initialTokens, { cached: grade.metadata?.cachedResponse });
  }
  for (const comparison of comparisons) {
    accumulateComparisonTokenUsage(usage, comparison.tokensUsed!, {
      cached: comparison.metadata?.cachedResponse,
    });
  }
}

function applyRecomputedNamedMetrics(
  metrics: PromptMetrics,
  metricNames: Set<string>,
  recomputed: Required<NamedMetricAccumulator>,
): void {
  const hadScoreCounts = metrics.namedScoresCount !== undefined;
  const hadScoreWeights = metrics.namedScoreWeights !== undefined;
  metrics.namedScores ||= {};
  for (const metricName of metricNames) {
    if (Object.prototype.hasOwnProperty.call(recomputed.namedScores, metricName)) {
      metrics.namedScores[metricName] = recomputed.namedScores[metricName];
    } else {
      delete metrics.namedScores[metricName];
    }

    if (hadScoreCounts) {
      const count = recomputed.namedScoresCount?.[metricName];
      if (count) {
        metrics.namedScoresCount ||= {};
        metrics.namedScoresCount[metricName] = count;
      } else {
        delete metrics.namedScoresCount?.[metricName];
      }
    }

    if (hadScoreWeights) {
      const weight = recomputed.namedScoreWeights?.[metricName];
      // A metric-only assertion legitimately carries weight `0`; distinguish
      // "recomputed to zero" from "no surviving contribution" by property
      // presence rather than truthiness.
      if (weight === undefined) {
        delete metrics.namedScoreWeights?.[metricName];
      } else {
        metrics.namedScoreWeights ||= {};
        metrics.namedScoreWeights[metricName] = weight;
      }
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function subtractTrackedMetric(current: number | undefined, delta: unknown): number {
  if (!isFiniteNumber(delta)) {
    return current ?? 0;
  }
  return current === undefined ? 0 : current - delta;
}

async function recomputeDerivedMetrics(
  metrics: PromptMetrics,
  derivedMetrics: DerivedMetric[] | undefined,
  promptEvalCount: number,
): Promise<void> {
  if (!derivedMetrics || derivedMetrics.length === 0) {
    return;
  }

  const math = await import('mathjs');
  metrics.namedScores ||= {};
  const evalContext: Record<string, number> = {};
  for (const [name, value] of Object.entries(metrics.namedScores)) {
    if (isFiniteNumber(value)) {
      evalContext[name] = value;
    }
  }

  evalContext.__count = promptEvalCount;
  for (const metric of derivedMetrics) {
    if (typeof metric.value !== 'string') {
      continue;
    }
    try {
      const value = math.evaluate(metric.value, evalContext);
      if (isFiniteNumber(value)) {
        metrics.namedScores[metric.name] = value;
        evalContext[metric.name] = value;
      } else {
        delete metrics.namedScores[metric.name];
        delete evalContext[metric.name];
      }
    } catch {
      delete metrics.namedScores[metric.name];
      delete evalContext[metric.name];
    }
  }
}

type BlobUsageResult = Pick<
  typeof evalResultsTable.$inferSelect,
  'id' | 'testIdx' | 'promptIdx' | 'response' | 'testCase' | 'metadata' | 'gradingResult'
>;
type DatabaseTransaction = Parameters<
  Parameters<Awaited<ReturnType<typeof getDb>>['transaction']>[0]
>[0];

const BLOB_URI_PREFIX = 'promptfoo://blob/';
const BLOB_SURVIVOR_SCAN_BATCH_SIZE = 500;

function resultMentionsBlobHash(result: BlobUsageResult, blobHash: string): boolean {
  return [result.response, result.testCase, result.metadata, result.gradingResult].some((value) =>
    collectBlobHashes(value, {
      maxDepth: BLOB_SCAN_MAX_DEPTH,
      maxStringLength: BLOB_SCAN_MAX_STRING_LENGTH,
    }).has(blobHash.toLowerCase()),
  );
}

async function traceUsesBlobHash(
  tx: DatabaseTransaction,
  evalId: string,
  blobHash: string,
): Promise<boolean> {
  const uriPattern = `%${BLOB_URI_PREFIX}${blobHash.toLowerCase()}%`;
  const row = await tx
    .select({ id: tracesTable.id })
    .from(tracesTable)
    .leftJoin(spansTable, eq(spansTable.traceId, tracesTable.traceId))
    .where(
      and(
        eq(tracesTable.evaluationId, evalId),
        or(
          sql`lower(cast(${tracesTable.metadata} as text)) like ${uriPattern}`,
          sql`lower(cast(${spansTable.attributes} as text)) like ${uriPattern}`,
        ),
      ),
    )
    .get();
  return Boolean(row);
}

async function findSurvivingResultUsingBlobHash(
  tx: DatabaseTransaction,
  evalId: string,
  resultId: string,
  blobHash: string,
  cell?: { testIdx: number; promptIdx: number },
): Promise<BlobUsageResult | undefined> {
  let offset = 0;
  for (;;) {
    const baseCondition = and(
      eq(evalResultsTable.evalId, evalId),
      ne(evalResultsTable.id, resultId),
    );
    const rows = await tx
      .select({
        id: evalResultsTable.id,
        testIdx: evalResultsTable.testIdx,
        promptIdx: evalResultsTable.promptIdx,
        response: evalResultsTable.response,
        testCase: evalResultsTable.testCase,
        metadata: evalResultsTable.metadata,
        gradingResult: evalResultsTable.gradingResult,
      })
      .from(evalResultsTable)
      .where(
        cell
          ? and(
              baseCondition,
              eq(evalResultsTable.testIdx, cell.testIdx),
              eq(evalResultsTable.promptIdx, cell.promptIdx),
            )
          : baseCondition,
      )
      .limit(BLOB_SURVIVOR_SCAN_BATCH_SIZE)
      .offset(offset)
      .all();

    const match = rows.find((survivingResult) => resultMentionsBlobHash(survivingResult, blobHash));
    if (match || rows.length < BLOB_SURVIVOR_SCAN_BATCH_SIZE) {
      return match;
    }
    offset += rows.length;
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

  const resultAssertionCounts = getAssertionCounts(result);
  const derivedMetrics = Array.isArray(evalRow?.config?.derivedMetrics)
    ? evalRow.config.derivedMetrics
    : undefined;
  const shouldRecomputeAssertionTokenUsage =
    !hasGradingTokenUsage(result.gradingResult) && Boolean(prompt.metrics.tokenUsage?.assertions);
  const namedMetricsToRecompute = new Set(
    Object.entries(result.namedScores ?? {})
      .filter(
        ([name, value]) =>
          isFiniteNumber(value) && !hasNamedMetricContribution(result.gradingResult, name),
      )
      .map(([name]) => name),
  );
  let survivingAssertionCounts = resultAssertionCounts ? undefined : { pass: 0, fail: 0 };
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
        const counts = getAssertionCounts(row);
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
      for (const metricName of namedMetricsToRecompute) {
        const metricValue = row.namedScores?.[metricName];
        if (!isFiniteNumber(metricValue)) {
          continue;
        }
        if (hasNamedMetricContribution(row.gradingResult, metricName)) {
          accumulateNamedMetric(survivingNamedMetrics, {
            metricName,
            metricValue,
            gradingResult: row.gradingResult,
          });
        } else {
          namedMetricsToRecompute.delete(metricName);
        }
      }
    }
    if (batch.length < 500) {
      break;
    }
    afterId = batch.at(-1)!.id;
  }

  const updatedPrompts: CompletedPrompt[] = prompts.map((p, i) =>
    i === result.promptIdx && p.metrics ? { ...p, metrics: { ...p.metrics } } : p,
  );
  const updatedPrompt = updatedPrompts[result.promptIdx];
  invariant(updatedPrompt?.metrics, 'cloned prompt is missing metrics');
  subtractResultFromPromptMetrics(
    updatedPrompt.metrics,
    result,
    survivingAssertionCounts,
    survivingAssertionTokenUsage,
  );
  applyRecomputedNamedMetrics(
    updatedPrompt.metrics,
    namedMetricsToRecompute,
    survivingNamedMetrics,
  );
  if (derivedMetrics?.length) {
    const remainingCount =
      (
        await tx
          .select({ count: sql<number>`count(*)` })
          .from(evalResultsTable)
          .where(survivorCondition)
          .get()
      )?.count ?? 0;
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
        or(
          and(
            eq(blobReferencesTable.testIdx, result.testIdx),
            eq(blobReferencesTable.promptIdx, result.promptIdx),
          ),
          and(isNull(blobReferencesTable.testIdx), isNull(blobReferencesTable.promptIdx)),
        ),
      ),
    )
    .all();

  if (blobReferences.length === 0) {
    return;
  }

  for (const blobReference of blobReferences) {
    const isEvalLevelReference = blobReference.testIdx === null && blobReference.promptIdx === null;
    const isImportedReference = blobReference.location === 'import';
    if (isEvalLevelReference && !resultMentionsBlobHash(result, blobReference.blobHash)) {
      continue;
    }

    const sameCellResult = isEvalLevelReference
      ? undefined
      : await findSurvivingResultUsingBlobHash(tx, evalId, resultId, blobReference.blobHash, {
          testIdx: blobReference.testIdx ?? result.testIdx,
          promptIdx: blobReference.promptIdx ?? result.promptIdx,
        });
    if (sameCellResult) {
      continue;
    }

    // Imports authorize media for the eval, even when reference recording retained cell
    // coordinates. Runtime extraction records each cell's own provenance; copied result
    // data (including a complete blob envelope) cannot inherit another cell's reference.
    const survivingBlobResult = isImportedReference
      ? await findSurvivingResultUsingBlobHash(tx, evalId, resultId, blobReference.blobHash)
      : undefined;
    if (survivingBlobResult) {
      if (!isEvalLevelReference) {
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
      (await traceUsesBlobHash(tx, evalId, blobReference.blobHash))
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

function subtractResultFromPromptMetrics(
  metrics: PromptMetrics,
  result: typeof evalResultsTable.$inferSelect,
  survivingAssertionCounts?: { pass: number; fail: number },
  survivingAssertionTokenUsage?: TokenUsage,
): void {
  if (result.success) {
    metrics.testPassCount = Math.max(0, subtractTrackedMetric(metrics.testPassCount, 1));
  } else if (result.failureReason === ResultFailureReason.ERROR) {
    metrics.testErrorCount = Math.max(0, subtractTrackedMetric(metrics.testErrorCount, 1));
  } else {
    metrics.testFailCount = Math.max(0, subtractTrackedMetric(metrics.testFailCount, 1));
  }

  const assertionCounts = getAssertionCounts(result);
  if (survivingAssertionCounts) {
    metrics.assertPassCount = survivingAssertionCounts.pass;
    metrics.assertFailCount = survivingAssertionCounts.fail;
  } else if (assertionCounts) {
    metrics.assertPassCount = Math.max(
      0,
      subtractTrackedMetric(metrics.assertPassCount, assertionCounts.pass),
    );
    metrics.assertFailCount = Math.max(
      0,
      subtractTrackedMetric(metrics.assertFailCount, assertionCounts.fail),
    );
  }

  metrics.score = subtractTrackedMetric(metrics.score, result.score);
  metrics.totalLatencyMs = subtractTrackedMetric(metrics.totalLatencyMs, result.latencyMs);
  metrics.cost = subtractTrackedMetric(metrics.cost, result.cost);
  if (metrics.incurredCost !== undefined) {
    metrics.incurredCost = subtractTrackedMetric(
      metrics.incurredCost,
      result.response?.incurredCost ?? (result.response?.cached ? 0 : result.cost),
    );
  }

  for (const [metricName, metricValue] of Object.entries(result.namedScores ?? {})) {
    if (
      isFiniteNumber(metricValue) &&
      hasNamedMetricContribution(result.gradingResult, metricName)
    ) {
      subtractNamedMetric(metrics, {
        metricName,
        metricValue,
        gradingResult: result.gradingResult,
      });
    }
  }

  if (metrics.tokenUsage) {
    const delta: TokenUsage = metrics.tokenUsage.incurredTokenUsage
      ? { incurredTokenUsage: {} }
      : {};
    accumulateResultTokenUsage(delta, result);
    subtractTokenUsage(metrics.tokenUsage, delta);
    if (survivingAssertionTokenUsage) {
      // Rebuild only when every survivor retains its grading usage.
      metrics.tokenUsage.assertions = survivingAssertionTokenUsage.assertions;
      if (metrics.tokenUsage.incurredTokenUsage) {
        metrics.tokenUsage.incurredTokenUsage.assertions =
          survivingAssertionTokenUsage.incurredTokenUsage?.assertions;
      }
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
