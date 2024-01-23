import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import invariant from 'tiny-invariant';
import nunjucks from 'nunjucks';
import yaml from 'js-yaml';
import { stringify } from 'csv-stringify/sync';
import { globSync } from 'glob';
import { asc, desc, eq } from 'drizzle-orm';

import logger from './logger';
import { getDirectory } from './esm';
import { readTests } from './testCases';
import { datasets, getDb, evals, evalsToDatasets, evalsToPrompts, prompts } from './database';
import { runDbMigrations } from './migrate';

import type {
  EvalWithMetadata,
  EvaluateSummary,
  EvaluateTable,
  EvaluateTableOutput,
  NunjucksFilterMap,
  PromptWithMetadata,
  ResultsFile,
  TestCase,
  TestCasesWithMetadata,
  TestCasesWithMetadataPrompt,
  UnifiedConfig,
  OutputFile,
  ProviderOptions,
  Prompt,
  FilePath,
} from './types';

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
      fs.writeFileSync(path.join(getConfigDirectoryPath(), 'promptfoo.yaml'), yaml.dump(config));
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
      return require(configPath) as UnifiedConfig;
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
    const globPaths = globSync(configPath);
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
  configs.forEach(async (config) => {
    if (typeof config.tests === 'string') {
      const newTests = await readTests(config.tests, path.dirname(configPaths[0]));
      tests.push(...newTests);
    } else if (Array.isArray(config.tests)) {
      tests.push(...config.tests);
    }
  });

  const configsAreStringOrArray = configs.every(
    (config) => typeof config.prompts === 'string' || Array.isArray(config.prompts),
  );
  const configsAreObjects = configs.every((config) => typeof config.prompts === 'object');
  let prompts: UnifiedConfig['prompts'] = configsAreStringOrArray ? [] : {};

  const makeAbsolute = (configPath: string, relativePath: string) => {
    if (relativePath.startsWith('file://')) {
      relativePath =
        'file://' + path.resolve(path.dirname(configPath), relativePath.slice('file://'.length));
    }
    return relativePath;
  };

  const seenPrompts = new Set<string>();
  configs.forEach((config, idx) => {
    if (typeof config.prompts === 'string') {
      invariant(Array.isArray(prompts), 'Cannot mix string and map-type prompts');
      const absolutePrompt = makeAbsolute(configPaths[idx], config.prompts);
      seenPrompts.add(absolutePrompt);
    } else if (Array.isArray(config.prompts)) {
      invariant(Array.isArray(prompts), 'Cannot mix configs with map and array-type prompts');
      config.prompts
        .map((prompt) => makeAbsolute(configPaths[idx], prompt))
        .forEach((prompt) => seenPrompts.add(prompt));
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

export function writeMultipleOutputs(
  outputPaths: string[],
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
): void {
  for (const outputPath of outputPaths) {
    writeOutput(outputPath, results, config, shareableUrl);
  }
}

export function writeOutput(
  outputPath: string,
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
): void {
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

  // Ensure the directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (outputExtension === 'csv') {
    const csvOutput = stringify([
      [
        ...results.table.head.vars,
        ...results.table.head.prompts.map((prompt) => JSON.stringify(prompt)),
      ],
      ...results.table.body.map((row) => [...row.vars, ...row.outputs.map(outputToSimpleString)]),
    ]);
    fs.writeFileSync(outputPath, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(
      outputPath,
      JSON.stringify({ results, config, shareableUrl } as OutputFile, null, 2),
    );
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    fs.writeFileSync(outputPath, yaml.dump({ results, config, shareableUrl } as OutputFile));
  } else if (outputExtension === 'html') {
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const table = [
      [...results.table.head.vars, ...results.table.head.prompts.map((prompt) => prompt.display)],
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

let configDirectoryPath: string | undefined = process.env.PROMPTFOO_CONFIG_DIR;

export function getConfigDirectoryPath(): string {
  return configDirectoryPath || path.join(os.homedir(), '.promptfoo');
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

export function writeResultsToDatabase(results: EvaluateSummary, config: Partial<UnifiedConfig>, createdAt?: Date): string {
  createdAt = createdAt || new Date();
  const evalId = `eval-${createdAt.toISOString()}`;
  const db = getDb();
  db.insert(evals)
    .values({
      id: evalId,
      createdAt: createdAt.getTime(),
      description: config.description,
      config,
      results,
    })
    .run();

  logger.debug(`Inserted evalId ${evalId}`);

  // Record prompt relation
  for (const prompt of results.table.head.prompts) {
    const promptId = sha256(prompt.display);
    db.insert(prompts)
      .values({
        id: promptId,
        prompt: prompt.display,
        hash: promptId,
      })
      .onConflictDoNothing()
      .run();

    db.insert(evalsToPrompts)
      .values({
        evalId,
        promptId,
      })
      .onConflictDoNothing()
      .run();

    logger.debug(`Inserted/updated promptId ${promptId}`);
  }

  /*
  for (const result of results.results) {
    const promptId = sha256(result.prompt.display);
    db.insert(llmOutputs)
      .values({
        id: uuidv4(),
        evalId,
        promptId,
        providerId: result.provider.id || 'unknown',
        vars: JSON.stringify(result.vars),
        response: JSON.stringify(result.response),
        error: result.error,
        latencyMs: result.latencyMs,
        gradingResult: JSON.stringify(result.gradingResult),
        namedScores: JSON.stringify(result.namedScores),
        cost: result.cost,
      })
      .run();
  }
  logger.debug(`Inserted ${results.results.length} llmOutputs for evalId ${evalId}`);
  */

  // Record dataset relation
  const datasetId = sha256(JSON.stringify(config.tests));
  db.insert(datasets)
    .values({
      id: datasetId,
      testCaseId: JSON.stringify(config.tests),
    })
    .onConflictDoNothing()
    .run();
  db.insert(evalsToDatasets)
    .values({
      evalId,
      datasetId,
    })
    .onConflictDoNothing()
    .run();
  logger.debug(`Inserted/updated datasetId ${datasetId}`);

  return evalId;
}

/**
 * 
 * @returns Last 100 evals in descending order.
 */
export function listPreviousResults(): { evalId: string; description?: string | null }[] {
  const db = getDb();
  const results = db
    .select({
      name: evals.id,
      description: evals.description,
    })
    .from(evals)
    .orderBy(desc(evals.createdAt))
    .limit(100)
    .all();

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
    return;
  }

  const resultsFromFileSystem = listPreviousResults_fileSystem();
  if (resultsFromFileSystem.length === 0) {
    return;
  }

  logger.info(`🔁 Migrating ${resultsFromFileSystem.length} flat files to local database.`);
  logger.info('This is a one-time operation and may take a minute...');
  attemptedMigration = true;
  
  // First run db migrations
  logger.info('Creating the sqlite database...');
  await runDbMigrations();
  
  // Then move all the files over
  logger.info('Moving files into database...');
  for (const { fileName } of resultsFromFileSystem) {
    const fileData = readResult_fileSystem(fileName);
    if (fileData) {
      await writeResultsToDatabase(fileData.result.results, fileData.result.config, filenameToDate(fileName));
      logger.debug(`Migrated ${fileName} to database.`);
      try {
        fs.unlinkSync(path.join(getConfigDirectoryPath(), 'output', fileName));
      } catch (err) {
        logger.warn(`Failed to delete ${fileName} after migration: ${err}`);
      }
    } else {
      logger.warn(`Failed to migrate result ${fileName} due to read error.`);
    }
  }
  try {
    fs.unlinkSync(getLatestResultsPath());
  } catch (err) {
    logger.warn(`Failed to delete latest.json: ${err}`);
  }
  logger.info('Migration complete.');
}

const RESULT_HISTORY_LENGTH = parseInt(process.env.RESULT_HISTORY_LENGTH || '', 10) || 100;

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
      createdAt: new Date(createdAt).toISOString(),
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

export async function readLatestResults(): Promise<ResultsFile | undefined> {
  const db = getDb();
  const latestResults = await db
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

  if (!latestResults || latestResults.length === 0) {
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

export function getPromptsForTestCasesHash(testCasesSha256: string) {
  return getPromptsWithPredicate((result) => {
    const testsJson = JSON.stringify(result.config.tests);
    const hash = sha256(testsJson);
    return hash === testCasesSha256;
  });
}

export function sha256(str: string) {
  return createHash('sha256').update(str).digest('hex');
}

export function getPrompts() {
  return getPromptsWithPredicate(() => true);
}

export async function getPromptsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
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
    .limit(100)
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

export async function getTestCases() {
  return getTestCasesWithPredicate(() => true);
}

export async function getTestCasesWithPredicate(
  predicate: (result: ResultsFile) => boolean,
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
    .limit(100)
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

export async function getEvals() {
  return getEvalsWithPredicate(() => true);
}

export async function getEvalFromHash(hash: string) {
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
): Promise<EvalWithMetadata[]> {
  const db = getDb();
  const evals_ = await db
    .select({
      id: evals.id,
      createdAt: evals.createdAt,
      results: evals.results,
      config: evals.config,
    })
    .from(evals)
    .limit(100)
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
      });
    }
  }

  return ret;
}

export function readFilters(
  filters: Record<string, string>,
  basePath: string = '',
): NunjucksFilterMap {
  const ret: NunjucksFilterMap = {};
  for (const [name, filterPath] of Object.entries(filters)) {
    const globPath = path.join(basePath, filterPath);
    const filePaths = globSync(globPath);
    for (const filePath of filePaths) {
      const finalPath = path.resolve(filePath);
      const importedModule = require(finalPath);
      ret[name] = importedModule.default || importedModule;
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

export function transformOutput(
  code: string,
  output: string | object | undefined,
  context: { vars?: Record<string, string | object | undefined>; prompt: Partial<Prompt> },
) {
  const postprocessFn = new Function(
    'output',
    'context',
    code.includes('\n') ? code : `return ${code}`,
  );
  const ret = postprocessFn(output, context);
  if (output == null) {
    throw new Error(`Postprocess function did not return a value\n\n${code}`);
  }
  return ret;
}
