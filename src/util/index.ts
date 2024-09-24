import { createHash } from 'crypto';
import { stringify } from 'csv-stringify/sync';
import dedent from 'dedent';
import dotenv from 'dotenv';
import { desc, eq, like, and, sql } from 'drizzle-orm';
import deepEqual from 'fast-deep-equal';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import NodeCache from 'node-cache';
import nunjucks from 'nunjucks';
import * as path from 'path';
import invariant from 'tiny-invariant';
import cliState from '../cliState';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getDbSignalPath, getDb } from '../database';
import {
  datasets,
  evals,
  evalsToDatasets,
  evalsToPrompts,
  evalsToTags,
  prompts,
  tags,
} from '../database/tables';
import { getEnvBool, getEnvInt } from '../envars';
import { getDirectory, importModule } from '../esm';
import { getAuthor } from '../globalConfig/accounts';
import { writeCsvToGoogleSheet } from '../googleSheets';
import logger from '../logger';
import { runDbMigrations } from '../migrate';
import {
  type EvalWithMetadata,
  type EvaluateResult,
  type EvaluateSummary,
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
} from '../types';
import { getConfigDirectoryPath } from './config';
import { getNunjucksEngine } from './templates';

const DEFAULT_QUERY_LIMIT = 100;

/**
 * Checks if a file is a JavaScript or TypeScript file based on its extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a JavaScript or TypeScript extension, false otherwise.
 */
export function isJavascriptFile(filePath: string): boolean {
  return /\.(js|cjs|mjs|ts|cts|mts)$/.test(filePath);
}

