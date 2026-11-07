import { and, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import { DEFAULT_QUERY_LIMIT } from '../constants';
import { deleteTraceRecordsForEvals } from '../database/evalDeletion';
import { getDb } from '../database/index';
import {
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
import { getStripFlags } from '../models/evalResult';
import { generateIdFromPrompt } from '../models/prompt';
import {
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

    await existingEval.save();

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

async function readTestCases(limit: number): Promise<TestCasesWithMetadata[]> {
  const evals_ = await Eval.getMany(limit);

  const groupedTestCases: { [hash: string]: TestCasesWithMetadata } = {};

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    // Same config projection as toResultsFile, without loading result rows.
    const config = sanitizeConfigForOutput(eval_.config, getStripFlags(eval_.config.env));
    const testCases = config.tests;
    if (testCases) {
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
      } else {
        groupedTestCases[datasetId] = {
          id: datasetId,
          count: 1,
          testCases: storableTestCases,
          recentEvalDate: new Date(createdAt),
          recentEvalId: evalId,
          prompts: [],
        };
      }
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
    }
  }

  return Object.values(groupedTestCases);
}

export function getPrompts(limit: number = DEFAULT_QUERY_LIMIT) {
  return getPromptsWithPredicate(() => true, limit);
}

export async function getTestCases(limit: number = DEFAULT_QUERY_LIMIT) {
  return readTestCases(limit);
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
      prompts: evalsTable.prompts,
      config: evalsTable.config,
      createdAt: evalsTable.createdAt,
      datasetId: sql<string | null>`(
        SELECT ${evalsToDatasetsTable.datasetId} FROM ${evalsToDatasetsTable}
        WHERE ${evalsToDatasetsTable.evalId} = ${evalsTable.id} LIMIT 1
      )`,
      isRedteam: evalsTable.isRedteam,
    })
    .from(evalsTable)
    .where(
      and(
        tag
          ? exists(
              db
                .select({ evalId: evalsToTagsTable.evalId })
                .from(evalsToTagsTable)
                .innerJoin(tagsTable, eq(evalsToTagsTable.tagId, tagsTable.id))
                .where(
                  and(
                    eq(evalsToTagsTable.evalId, evalsTable.id),
                    eq(tagsTable.name, tag.key),
                    eq(tagsTable.value, tag.value),
                  ),
                ),
            )
          : undefined,
        description ? eq(evalsTable.description, description) : undefined,
      ),
    )
    .orderBy(desc(evalsTable.createdAt))
    .limit(limit)
    .all();

  const legacyResults = new Map(
    results.flatMap((result) =>
      result.results && typeof result.results === 'object' && 'table' in result.results
        ? [[result.evalId, result.results as EvaluateSummaryV2] as const]
        : [],
    ),
  );
  type PluginRow = { pluginId?: string; outputs: (boolean | undefined)[] };
  const pluginRows = new Map<string, Map<number, PluginRow>>();
  const promptIds = new Map<string, Set<string>>();

  // Fetch only history's inputs in batches, rather than reconstructing complete result files
  // (including responses and traces) separately for each evaluation.
  const batchSize = 500;
  for (let offset = 0; offset < results.length; offset += batchSize) {
    const batch = results.slice(offset, offset + batchSize);
    const links = await db
      .select({ evalId: evalsToPromptsTable.evalId, promptId: evalsToPromptsTable.promptId })
      .from(evalsToPromptsTable)
      .where(
        inArray(
          evalsToPromptsTable.evalId,
          batch.map((result) => result.evalId),
        ),
      )
      .all();
    for (const link of links) {
      let ids = promptIds.get(link.evalId);
      if (!ids) {
        ids = new Set();
        promptIds.set(link.evalId, ids);
      }
      ids.add(link.promptId);
    }

    const normalizedIds = batch
      .filter(
        (result) =>
          !legacyResults.has(result.evalId) &&
          !getStripFlags(result.config.env).shouldStripMetadata,
      )
      .map((result) => result.evalId);
    if (normalizedIds.length === 0) {
      continue;
    }
    const rows = await db
      .select({
        evalId: evalResultsTable.evalId,
        testIdx: evalResultsTable.testIdx,
        promptIdx: evalResultsTable.promptIdx,
        pluginId: sql<
          string | null
        >`json_extract(${evalResultsTable.testCase}, ${'$.metadata.pluginId'})`,
        success: evalResultsTable.success,
      })
      .from(evalResultsTable)
      .where(inArray(evalResultsTable.evalId, normalizedIds))
      .all();
    for (const row of rows) {
      let evalRows = pluginRows.get(row.evalId);
      if (!evalRows) {
        evalRows = new Map();
        pluginRows.set(row.evalId, evalRows);
      }
      let testRow = evalRows.get(row.testIdx);
      if (!testRow) {
        testRow = { pluginId: row.pluginId ?? undefined, outputs: [] };
        evalRows.set(row.testIdx, testRow);
      }
      // Match table reconstruction: the first result supplies test metadata, while the
      // last result for a repeated cell supplies its final verdict.
      testRow.outputs[row.promptIdx] = row.success;
    }
  }

  const standaloneEvals = results.flatMap((result) => {
    const { description, createdAt, evalId, datasetId, isRedteam } = result;
    const legacyResult = legacyResults.get(evalId);
    const prompts = legacyResult
      ? (legacyResult.table?.head.prompts ?? [])
      : (result.prompts ?? []);
    const rows: PluginRow[] = legacyResult
      ? (legacyResult.table?.body ?? []).map((row) => ({
          pluginId: row.test.metadata?.pluginId,
          outputs: row.outputs.map((output) => output?.pass),
        }))
      : [...(pluginRows.get(evalId)?.values() ?? [])];
    const linkedIds = promptIds.get(evalId);

    return prompts.map((col, index) => {
      const counts = new Map<string, { pass: number; fail: number }>();
      for (const row of rows) {
        const isPass = row.outputs[index];
        if (row.pluginId && isPass !== undefined) {
          const count = counts.get(row.pluginId) ?? { pass: 0, fail: 0 };
          count.pass += isPass ? 1 : 0;
          count.fail += isPass ? 0 : 1;
          counts.set(row.pluginId, count);
        }
      }
      const generatedId = generateIdFromPrompt(col);
      const promptId =
        col.id && linkedIds?.has(col.id)
          ? col.id
          : linkedIds?.has(generatedId)
            ? generatedId
            : null;

      return {
        evalId,
        description,
        promptId,
        datasetId,
        createdAt,
        isRedteam,
        pluginPassCount: Object.fromEntries([...counts].map(([id, count]) => [id, count.pass])),
        pluginFailCount: Object.fromEntries([...counts].map(([id, count]) => [id, count.fail])),
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
