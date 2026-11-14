import { and, desc, eq, inArray } from 'drizzle-orm';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { deleteTraceRecordsForEvals } from '../database/evalDeletion';
import { getDb } from '../database/index';
import {
  evalResultsTable,
  evalsTable,
  evalsToDatasetsTable,
  evalsToPromptsTable,
  evalsToTagsTable,
  spansTable,
  tagsTable,
  tracesTable,
} from '../database/tables';
import { getAuthor } from '../globalConfig/accounts';
import logger from '../logger';
import Eval, { createEvalId, insertEvalDatasetAndTags, insertEvalPrompts } from '../models/eval';
import { notifyEvaluationChanged, notifyEvaluationsDeleted } from '../models/evalMutation';
import { getStripFlags } from '../models/evalResult';
import {
  type EvaluateSummaryV2,
  type EvaluateTable,
  type PromptWithMetadata,
  type ResultsFile,
  type TestCasesWithMetadata,
  type TestCasesWithMetadataPrompt,
  type UnifiedConfig,
} from '../types/index';
import invariant from '../util/invariant';
import { sha256 } from './createHash';
import {
  restoreAzureBlobSasTokens,
  sanitizeConfigForOutput,
  sanitizeTracingConfigForPersistence,
} from './sanitizer';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
  setCachedStandaloneEvals,
} from './standaloneEvalCache';

import type { StandaloneEval } from '../types/standaloneEval';

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

    await insertEvalPrompts(tx, evalId, results.table.head.prompts);

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

    await insertEvalDatasetAndTags(tx, evalId, { id: datasetId, tests: testsForStorage }, config);
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

    await existingEval.save();

    logger.info(`Updated eval with ID ${id}`);
  } catch (err) {
    logger.error(`Failed to update eval with ID ${id}:\n${err}`);
    throw err;
  }
}

async function getPromptsWithPredicate(
  predicate: (datasetId: string) => boolean,
  limit: number,
): Promise<PromptWithMetadata[]> {
  // TODO(ian): Make this use a proper database query
  const evals_ = await Eval.getMany(limit);

  const groupedPrompts: { [hash: string]: PromptWithMetadata } = {};

  for (const eval_ of evals_) {
    const timestamp = eval_.createdAt;
    const createdAt = new Date(timestamp).toISOString();
    const datasetId = sha256(JSON.stringify(eval_.config.tests || []));
    if (predicate(datasetId)) {
      for (const prompt of eval_.getPrompts()) {
        const promptId = sha256(prompt.raw);
        const group = (groupedPrompts[promptId] ??= {
          count: 0,
          id: promptId,
          prompt,
          recentEvalDate: new Date(createdAt),
          recentEvalId: eval_.id,
          evals: [],
        });
        if (timestamp > group.recentEvalDate.getTime()) {
          group.recentEvalDate = new Date(createdAt);
        }
        group.count = group.evals.push({ id: eval_.id, datasetId, metrics: prompt.metrics });
      }
    }
  }

  return Object.values(groupedPrompts);
}

export function getPromptsForTestCasesHash(
  testCasesSha256: string,
  limit: number = DEFAULT_QUERY_LIMIT,
) {
  return getPromptsWithPredicate((datasetId) => datasetId === testCasesSha256, limit);
}

export async function getTestCases(limit = DEFAULT_QUERY_LIMIT): Promise<TestCasesWithMetadata[]> {
  const evals = await Eval.getMany(limit);
  const groupedTestCases: Record<
    string,
    Omit<TestCasesWithMetadata, 'prompts'> & {
      prompts: Record<string, TestCasesWithMetadataPrompt>;
    }
  > = {};

  for (const evl of evals) {
    const { id: evalId, config, createdAt } = evl;
    const date = new Date(createdAt).toISOString();
    // Same config projection as toResultsFile, without loading result rows.
    const { tests: testCases } = sanitizeConfigForOutput(config, getStripFlags(config.env));
    if (!testCases) {
      continue;
    }
    if (typeof testCases !== 'string' && !Array.isArray(testCases)) {
      logger.warn('Skipping TestGeneratorConfig object in database storage');
      continue;
    }

    // Hash the stored tests so output stripping does not change dataset identity.
    const id = sha256(JSON.stringify(config.tests || []));
    const dataset = (groupedTestCases[id] ??= {
      id,
      count: 0,
      testCases: testCases as TestCasesWithMetadata['testCases'],
      recentEvalDate: new Date(date),
      recentEvalId: evalId,
      prompts: {},
    });
    dataset.count++;
    if (createdAt > dataset.recentEvalDate.getTime()) {
      dataset.recentEvalDate = new Date(createdAt);
    }

    for (const prompt of evl.getPrompts()) {
      const promptId = sha256(prompt.raw);
      dataset.prompts[promptId] ??= { id: promptId, prompt, evalId };
    }
  }

  return Object.values(groupedTestCases).map(({ prompts, ...dataset }) => ({
    ...dataset,
    prompts: Object.values(prompts),
  }));
}

export function getPrompts(limit: number = DEFAULT_QUERY_LIMIT) {
  return getPromptsWithPredicate(() => true, limit);
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

export async function hasRecentEvalWithIdPrefix(prefix: string): Promise<boolean> {
  const db = await getDb();
  const recentEvals = await db
    .select({ id: evalsTable.id })
    .from(evalsTable)
    .orderBy(desc(evalsTable.createdAt))
    .limit(DEFAULT_QUERY_LIMIT)
    .all();
  return recentEvals.some(({ id }) => id.startsWith(prefix));
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
    return [evalId, { eval_, table }] as const;
  });

  const evalMap = new Map(await Promise.all(evalPromises));

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
            const isPass = row.outputs[index].pass;
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
