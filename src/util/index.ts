import { parse as csvParse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import dedent from 'dedent';
import dotenv from 'dotenv';
import { desc, eq, like, and, sql, not } from 'drizzle-orm';
import deepEqual from 'fast-deep-equal';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import NodeCache from 'node-cache';
import nunjucks from 'nunjucks';
import * as path from 'path';
import cliState from '../cliState';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getDb } from '../database';
import {
  datasetsTable,
  evalsTable,
  evalsToDatasetsTable,
  evalsToPromptsTable,
  evalsToTagsTable,
  promptsTable,
  tagsTable,
  evalResultsTable,
} from '../database/tables';
import { getEnvBool } from '../envars';
import { getDirectory, importModule } from '../esm';
import { getAuthor } from '../globalConfig/accounts';
import { writeCsvToGoogleSheet } from '../googleSheets';
import logger from '../logger';
import Eval, { createEvalId, getSummaryOfLatestEvals } from '../models/eval';
import type EvalResult from '../models/evalResult';
import { generateIdFromPrompt } from '../models/prompt';
import type { Vars } from '../types';
import {
  type EvalWithMetadata,
  type EvaluateResult,
  type EvaluateTable,
  type EvaluateTableOutput,
  type NunjucksFilterMap,
  type PromptWithMetadata,
  type ResultsFile,
  type TestCase,
  type TestCasesWithMetadata,
  type TestCasesWithMetadataPrompt,
  type UnifiedConfig,
  type OutputFile,
  type CompletedPrompt,
  type CsvRow,
  type ResultLightweight,
  isApiProvider,
  isProviderOptions,
  OutputFileExtension,
  type EvaluateSummaryV2,
  ResultFailureReason,
} from '../types';
import invariant from '../util/invariant';
import { getConfigDirectoryPath } from './config/manage';
import { sha256 } from './createHash';
import { convertTestResultsToTableRow, getHeaderForTable } from './exportToFile';
import { isJavascriptFile } from './file';
import { getNunjucksEngine } from './templates';

const DEFAULT_QUERY_LIMIT = 100;

const outputToSimpleString = (output: EvaluateTableOutput) => {
  const passFailText = output.pass
    ? '[PASS]'
    : output.failureReason === ResultFailureReason.ASSERT
      ? '[FAIL]'
      : '[ERROR]';
  const namedScoresText = Object.entries(output.namedScores)
    .map(([name, value]) => `${name}: ${value?.toFixed(2)}`)
    .join(', ');
  const scoreText =
    namedScoresText.length > 0
      ? `(${output.score?.toFixed(2)}, ${namedScoresText})`
      : `(${output.score?.toFixed(2)})`;
  const gradingResultText = output.gradingResult
    ? `${output.pass ? 'Pass' : 'Fail'} Reason: ${output.gradingResult.reason}`
    : '';
  return dedent`
      ${passFailText} ${scoreText}

      ${output.text}

      ${gradingResultText}
    `.trim();
};