const outputToSimpleString = (output: EvaluateTableOutput) => {
  const passFailText = output.pass ? '[PASS]' : '[FAIL]';
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
  evalId: string | null,
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
) {
  if (outputPath.match(/^https:\/\/docs\.google\.com\/spreadsheets\//)) {
    const rows = results.table.body.map((row) => {
      const csvRow: CsvRow = {};
      results.table.head.vars.forEach((varName, index) => {
        csvRow[varName] = row.vars[index];
      });
      results.table.head.prompts.forEach((prompt, index) => {
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
    const csvOutput = stringify([
      [
        ...results.table.head.vars,
        ...results.table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      ],
      ...results.table.body.map((row) => [...row.vars, ...row.outputs.map(outputToSimpleString)]),
    ]);
    fs.writeFileSync(outputPath, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(
      outputPath,
      JSON.stringify({ evalId, results, config, shareableUrl } satisfies OutputFile, null, 2),
    );
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    fs.writeFileSync(outputPath, yaml.dump({ results, config, shareableUrl } as OutputFile));
  } else if (outputExtension === 'html') {
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const table = [
      [
        ...results.table.head.vars,
        ...results.table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      ],
      ...results.table.body.map((row) => [...row.vars, ...row.outputs.map(outputToSimpleString)]),
    ];
    const htmlOutput = getNunjucksEngine().renderString(template, {
      config,
      table,
      results: results.results,
    });
    fs.writeFileSync(outputPath, htmlOutput);
  }
}

export async function writeMultipleOutputs(
  outputPaths: string[],
  evalId: string | null,
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
) {
  await Promise.all(
    outputPaths.map((outputPath) => writeOutput(outputPath, evalId, results, config, shareableUrl)),
  );
}

export function sha256(str: string) {
  return createHash('sha256').update(str).digest('hex');
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
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  createdAt?: Date,
): Promise<string> {
  createdAt = createdAt || (results.timestamp ? new Date(results.timestamp) : new Date());
  const evalId = `eval-${createdAt.toISOString().slice(0, 19)}`;
  const db = getDb();

  const promises = [];
  promises.push(
    db
      .insert(evals)
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
  for (const prompt of results.table.head.prompts) {
    const label = prompt.label || prompt.display || prompt.raw;
    const promptId = sha256(label);

    promises.push(
      db
        .insert(prompts)
        .values({
          id: promptId,
          prompt: label,
        })
        .onConflictDoNothing()
        .run(),
    );

    promises.push(
      db
        .insert(evalsToPrompts)
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
      .insert(datasets)
      .values({
        id: datasetId,
        tests: config.tests,
      })
      .onConflictDoNothing()
      .run(),
  );

  promises.push(
    db
      .insert(evalsToDatasets)
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
          .insert(tags)
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
          .insert(evalsToTags)
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

  // "touch" db signal path
  const filePath = getDbSignalPath();
  try {
    const now = new Date();
    fs.utimesSync(filePath, now, now);
  } catch {
    fs.closeSync(fs.openSync(filePath, 'w'));
  }

  return evalId;
}

/**
 *
 * @returns Last n evals in descending order.
 */
export function listPreviousResults(
  limit: number = DEFAULT_QUERY_LIMIT,
  filterDescription?: string,
  datasetId?: string,
): ResultLightweight[] {
  const db = getDb();
  const startTime = performance.now();

  const query = db
    .select({
      evalId: evals.id,
      createdAt: evals.createdAt,
      description: evals.description,
      numTests: sql<number>`json_array_length(${evals.results}->'table'->'body')`,
      datasetId: evalsToDatasets.datasetId,
    })
    .from(evals)
    .leftJoin(evalsToDatasets, eq(evals.id, evalsToDatasets.evalId))
    .where(
      and(
        datasetId ? eq(evalsToDatasets.datasetId, datasetId) : undefined,
        filterDescription ? like(evals.description, `%${filterDescription}%`) : undefined,
      ),
    );

  const results = query.orderBy(desc(evals.createdAt)).limit(limit).all();
  const mappedResults = results.map((result) => ({
    evalId: result.evalId,
    createdAt: result.createdAt,
    description: result.description,
    numTests: result.numTests,
    datasetId: result.datasetId,
  }));

  const endTime = performance.now();
  const executionTime = endTime - startTime;
  logger.debug(`listPreviousResults execution time: ${executionTime.toFixed(2)}ms`);

  return mappedResults;
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

let attemptedMigration = false;

export async function migrateResultsFromFileSystemToDatabase() {
  if (attemptedMigration) {
    // TODO(ian): Record this bit in the database.
    return;
  }

  // First run db migrations
  logger.debug('Running db migrations...');
  await runDbMigrations();

  const fileNames = listPreviousResultFilenames_fileSystem();
  if (fileNames.length === 0) {
    return;
  }

  logger.info(`🔁 Migrating ${fileNames.length} flat files to local database.`);
  logger.info('This is a one-time operation and may take a minute...');
  attemptedMigration = true;

  const outputDir = path.join(getConfigDirectoryPath(true /* createIfNotExists */), 'output');
  const backupDir = `${outputDir}-backup-${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')}`;
  try {
    fs.cpSync(outputDir, backupDir, { recursive: true });
    logger.info(`Backup of output directory created at ${backupDir}`);
  } catch (backupError) {
    logger.error(`Failed to create backup of output directory: ${backupError}`);
    return;
  }

  logger.info('Moving files into database...');
  const migrationPromises = fileNames.map(async (fileName) => {
    const fileData = readResult_fileSystem(fileName);
    if (fileData) {
      await writeResultsToDatabase(
        fileData.result.results,
        fileData.result.config,
        filenameToDate(fileName),
      );
      logger.debug(`Migrated ${fileName} to database.`);
      try {
        fs.unlinkSync(path.join(outputDir, fileName));
      } catch (err) {
        logger.warn(`Failed to delete ${fileName} after migration: ${err}`);
      }
    } else {
      logger.warn(`Failed to migrate result ${fileName} due to read error.`);
    }
  });
  await Promise.all(migrationPromises);
  try {
    fs.unlinkSync(getLatestResultsPath());
  } catch (err) {
    logger.warn(`Failed to delete latest.json: ${err}`);
  }
  logger.info('Migration complete. Please restart your web server if it is running.');
}

const RESULT_HISTORY_LENGTH = getEnvInt('RESULT_HISTORY_LENGTH', DEFAULT_QUERY_LIMIT);

export function cleanupOldFileResults(remaining = RESULT_HISTORY_LENGTH) {
  const sortedFilenames = listPreviousResultFilenames_fileSystem();
  for (let i = 0; i < sortedFilenames.length - remaining; i++) {
    fs.unlinkSync(path.join(getConfigDirectoryPath(), 'output', sortedFilenames[i]));
  }
}

export async function readResult(
  id: string,
): Promise<{ id: string; result: ResultsFile; createdAt: Date } | undefined> {
  const db = getDb();
  try {
    const evalResult = await db
      .select({
        id: evals.id,
        createdAt: evals.createdAt,
        author: evals.author,
        results: evals.results,
        config: evals.config,
        datasetId: evalsToDatasets.datasetId,
      })
      .from(evals)
      .leftJoin(evalsToDatasets, eq(evals.id, evalsToDatasets.evalId))
      .where(eq(evals.id, id))
      .execute();

    if (evalResult.length === 0) {
      return undefined;
    }

    const { id: resultId, createdAt, results, config, author, datasetId } = evalResult[0];
    const result: ResultsFile = {
      version: 3,
      createdAt: new Date(createdAt).toISOString().slice(0, 10),
      author,
      results,
      config,
      datasetId,
    };
    return {
      id: resultId,
      result,
      createdAt: new Date(createdAt),
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
  const db = getDb();
  try {
    // Fetch the existing eval data from the database
    const existingEval = await db
      .select({
        config: evals.config,
        results: evals.results,
      })
      .from(evals)
      .where(eq(evals.id, id))
      .limit(1)
      .all();

    if (existingEval.length === 0) {
      logger.error(`Eval with ID ${id} not found.`);
      return;
    }

    const evalData = existingEval[0];
    if (newConfig) {
      evalData.config = newConfig;
    }
    if (newTable) {
      evalData.results.table = newTable;
    }

    await db
      .update(evals)
      .set({
        description: evalData.config.description,
        config: evalData.config,
        results: evalData.results,
      })
      .where(eq(evals.id, id))
      .run();

    logger.info(`Updated eval with ID ${id}`);
  } catch (err) {
    logger.error(`Failed to update eval with ID ${id}:\n${err}`);
  }
}

export async function getLatestEval(filterDescription?: string): Promise<ResultsFile | undefined> {
  const db = getDb();
  let latestResults = await db
    .select({
      id: evals.id,
      createdAt: evals.createdAt,
      author: evals.author,
      description: evals.description,
      results: evals.results,
      config: evals.config,
    })
    .from(evals)
    .orderBy(desc(evals.createdAt))
    .limit(1);

  if (filterDescription) {
    const regex = new RegExp(filterDescription, 'i');
    latestResults = latestResults.filter((result) => regex.test(result.description || ''));
  }

  if (!latestResults.length) {
    return undefined;
  }

  const latestResult = latestResults[0];
  return {
    version: 3,
    createdAt: new Date(latestResult.createdAt).toISOString(),
    author: latestResult.author,
    results: latestResult.results,
    config: latestResult.config,
  };
}

export async function getPromptsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<PromptWithMetadata[]> {
  // TODO(ian): Make this use a proper database query
  const db = getDb();
  const evals_ = await db
    .select({
      id: evals.id,
      createdAt: evals.createdAt,
      author: evals.author,
      results: evals.results,
      config: evals.config,
    })
    .from(evals)
    .limit(limit)
    .all();

  const groupedPrompts: { [hash: string]: PromptWithMetadata } = {};

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    const resultWrapper: ResultsFile = {
      version: 3,
      createdAt,
      author: eval_.author,
      results: eval_.results,
      config: eval_.config,
    };
    if (predicate(resultWrapper)) {
      for (const prompt of resultWrapper.results.table.head.prompts) {
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
  const db = getDb();
  const evals_ = await db
    .select({
      id: evals.id,
      createdAt: evals.createdAt,
      author: evals.author,
      results: evals.results,
      config: evals.config,
    })
    .from(evals)
    .limit(limit)
    .all();

  const groupedTestCases: { [hash: string]: TestCasesWithMetadata } = {};

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    const resultWrapper: ResultsFile = {
      version: 3,
      createdAt,
      author: eval_.author,
      results: eval_.results,
      config: eval_.config,
    };
    const testCases = resultWrapper.config.tests;
    if (testCases && predicate(resultWrapper)) {
      const evalId = eval_.id;
      const datasetId = sha256(JSON.stringify(testCases));
      if (datasetId in groupedTestCases) {
        groupedTestCases[datasetId].recentEvalDate = new Date(
          Math.max(groupedTestCases[datasetId].recentEvalDate.getTime(), eval_.createdAt),
        );
        groupedTestCases[datasetId].count += 1;
        const newPrompts = resultWrapper.results.table.head.prompts.map((prompt) => ({
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
        const newPrompts = resultWrapper.results.table.head.prompts.map((prompt) => ({
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
      id: evals.id,
      createdAt: evals.createdAt,
      author: evals.author,
      results: evals.results,
      config: evals.config,
      description: evals.description,
    })
    .from(evals)
    .orderBy(desc(evals.createdAt))
    .limit(limit)
    .all();

  const ret: EvalWithMetadata[] = [];

  for (const eval_ of evals_) {
    const createdAt = new Date(eval_.createdAt).toISOString();
    const resultWrapper: ResultsFile = {
      version: 3,
      createdAt,
      author: eval_.author,
      results: eval_.results,
      config: eval_.config,
    };
    if (predicate(resultWrapper)) {
      const evalId = eval_.id;
      ret.push({
        id: evalId,
        date: new Date(eval_.createdAt),
        config: eval_.config,
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
    await db.delete(evalsToPrompts).where(eq(evalsToPrompts.evalId, evalId)).run();
    await db.delete(evalsToDatasets).where(eq(evalsToDatasets.evalId, evalId)).run();

    // Finally, delete the eval record
    const deletedIds = await db.delete(evals).where(eq(evals.id, evalId)).run();
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
    await tx.delete(evalsToPrompts).run();
    await tx.delete(evalsToDatasets).run();
    await tx.delete(evalsToTags).run();
    await tx.delete(evals).run();
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

export function getStandaloneEvals({
  limit = DEFAULT_QUERY_LIMIT,
  tag,
}: {
  limit?: number;
  tag?: { key: string; value: string };
} = {}): StandaloneEval[] {
  const cacheKey = `standalone_evals_${limit}_${tag?.key}_${tag?.value}`;
  const cachedResult = standaloneEvalCache.get<StandaloneEval[]>(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  const db = getDb();
  const results = db
    .select({
      evalId: evals.id,
      description: evals.description,
      results: evals.results,
      createdAt: evals.createdAt,
      promptId: evalsToPrompts.promptId,
      datasetId: evalsToDatasets.datasetId,
      tagName: tags.name,
      tagValue: tags.value,
      isRedteam: sql`json_extract(evals.config, '$.redteam') IS NOT NULL`.as('isRedteam'),
    })
    .from(evals)
    .leftJoin(evalsToPrompts, eq(evals.id, evalsToPrompts.evalId))
    .leftJoin(evalsToDatasets, eq(evals.id, evalsToDatasets.evalId))
    .leftJoin(evalsToTags, eq(evals.id, evalsToTags.evalId))
    .leftJoin(tags, eq(evalsToTags.tagId, tags.id))
    .where(tag ? and(eq(tags.name, tag.key), eq(tags.value, tag.value)) : undefined)
    .orderBy(desc(evals.createdAt))
    .limit(limit)
    .all();

  const standaloneEvals = results.flatMap((result) => {
    const {
      description,
      createdAt,
      evalId,
      promptId,
      datasetId,
      results: { table },
      isRedteam,
    } = result;
    return table.head.prompts.map((col, index) => {
      // Compute some stats
      const pluginCounts = table.body.reduce(
        (acc, row) => {
          const pluginId = row.test.metadata?.pluginId;
          if (pluginId) {
            const isPass = row.outputs[index].pass;
            acc.pluginPassCount[pluginId] = (acc.pluginPassCount[pluginId] || 0) + (isPass ? 1 : 0);
            acc.pluginFailCount[pluginId] = (acc.pluginFailCount[pluginId] || 0) + (isPass ? 0 : 1);
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
  });

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

export function varsMatch(
  vars1: Record<string, string | string[] | object> | undefined,
  vars2: Record<string, string | string[] | object> | undefined,
) {
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
  return contents;
}
