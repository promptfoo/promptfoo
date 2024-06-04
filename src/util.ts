import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

import dotenv from 'dotenv';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import invariant from 'tiny-invariant';
import nunjucks from 'nunjucks';
import yaml from 'js-yaml';
import deepEqual from 'fast-deep-equal';
import { stringify } from 'csv-stringify/sync';
import { globSync } from 'glob';
import { desc, eq } from 'drizzle-orm';

import cliState from './cliState';
import logger from './logger';
import { getDirectory, importModule } from './esm';
import { readTests } from './testCases';
import {
  datasets,
  getDb,
  evals,
  evalsToDatasets,
  evalsToPrompts,
  prompts,
  getDbSignalPath,
} from './database';
import { runDbMigrations } from './migrate';
import { runPython } from './python/wrapper';

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
  type ProviderOptions,
  type Prompt,
  type CompletedPrompt,
  type CsvRow,
  isApiProvider,
  isProviderOptions,
} from './types';
import { writeCsvToGoogleSheet } from './googleSheets';

const DEFAULT_QUERY_LIMIT = 100;

let globalConfigCache: any = null;

export function resetGlobalConfig(): void {
  globalConfigCache = null;
}

export function readGlobalConfig(): any {
  if (!globalConfigCache) {
    const configDir = getConfigDirectoryPath();
    const configFilePath = path.join(configDir, 'promptfoo.yaml');

    if (fs.existsSync(configFilePath)) {
      globalConfigCache = yaml.load(fs.readFileSync(configFilePath, 'utf-8'));
    } else {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      globalConfigCache = { hasRun: false };
      fs.writeFileSync(configFilePath, yaml.dump(globalConfigCache));
    }
  }

  return globalConfigCache;
}