export async function writeOutput(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  if (outputPath.match(/^https:\/\/docs\.google\.com\/spreadsheets\//)) {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const rows = table.body.map((row) => {
      const csvRow: CsvRow = {};
      table.head.vars.forEach((varName, index) => {
        csvRow[varName] = row.vars[index];
      });
      table.head.prompts.forEach((prompt, index) => {
        csvRow[prompt.label] = outputToSimpleString(row.outputs[index]);
      });
      return csvRow;
    });
    logger.info(`Writing ${rows.length} rows to Google Sheets...`);
    await writeCsvToGoogleSheet(rows, outputPath);
    return;
  }

  const { data: outputExtension } = OutputFileExtension.safeParse(
    path.extname(outputPath).slice(1).toLowerCase(),
  );
  invariant(
    outputExtension,
    `Unsupported output file format ${outputExtension}. Please use one of: ${OutputFileExtension.options.join(', ')}.`,
  );

  // Ensure the directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (outputExtension === 'csv') {
    // Write headers first
    const headers = getHeaderForTable(evalRecord);

    const headerCsv = stringify([
      [...headers.vars, ...headers.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`)],
    ]);
    fs.writeFileSync(outputPath, headerCsv);

    // Write body rows in batches
    for await (const batchResults of evalRecord.fetchResultsBatched()) {
      // we need split the batch into rows by testIdx
      const tableRows: Record<number, EvalResult[]> = {};
      for (const result of batchResults) {
        if (!(result.testIdx in tableRows)) {
          tableRows[result.testIdx] = [];
        }
        tableRows[result.testIdx].push(result);
      }
      const batchCsv = stringify(
        Object.values(tableRows).map((results) => {
          const row = convertTestResultsToTableRow(results, headers.vars);
          return [...row.vars, ...row.outputs.map(outputToSimpleString)];
        }),
      );
      console.log({ batchCsv });
      fs.appendFileSync(outputPath, batchCsv);
    }
  } else if (outputExtension === 'json') {
    const summary = await evalRecord.toEvaluateSummary();
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          evalId: evalRecord.id,
          results: summary,
          config: evalRecord.config,
          shareableUrl,
        } satisfies OutputFile,
        null,
        2,
      ),
    );
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    const summary = await evalRecord.toEvaluateSummary();
    fs.writeFileSync(
      outputPath,
      yaml.dump({
        evalId: evalRecord.id,
        results: summary,
        config: evalRecord.config,
        shareableUrl,
      } as OutputFile),
    );
  } else if (outputExtension === 'html') {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const summary = await evalRecord.toEvaluateSummary();
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const htmlTable = [
      [
        ...table.head.vars,
        ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      ],
      ...table.body.map((row) => [...row.vars, ...row.outputs.map(outputToSimpleString)]),
    ];
    const htmlOutput = getNunjucksEngine().renderString(template, {
      config: evalRecord.config,
      table: htmlTable,
      results: summary,
    });
    fs.writeFileSync(outputPath, htmlOutput);
  } else if (outputExtension === 'jsonl') {
    for await (const batchResults of evalRecord.fetchResultsBatched()) {
      const text = batchResults.map((result) => JSON.stringify(result)).join('\n');
      fs.appendFileSync(outputPath, text);
    }
  }
}

export async function writeMultipleOutputs(
  outputPaths: string[],
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  await Promise.all(
    outputPaths.map((outputPath) => writeOutput(outputPath, evalRecord, shareableUrl)),
  );
}

export async function readOutput(outputPath: string): Promise<OutputFile> {
  const ext = path.parse(outputPath).ext.slice(1);

  switch (ext) {
    case 'json':
      return JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as OutputFile;
    default:
      throw new Error(`Unsupported output file format: ${ext} currently only supports json`);
  }
}

/**
 * TODO(ian): Remove this
 * @deprecated Use readLatestResults directly instead.
 */
export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}

export async function writeResultsToDatabase(
  results: EvaluateSummaryV2,
  config: Partial<UnifiedConfig>,
  createdAt: Date = new Date(),
): Promise<string> {
  createdAt = createdAt || (results.timestamp ? new Date(results.timestamp) : new Date());
  const evalId = createEvalId(createdAt);
  const db = getDb();

  const promises = [];
  promises.push(
    db
      .insert(evalsTable)
      .values({
        id: evalId,
        createdAt: createdAt.getTime(),
        author: getAuthor(),
        description: config.description,
        config,
        results,
      })
      .onConflictDoNothing()
      .run(),
  );

  logger.debug(`Inserting eval ${evalId}`);

  // Record prompt relation
  invariant(results.table, 'Table is required');

  for (const prompt of results.table.head.prompts) {
    const label = prompt.label || prompt.display || prompt.raw;
    const promptId = generateIdFromPrompt(prompt);

    promises.push(
      db
        .insert(promptsTable)
        .values({
          id: promptId,
          prompt: label,
        })
        .onConflictDoNothing()
        .run(),
    );

    promises.push(
      db
        .insert(evalsToPromptsTable)
        .values({
          evalId,
          promptId,
        })
        .onConflictDoNothing()
        .run(),
    );

    logger.debug(`Inserting prompt ${promptId}`);
  }

  // Record dataset relation
  const datasetId = sha256(JSON.stringify(config.tests || []));
  promises.push(
    db
      .insert(datasetsTable)
      .values({
        id: datasetId,
        tests: config.tests,
      })
      .onConflictDoNothing()
      .run(),
  );

  promises.push(
    db
      .insert(evalsToDatasetsTable)
      .values({
        evalId,
        datasetId,
      })
      .onConflictDoNothing()
      .run(),
  );

  logger.debug(`Inserting dataset ${datasetId}`);

  // Record tags
  if (config.tags) {
    for (const [tagKey, tagValue] of Object.entries(config.tags)) {
      const tagId = sha256(`${tagKey}:${tagValue}`);

      promises.push(
        db
          .insert(tagsTable)
          .values({
            id: tagId,
            name: tagKey,
            value: tagValue,
          })
          .onConflictDoNothing()
          .run(),
      );

      promises.push(
        db
          .insert(evalsToTagsTable)
          .values({
            evalId,
            tagId,
          })
          .onConflictDoNothing()
          .run(),
      );

      logger.debug(`Inserting tag ${tagId}`);
    }
  }

  logger.debug(`Awaiting ${promises.length} promises to database...`);
  await Promise.all(promises);

  return evalId;
}

/**
 *
 * @returns Last n evals in descending order.
 */
export async function listPreviousResults(
  limit: number = DEFAULT_QUERY_LIMIT,
  filterDescription?: string,
  datasetId?: string,
): Promise<ResultLightweight[]> {
  const db = getDb();
  const startTime = performance.now();

  const query = db
    .select({
      evalId: evalsTable.id,
      createdAt: evalsTable.createdAt,
      description: evalsTable.description,
      numTests: sql<number>`json_array_length(${evalsTable.results}->'table'->'body')`,
      datasetId: evalsToDatasetsTable.datasetId,
      isRedteam: sql<boolean>`json_type(${evalsTable.config}, '$.redteam') IS NOT NULL`,
    })
    .from(evalsTable)
    .leftJoin(evalsToDatasetsTable, eq(evalsTable.id, evalsToDatasetsTable.evalId))
    .where(
      and(
        datasetId ? eq(evalsToDatasetsTable.datasetId, datasetId) : undefined,
        filterDescription ? like(evalsTable.description, `%${filterDescription}%`) : undefined,
        not(eq(evalsTable.results, {})),
      ),
    );

  const results = query.orderBy(desc(evalsTable.createdAt)).limit(limit).all();
  const mappedResults = results.map((result) => ({
    evalId: result.evalId,
    createdAt: result.createdAt,
    description: result.description,
    numTests: result.numTests,
    datasetId: result.datasetId,
    isRedteam: result.isRedteam,
  }));

  const endTime = performance.now();
  const executionTime = endTime - startTime;
  const evalResults = await getSummaryOfLatestEvals(undefined, filterDescription, datasetId);
  logger.debug(`listPreviousResults execution time: ${executionTime.toFixed(2)}ms`);
  const combinedResults = [...evalResults, ...mappedResults];
  return combinedResults;
}

/**
 * @deprecated Used only for migration to sqlite
 */
export function listPreviousResultFilenames_fileSystem(): string[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files = fs.readdirSync(directory);
  const resultsFiles = files.filter((file) => file.startsWith('eval-') && file.endsWith('.json'));
  return resultsFiles.sort((a, b) => {
    const statA = fs.statSync(path.join(directory, a));
    const statB = fs.statSync(path.join(directory, b));
    return statA.birthtime.getTime() - statB.birthtime.getTime(); // sort in ascending order
  });
}

const resultsCache: { [fileName: string]: ResultsFile | undefined } = {};

/**
 * @deprecated Used only for migration to sqlite
 */
export function listPreviousResults_fileSystem(): { fileName: string; description?: string }[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  if (!fs.existsSync(directory)) {
    return [];
  }
  const sortedFiles = listPreviousResultFilenames_fileSystem();
  return sortedFiles.map((fileName) => {
    if (!resultsCache[fileName]) {
      try {
        const fileContents = fs.readFileSync(path.join(directory, fileName), 'utf8');
        const data = yaml.load(fileContents) as ResultsFile;
        resultsCache[fileName] = data;
      } catch (error) {
        logger.warn(`Failed to read results from ${fileName}:\n${error}`);
      }
    }
    return {
      fileName,
      description: resultsCache[fileName]?.config.description,
    };
  });
}

export function filenameToDate(filename: string) {
  const dateString = filename.slice('eval-'.length, filename.length - '.json'.length);

  // Replace hyphens with colons where necessary (Windows compatibility).
  const dateParts = dateString.split('T');
  const timePart = dateParts[1].replace(/-/g, ':');
  const formattedDateString = `${dateParts[0]}T${timePart}`;

  const date = new Date(formattedDateString);
  return date;
  /*
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  */
}

export function dateToFilename(date: Date) {
  return `eval-${date.toISOString().replace(/:/g, '-')}.json`;
}

/**
 * @deprecated Used only for migration to sqlite
 */
export function readResult_fileSystem(
  name: string,
): { id: string; result: ResultsFile; createdAt: Date } | undefined {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');
  const resultsPath = path.join(resultsDirectory, name);
  try {
    const result = JSON.parse(
      fs.readFileSync(fs.realpathSync(resultsPath), 'utf-8'),
    ) as ResultsFile;
    const createdAt = filenameToDate(name);
    return {
      id: sha256(JSON.stringify(result.config)),
      result,
      createdAt,
    };
  } catch (err) {
    logger.error(`Failed to read results from ${resultsPath}:\n${err}`);
  }
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
      existingEval.config = newConfig;
    }
    if (newTable) {
      existingEval.setTable(newTable);
    }

    await existingEval.save();

    logger.info(`Updated eval with ID ${id}`);
  } catch (err) {
    logger.error(`Failed to update eval with ID ${id}:\n${err}`);
  }
}

export async function getLatestEval(filterDescription?: string): Promise<ResultsFile | undefined> {
  const eval_ = await Eval.latest();
  return await eval_?.toResultsFile();
}

export async function getPromptsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<PromptWithMetadata[]> {
  // TODO(ian): Make this use a proper database query
  const evals_ = await Eval.getMany(limit);

  const groupedPrompts: { [hash: string]: PromptWithMetadata } = {};

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    const resultWrapper: ResultsFile = await eval_.toResultsFile();
    if (predicate(resultWrapper)) {
      for (const prompt of eval_.getPrompts()) {
        const promptId = sha256(prompt.raw);
        const datasetId = resultWrapper.config.tests
          ? sha256(JSON.stringify(resultWrapper.config.tests))
          : '-';
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
  return getPromptsWithPredicate((result) => {
    const testsJson = JSON.stringify(result.config.tests);
    const hash = sha256(testsJson);
    return hash === testCasesSha256;
  }, limit);
}

export function getPromptsForTestCases(testCases: TestCase[]) {
  const testCasesJson = JSON.stringify(testCases);
  const testCasesSha256 = sha256(testCasesJson);
  return getPromptsForTestCasesHash(testCasesSha256);
}

export async function getTestCasesWithPredicate(
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
      const datasetId = sha256(JSON.stringify(testCases));

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
          testCases,
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

export async function getEvalsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<EvalWithMetadata[]> {
  const db = getDb();
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

export async function getEvals(limit: number = DEFAULT_QUERY_LIMIT) {
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
  const db = getDb();
  await db.transaction(async () => {
    // We need to clean up foreign keys first. We don't have onDelete: 'cascade' set on all these relationships.
    await db.delete(evalsToPromptsTable).where(eq(evalsToPromptsTable.evalId, evalId)).run();
    await db.delete(evalsToDatasetsTable).where(eq(evalsToDatasetsTable.evalId, evalId)).run();
    await db.delete(evalsToTagsTable).where(eq(evalsToTagsTable.evalId, evalId)).run();
    await db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, evalId)).run();

    // Finally, delete the eval record
    const deletedIds = await db.delete(evalsTable).where(eq(evalsTable.id, evalId)).run();
    if (deletedIds.changes === 0) {
      throw new Error(`Eval with ID ${evalId} not found`);
    }
  });
}

/**
 * Deletes all evaluations and related records with foreign keys from the database.
 * @async
 * @returns {Promise<void>}
 */
export async function deleteAllEvals(): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(evalResultsTable).run();
    await tx.delete(evalsToPromptsTable).run();
    await tx.delete(evalsToDatasetsTable).run();
    await tx.delete(evalsToTagsTable).run();
    await tx.delete(evalsTable).run();
  });
}

export async function readFilters(
  filters: Record<string, string>,
  basePath: string = '',
): Promise<NunjucksFilterMap> {
  const ret: NunjucksFilterMap = {};
  for (const [name, filterPath] of Object.entries(filters)) {
    const globPath = path.join(basePath, filterPath);
    const filePaths = globSync(globPath, {
      windowsPathsNoEscape: true,
    });
    for (const filePath of filePaths) {
      const finalPath = path.resolve(filePath);
      ret[name] = await importModule(finalPath);
    }
  }
  return ret;
}

export function printBorder() {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(border);
}

export function setupEnv(envPath: string | undefined) {
  if (envPath) {
    logger.info(`Loading environment variables from ${envPath}`);
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
}

export type StandaloneEval = CompletedPrompt & {
  evalId: string;
  description: string | null;
  datasetId: string | null;
  promptId: string | null;
  isRedteam: boolean;
  createdAt: number;

  pluginFailCount: Record<string, number>;
  pluginPassCount: Record<string, number>;
};

const standaloneEvalCache = new NodeCache({ stdTTL: 60 * 60 * 2 }); // Cache for 2 hours

export async function getStandaloneEvals({
  limit = DEFAULT_QUERY_LIMIT,
  tag,
  description,
}: {
  limit?: number;
  tag?: { key: string; value: string };
  description?: string;
} = {}): Promise<StandaloneEval[]> {
  const cacheKey = `standalone_evals_${limit}_${tag?.key}_${tag?.value}`;
  const cachedResult = standaloneEvalCache.get<StandaloneEval[]>(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  const db = getDb();
  const results = db
    .select({
      evalId: evalsTable.id,
      description: evalsTable.description,
      results: evalsTable.results,
      createdAt: evalsTable.createdAt,
      promptId: evalsToPromptsTable.promptId,
      datasetId: evalsToDatasetsTable.datasetId,
      tagName: tagsTable.name,
      tagValue: tagsTable.value,
      isRedteam: sql`json_extract(evals.config, '$.redteam') IS NOT NULL`.as('isRedteam'),
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

  const standaloneEvals = (
    await Promise.all(
      results.map(async (result) => {
        const {
          description,
          createdAt,
          evalId,
          promptId,
          datasetId,
          // @ts-ignore
          isRedteam,
        } = result;
        const eval_ = await Eval.findById(evalId);
        invariant(eval_, `Eval with ID ${evalId} not found`);
        const table = (await eval_.getTable()) || { body: [] };
        // @ts-ignore
        return eval_.getPrompts().map((col, index) => {
          // Compute some stats
          const pluginCounts = table.body.reduce(
            // @ts-ignore
            (acc, row) => {
              const pluginId = row.test.metadata?.pluginId;
              if (pluginId) {
                const isPass = row.outputs[index].pass;
                acc.pluginPassCount[pluginId] =
                  (acc.pluginPassCount[pluginId] || 0) + (isPass ? 1 : 0);
                acc.pluginFailCount[pluginId] =
                  (acc.pluginFailCount[pluginId] || 0) + (isPass ? 0 : 1);
              }
              return acc;
            },
            { pluginPassCount: {}, pluginFailCount: {} } as {
              pluginPassCount: Record<string, number>;
              pluginFailCount: Record<string, number>;
            },
          );

          return {
            evalId,
            description,
            promptId,
            datasetId,
            createdAt,
            isRedteam: isRedteam as boolean,
            ...pluginCounts,
            ...col,
          };
        });
      }),
    )
  ).flat();

  standaloneEvalCache.set(cacheKey, standaloneEvals);
  return standaloneEvals;
}

export function providerToIdentifier(provider: TestCase['provider']): string | undefined {
  if (isApiProvider(provider)) {
    return provider.id();
  } else if (isProviderOptions(provider)) {
    return provider.id;
  } else if (typeof provider === 'string') {
    return provider;
  }
  return undefined;
}

export function varsMatch(vars1: Vars | undefined, vars2: Vars | undefined) {
  return deepEqual(vars1, vars2);
}

export function resultIsForTestCase(result: EvaluateResult, testCase: TestCase): boolean {
  const providersMatch = testCase.provider
    ? providerToIdentifier(testCase.provider) === providerToIdentifier(result.provider)
    : true;

  return varsMatch(testCase.vars, result.vars) && providersMatch;
}

export function renderVarsInObject<T>(obj: T, vars?: Record<string, string | object>): T {
  // Renders nunjucks template strings with context variables
  if (!vars || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return obj;
  }
  if (typeof obj === 'string') {
    return nunjucks.renderString(obj, vars) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => renderVarsInObject(item, vars)) as unknown as T;
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = renderVarsInObject((obj as Record<string, unknown>)[key], vars);
    }
    return result as T;
  } else if (typeof obj === 'function') {
    const fn = obj as Function;
    return renderVarsInObject(fn({ vars }) as T);
  }
  return obj;
}

/**
 * Parses a file path or glob pattern to extract function names and file extensions.
 * Function names can be specified in the filename like this:
 * prompt.py:myFunction or prompts.js:myFunction.
 * @param basePath - The base path for file resolution.
 * @param promptPath - The path or glob pattern.
 * @returns Parsed details including function name, file extension, and directory status.
 */
export function parsePathOrGlob(
  basePath: string,
  promptPath: string,
): {
  extension?: string;
  functionName?: string;
  isPathPattern: boolean;
  filePath: string;
} {
  if (promptPath.startsWith('file://')) {
    promptPath = promptPath.slice(7);
  }
  const filePath = path.resolve(basePath, promptPath);

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    if (getEnvBool('PROMPTFOO_STRICT_FILES')) {
      throw err;
    }
  }

  let filename = path.relative(basePath, filePath);
  let functionName: string | undefined;

  if (filename.includes(':')) {
    const splits = filename.split(':');
    if (splits[0] && (isJavascriptFile(splits[0]) || splits[0].endsWith('.py'))) {
      [filename, functionName] = splits;
    }
  }

  const isPathPattern = stats?.isDirectory() || /[*?{}\[\]]/.test(filePath); // glob pattern
  const safeFilename = path.relative(
    basePath,
    path.isAbsolute(filename) ? filename : path.resolve(basePath, filename),
  );
  return {
    extension: isPathPattern ? undefined : path.parse(safeFilename).ext,
    filePath: safeFilename.startsWith(basePath) ? safeFilename : path.join(basePath, safeFilename),
    functionName,
    isPathPattern,
  };
}

/**
 * Loads content from an external file if the input is a file path, otherwise
 * returns the input as-is. Supports Nunjucks templating for file paths.
 *
 * @param filePath - The input to process. Can be a file path string starting with "file://",
 * an array of file paths, or any other type of data.
 * @returns The loaded content if the input was a file path, otherwise the original input.
 * For JSON and YAML files, the content is parsed into an object.
 * For other file types, the raw file content is returned as a string.
 *
 * @throws {Error} If the specified file does not exist.
 */
export function maybeLoadFromExternalFile(filePath: string | object | Function | undefined | null) {
  if (Array.isArray(filePath)) {
    return filePath.map((path) => {
      const content: any = maybeLoadFromExternalFile(path);
      return content;
    });
  }

  if (typeof filePath !== 'string') {
    return filePath;
  }
  if (!filePath.startsWith('file://')) {
    return filePath;
  }

  // Render the file path using Nunjucks
  const renderedFilePath = getNunjucksEngine().renderString(filePath, {});

  const finalPath = path.resolve(cliState.basePath || '', renderedFilePath.slice('file://'.length));
  if (!fs.existsSync(finalPath)) {
    throw new Error(`File does not exist: ${finalPath}`);
  }

  const contents = fs.readFileSync(finalPath, 'utf8');
  if (finalPath.endsWith('.json')) {
    return JSON.parse(contents);
  }
  if (finalPath.endsWith('.yaml') || finalPath.endsWith('.yml')) {
    return yaml.load(contents);
  }
  if (finalPath.endsWith('.csv')) {
    const records = csvParse(contents, { columns: true });
    // If single column, return array of values
    if (records.length > 0 && Object.keys(records[0]).length === 1) {
      return records.map((record: Record<string, string>) => Object.values(record)[0]);
    }
    return records;
  }
  return contents;
}

export function isRunningUnderNpx(): boolean {
  return Boolean(
    process.env.npm_execpath?.includes('npx') ||
      process.execPath.includes('npx') ||
      process.env.npm_lifecycle_script?.includes('npx'),
  );
}