export function maybeRecordFirstRun(): boolean {
  // Return true if first run
  try {
    const config = readGlobalConfig();
    if (!config.hasRun) {
      config.hasRun = true;
      fs.writeFileSync(
        path.join(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.yaml'),
        yaml.dump(config),
      );
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

export async function maybeReadConfig(configPath: string): Promise<UnifiedConfig | undefined> {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return readConfig(configPath);
}

export async function dereferenceConfig(rawConfig: UnifiedConfig): Promise<UnifiedConfig> {
  if (process.env.PROMPTFOO_DISABLE_REF_PARSER) {
    return rawConfig;
  }

  // Track and delete tools[i].function for each tool, preserving the rest of the properties
  // https://github.com/promptfoo/promptfoo/issues/364

  // Remove parameters from functions and tools to prevent dereferencing
  const extractFunctionParameters = (functions: { parameters?: object }[]) => {
    return functions.map((func) => {
      const { parameters } = func;
      delete func.parameters;
      return { parameters };
    });
  };

  const extractToolParameters = (tools: { function?: { parameters?: object } }[]) => {
    return tools.map((tool) => {
      const { parameters } = tool.function || {};
      if (tool.function?.parameters) {
        delete tool.function.parameters;
      }
      return { parameters };
    });
  };

  // Restore parameters to functions and tools after dereferencing
  const restoreFunctionParameters = (
    functions: { parameters?: object }[],
    parametersList: { parameters?: object }[],
  ) => {
    functions.forEach((func, index) => {
      if (parametersList[index]?.parameters) {
        func.parameters = parametersList[index].parameters;
      }
    });
  };

  const restoreToolParameters = (
    tools: { function?: { parameters?: object } }[],
    parametersList: { parameters?: object }[],
  ) => {
    tools.forEach((tool, index) => {
      if (parametersList[index]?.parameters) {
        tool.function = tool.function || {};
        tool.function.parameters = parametersList[index].parameters;
      }
    });
  };

  let functionsParametersList: { parameters?: object }[][] = [];
  let toolsParametersList: { parameters?: object }[][] = [];

  if (Array.isArray(rawConfig.providers)) {
    rawConfig.providers.forEach((provider, providerIndex) => {
      if (typeof provider === 'string') return;
      if (typeof provider === 'function') return;
      if (!provider.config) {
        // Handle when provider is a map
        provider = Object.values(provider)[0] as ProviderOptions;
      }

      if (provider.config?.functions) {
        functionsParametersList[providerIndex] = extractFunctionParameters(
          provider.config.functions,
        );
      }

      if (provider.config?.tools) {
        toolsParametersList[providerIndex] = extractToolParameters(provider.config.tools);
      }
    });
  }

  // Dereference JSON
  const config = (await $RefParser.dereference(rawConfig)) as unknown as UnifiedConfig;

  // Restore functions and tools parameters
  if (Array.isArray(config.providers)) {
    config.providers.forEach((provider, index) => {
      if (typeof provider === 'string') return;
      if (typeof provider === 'function') return;
      if (!provider.config) {
        // Handle when provider is a map
        provider = Object.values(provider)[0] as ProviderOptions;
      }

      if (functionsParametersList[index]) {
        provider.config.functions = provider.config.functions || [];
        restoreFunctionParameters(provider.config.functions, functionsParametersList[index]);
      }

      if (toolsParametersList[index]) {
        provider.config.tools = provider.config.tools || [];
        restoreToolParameters(provider.config.tools, toolsParametersList[index]);
      }
    });
  }
  return config;
}

export async function readConfig(configPath: string): Promise<UnifiedConfig> {
  const ext = path.parse(configPath).ext;
  switch (ext) {
    case '.json':
    case '.yaml':
    case '.yml':
      let rawConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as UnifiedConfig;
      return dereferenceConfig(rawConfig);
    case '.js':
    case '.cjs':
    case '.mjs':
      return (await importModule(configPath)) as UnifiedConfig;
    default:
      throw new Error(`Unsupported configuration file format: ${ext}`);
  }
}

/**
 * Reads multiple configuration files and combines them into a single UnifiedConfig.
 *
 * @param {string[]} configPaths - An array of paths to configuration files. Supports glob patterns.
 * @returns {Promise<UnifiedConfig>} A promise that resolves to a unified configuration object.
 */
export async function readConfigs(configPaths: string[]): Promise<UnifiedConfig> {
  const configs: UnifiedConfig[] = [];
  for (const configPath of configPaths) {
    const globPaths = globSync(configPath, {
      windowsPathsNoEscape: true,
    });
    if (globPaths.length === 0) {
      throw new Error(`No configuration file found at ${configPath}`);
    }
    for (const globPath of globPaths) {
      const config = await readConfig(globPath);
      configs.push(config);
    }
  }

  const providers: UnifiedConfig['providers'] = [];
  const seenProviders = new Set<string>();
  configs.forEach((config) => {
    invariant(
      typeof config.providers !== 'function',
      'Providers cannot be a function for multiple configs',
    );
    if (typeof config.providers === 'string') {
      if (!seenProviders.has(config.providers)) {
        providers.push(config.providers);
        seenProviders.add(config.providers);
      }
    } else if (Array.isArray(config.providers)) {
      config.providers.forEach((provider) => {
        if (!seenProviders.has(JSON.stringify(provider))) {
          providers.push(provider);
          seenProviders.add(JSON.stringify(provider));
        }
      });
    }
  });

  const tests: UnifiedConfig['tests'] = [];
  for (const config of configs) {
    if (typeof config.tests === 'string') {
      const newTests = await readTests(config.tests, path.dirname(configPaths[0]));
      tests.push(...newTests);
    } else if (Array.isArray(config.tests)) {
      tests.push(...config.tests);
    }
  }

  const configsAreStringOrArray = configs.every(
    (config) => typeof config.prompts === 'string' || Array.isArray(config.prompts),
  );
  const configsAreObjects = configs.every((config) => typeof config.prompts === 'object');
  let prompts: UnifiedConfig['prompts'] = configsAreStringOrArray ? [] : {};

  const makeAbsolute = (configPath: string, relativePath: string | Prompt) => {
    if (typeof relativePath === 'string') {
      if (relativePath.startsWith('file://')) {
        relativePath =
          'file://' + path.resolve(path.dirname(configPath), relativePath.slice('file://'.length));
      }
      return relativePath;
    } else if (typeof relativePath === 'object' && relativePath.id) {
      if (relativePath.id.startsWith('file://')) {
        relativePath.id =
          'file://' +
          path.resolve(path.dirname(configPath), relativePath.id.slice('file://'.length));
      }
      return relativePath;
    } else {
      throw new Error('Invalid prompt object');
    }
  };

  const seenPrompts = new Set<string>();
  const addSeenPrompt = (prompt: string | Prompt) => {
    if (typeof prompt === 'string') {
      seenPrompts.add(prompt);
    } else if (typeof prompt === 'object' && prompt.id) {
      seenPrompts.add(prompt.id);
    } else {
      throw new Error('Invalid prompt object');
    }
  };
  configs.forEach((config, idx) => {
    if (typeof config.prompts === 'string') {
      invariant(Array.isArray(prompts), 'Cannot mix string and map-type prompts');
      const absolutePrompt = makeAbsolute(configPaths[idx], config.prompts);
      addSeenPrompt(absolutePrompt);
    } else if (Array.isArray(config.prompts)) {
      invariant(Array.isArray(prompts), 'Cannot mix configs with map and array-type prompts');
      config.prompts
        .map((prompt) => makeAbsolute(configPaths[idx], prompt))
        .forEach((prompt) => addSeenPrompt(prompt));
    } else {
      // Object format such as { 'prompts/prompt1.txt': 'foo', 'prompts/prompt2.txt': 'bar' }
      invariant(typeof prompts === 'object', 'Cannot mix configs with map and array-type prompts');
      prompts = { ...prompts, ...config.prompts };
    }
  });
  if (Array.isArray(prompts)) {
    prompts.push(...Array.from(seenPrompts));
  }

  // Combine all configs into a single UnifiedConfig
  const combinedConfig: UnifiedConfig = {
    description: configs.map((config) => config.description).join(', '),
    providers,
    prompts,
    tests,
    scenarios: configs.flatMap((config) => config.scenarios || []),
    defaultTest: configs.reduce((prev: Partial<TestCase> | undefined, curr) => {
      return {
        ...prev,
        ...curr.defaultTest,
        vars: { ...prev?.vars, ...curr.defaultTest?.vars },
        assert: [...(prev?.assert || []), ...(curr.defaultTest?.assert || [])],
        options: { ...prev?.options, ...curr.defaultTest?.options },
      };
    }, {}),
    nunjucksFilters: configs.reduce((prev, curr) => ({ ...prev, ...curr.nunjucksFilters }), {}),
    env: configs.reduce((prev, curr) => ({ ...prev, ...curr.env }), {}),
    evaluateOptions: configs.reduce((prev, curr) => ({ ...prev, ...curr.evaluateOptions }), {}),
    commandLineOptions: configs.reduce(
      (prev, curr) => ({ ...prev, ...curr.commandLineOptions }),
      {},
    ),
    sharing: !configs.some((config) => config.sharing === false),
  };

  return combinedConfig;
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

export async function writeOutput(
  outputPath: string,
  evalId: string | null,
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
) {
  const outputExtension = outputPath.split('.').pop()?.toLowerCase();

  const outputToSimpleString = (output: EvaluateTableOutput) => {
    const passFailText = output.pass ? '[PASS]' : '[FAIL]';
    const namedScoresText = Object.entries(output.namedScores)
      .map(([name, value]) => `${name}: ${value.toFixed(2)}`)
      .join(', ');
    const scoreText =
      namedScoresText.length > 0
        ? `(${output.score.toFixed(2)}, ${namedScoresText})`
        : `(${output.score.toFixed(2)})`;
    const gradingResultText = output.gradingResult
      ? `${output.pass ? 'Pass' : 'Fail'} Reason: ${output.gradingResult.reason}`
      : '';
    return `${passFailText} ${scoreText}

${output.text}

${gradingResultText}`.trim();
  };

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
    await writeCsvToGoogleSheet(rows, outputPath);
  } else {
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
    } else if (
      outputExtension === 'yaml' ||
      outputExtension === 'yml' ||
      outputExtension === 'txt'
    ) {
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
    } else {
      throw new Error(
        `Unsupported output file format ${outputExtension}, please use csv, txt, json, yaml, yml, html.`,
      );
    }
  }
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

let configDirectoryPath: string | undefined = process.env.PROMPTFOO_CONFIG_DIR;

export function getConfigDirectoryPath(createIfNotExists: boolean = false): string {
  const p = configDirectoryPath || path.join(os.homedir(), '.promptfoo');
  if (createIfNotExists && !fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
  return p;
}

export function setConfigDirectoryPath(newPath: string): void {
  configDirectoryPath = newPath;
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

  logger.debug(`Awaiting ${promises.length} promises to database...`);
  await Promise.all(promises);

  // "touch" db signal path
  const filePath = getDbSignalPath();
  try {
    const now = new Date();
    fs.utimesSync(filePath, now, now);
  } catch (err) {
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
): { evalId: string; description?: string | null }[] {
  const db = getDb();
  let results = db
    .select({
      name: evals.id,
      description: evals.description,
    })
    .from(evals)
    .orderBy(desc(evals.createdAt))
    .limit(limit)
    .all();

  if (filterDescription) {
    const regex = new RegExp(filterDescription, 'i');
    results = results.filter((result) => regex.test(result.description || ''));
  }

  return results.map((result) => ({
    evalId: result.name,
    description: result.description,
  }));
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

const RESULT_HISTORY_LENGTH =
  parseInt(process.env.RESULT_HISTORY_LENGTH || '', 10) || DEFAULT_QUERY_LIMIT;

export function cleanupOldFileResults(remaining = RESULT_HISTORY_LENGTH) {
  const sortedFilenames = listPreviousResultFilenames_fileSystem();
  for (let i = 0; i < sortedFilenames.length - remaining; i++) {
    fs.unlinkSync(path.join(getConfigDirectoryPath(), 'output', sortedFilenames[i]));
  }
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

export async function readResult(
  id: string,
): Promise<{ id: string; result: ResultsFile; createdAt: Date } | undefined> {
  const db = getDb();
  try {
    const evalResult = await db
      .select({
        id: evals.id,
        createdAt: evals.createdAt,
        results: evals.results,
        config: evals.config,
      })
      .from(evals)
      .where(eq(evals.id, id))
      .execute();

    if (evalResult.length === 0) {
      return undefined;
    }

    const { id: resultId, createdAt, results, config } = evalResult[0];
    const result: ResultsFile = {
      version: 3,
      createdAt: new Date(createdAt).toISOString().slice(0, 10),
      results,
      config,
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

export async function readLatestResults(
  filterDescription?: string,
): Promise<ResultsFile | undefined> {
  const db = getDb();
  let latestResults = await db
    .select({
      id: evals.id,
      createdAt: evals.createdAt,
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
    results: latestResult.results,
    config: latestResult.config,
  };
}

export function getPromptsForTestCases(testCases: TestCase[]) {
  const testCasesJson = JSON.stringify(testCases);
  const testCasesSha256 = sha256(testCasesJson);
  return getPromptsForTestCasesHash(testCasesSha256);
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

export function sha256(str: string) {
  return createHash('sha256').update(str).digest('hex');
}

export function getPrompts(limit: number = DEFAULT_QUERY_LIMIT) {
  return getPromptsWithPredicate(() => true, limit);
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

export async function getTestCases(limit: number = DEFAULT_QUERY_LIMIT) {
  return getTestCasesWithPredicate(() => true, limit);
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

export async function getEvalsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
  limit: number,
): Promise<EvalWithMetadata[]> {
  const db = getDb();
  const evals_ = await db
    .select({
      id: evals.id,
      createdAt: evals.createdAt,
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
      createdAt: createdAt,
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

export async function readFilters(filters: Record<string, string>): Promise<NunjucksFilterMap> {
  const ret: NunjucksFilterMap = {};
  const basePath = cliState.basePath || '';
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

export function getNunjucksEngine(filters?: NunjucksFilterMap) {
  if (process.env.PROMPTFOO_DISABLE_TEMPLATING) {
    return {
      renderString: (template: string) => template,
    };
  }

  const env = nunjucks.configure({
    autoescape: false,
  });

  if (filters) {
    for (const [name, filter] of Object.entries(filters)) {
      env.addFilter(name, filter);
    }
  }
  return env;
}

export function printBorder() {
  const border = '='.repeat((process.stdout.columns || 80) - 10);
  logger.info(border);
}

export async function transformOutput(
  codeOrFilepath: string,
  output: string | object | undefined,
  context: { vars?: Record<string, string | object | undefined>; prompt: Partial<Prompt> },
) {
  let postprocessFn;
  if (codeOrFilepath.startsWith('file://')) {
    const filePath = codeOrFilepath.slice('file://'.length);
    if (
      codeOrFilepath.endsWith('.js') ||
      codeOrFilepath.endsWith('.cjs') ||
      codeOrFilepath.endsWith('.mjs')
    ) {
      const requiredModule = await importModule(filePath);
      if (typeof requiredModule === 'function') {
        postprocessFn = requiredModule;
      } else if (requiredModule.default && typeof requiredModule.default === 'function') {
        postprocessFn = requiredModule.default;
      } else {
        throw new Error(
          `Transform ${filePath} must export a function or have a default export as a function`,
        );
      }
    } else if (codeOrFilepath.endsWith('.py')) {
      postprocessFn = async (
        output: string,
        context: { vars: Record<string, string | object> },
      ) => {
        return runPython(filePath, 'get_transform', [output, context]);
      };
    } else {
      throw new Error(`Unsupported transform file format: ${codeOrFilepath}`);
    }
  } else {
    postprocessFn = new Function(
      'output',
      'context',
      codeOrFilepath.includes('\n') ? codeOrFilepath : `return ${codeOrFilepath}`,
    );
  }
  const ret = await Promise.resolve(postprocessFn(output, context));
  if (ret == null) {
    throw new Error(`Transform function did not return a value\n\n${codeOrFilepath}`);
  }
  return ret;
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
  datasetId: string | null;
  promptId: string | null;
};

export function getStandaloneEvals(limit: number = DEFAULT_QUERY_LIMIT): StandaloneEval[] {
  const db = getDb();
  const results = db
    .select({
      evalId: evals.id,
      description: evals.description,
      config: evals.config,
      results: evals.results,
      promptId: evalsToPrompts.promptId,
      datasetId: evalsToDatasets.datasetId,
    })
    .from(evals)
    .leftJoin(evalsToPrompts, eq(evals.id, evalsToPrompts.evalId))
    .leftJoin(evalsToDatasets, eq(evals.id, evalsToDatasets.evalId))
    .orderBy(desc(evals.createdAt))
    .limit(limit)
    .all();

  const flatResults: StandaloneEval[] = [];
  results.forEach((result) => {
    const table = result.results.table;
    table.head.prompts.forEach((col) => {
      flatResults.push({
        evalId: result.evalId,
        promptId: result.promptId,
        datasetId: result.datasetId,
        ...col,
      });
    });
  });
  return flatResults;
}

export function providerToIdentifier(provider: TestCase['provider']): string | undefined {
  if (isApiProvider(provider)) {
    return provider.id();
  } else if (isProviderOptions(provider)) {
    return provider.id;
  }

  return provider;
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

export function safeJsonStringify(value: any, prettyPrint: boolean = false): string {
  // Prevent circular references
  const cache = new Set();
  const space = prettyPrint ? 2 : undefined;
  return JSON.stringify(
    value,
    (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (cache.has(val)) return;
        cache.add(val);
      }
      return val;
    },
    space,
  );
}

export function renderVarsInObject<T>(obj: T, vars?: Record<string, string | object>): T {
  // Renders nunjucks template strings with context variables
  if (!vars || process.env.PROMPTFOO_DISABLE_TEMPLATING) {
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
