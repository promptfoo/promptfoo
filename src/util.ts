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

import logger from './logger';
import { getDirectory } from './esm';
import { readTests } from './testCases';

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

  configs.forEach((config, idx) => {
    if (typeof config.prompts === 'string') {
      invariant(Array.isArray(prompts), 'Cannot mix string and map-type prompts');
      config.prompts = makeAbsolute(configPaths[idx], config.prompts);
      prompts.push(config.prompts);
    } else if (Array.isArray(config.prompts)) {
      invariant(Array.isArray(prompts), 'Cannot mix configs with map and array-type prompts');
      config.prompts = config.prompts.map((prompt) => makeAbsolute(configPaths[idx], prompt));
      prompts.push(...config.prompts);
    } else {
      // Object format such as { 'prompts/prompt1.txt': 'foo', 'prompts/prompt2.txt': 'bar' }
      invariant(typeof prompts === 'object', 'Cannot mix configs with map and array-type prompts');
      prompts = { ...prompts, ...config.prompts };
    }
  });

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
    const gradingResultText = output.gradingResult ? `${output.pass ? 'Pass' : 'Fail'} Reason: ${output.gradingResult.reason}` : '';
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

export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}

export function writeLatestResults(results: EvaluateSummary, config: Partial<UnifiedConfig>) {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');

  // Replace hyphens with colons (Windows compatibility).
  const filename = dateToFilename(new Date());
  const newResultsPath = path.join(resultsDirectory, filename);
  const latestResultsPath = getLatestResultsPath();
  try {
    fs.mkdirSync(resultsDirectory, { recursive: true });

    const resultsFileData: ResultsFile = {
      version: 2,
      createdAt: new Date().toISOString(),
      config,
      results,
    };
    fs.writeFileSync(newResultsPath, JSON.stringify(resultsFileData, null, 2));

    // Use copy instead of symlink to avoid issues with Windows permissions.
    try {
      // Backwards compatibility: delete old symlink.
      fs.unlinkSync(latestResultsPath);
    } catch {}
    fs.copyFileSync(newResultsPath, latestResultsPath);

    cleanupOldResults();
  } catch (err) {
    logger.error(`Failed to write latest results to ${newResultsPath}:\n${err}`);
  }
}

const resultsCache: { [fileName: string]: ResultsFile | undefined } = {};

export function listPreviousResultFilenames(): string[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  const files = fs.readdirSync(directory);
  const resultsFiles = files.filter((file) => file.startsWith('eval-') && file.endsWith('.json'));
  return resultsFiles.sort((a, b) => {
    const statA = fs.statSync(path.join(directory, a));
    const statB = fs.statSync(path.join(directory, b));
    return statA.birthtime.getTime() - statB.birthtime.getTime(); // sort in ascending order
  });
}

export function listPreviousResults(): { fileName: string; description?: string }[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  const sortedFiles = listPreviousResultFilenames();
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

const RESULT_HISTORY_LENGTH = parseInt(process.env.RESULT_HISTORY_LENGTH || '', 10) || 100;

export function cleanupOldResults(remaining = RESULT_HISTORY_LENGTH) {
  const sortedFilenames = listPreviousResultFilenames();
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
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

export function dateToFilename(date: Date) {
  return `eval-${date.toISOString().replace(/:/g, '-')}.json`;
}

export function readResult(
  name: string,
): { id: string; result: ResultsFile; createdAt: Date } | undefined {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');
  const resultsPath = path.join(resultsDirectory, name);
  try {
    const result = JSON.parse(
      fs.readFileSync(fs.realpathSync(resultsPath), 'utf-8'),
    ) as ResultsFile;
    const createdAt = new Date(filenameToDate(name));
    return {
      id: sha256(JSON.stringify(result.config)),
      result,
      createdAt,
    };
  } catch (err) {
    logger.error(`Failed to read results from ${resultsPath}:\n${err}`);
  }
}

export function updateResult(filename: string, newConfig: Partial<UnifiedConfig>, newTable: EvaluateTable): void {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');
  const safeFilename = path.basename(filename);
  const resultsPath = path.join(resultsDirectory, safeFilename);
  try {
    const evalData = JSON.parse(fs.readFileSync(resultsPath, 'utf-8')) as ResultsFile;
    if (newConfig) {
      evalData.config = newConfig;
    }
    if (newTable) {
      evalData.results.table = newTable;
    }
    resultsCache[safeFilename] = evalData;
    fs.writeFileSync(resultsPath, JSON.stringify(evalData, null, 2));
    logger.info(`Updated eval at ${resultsPath}`);

    const resultFilenames = listPreviousResultFilenames();
    if (filename === resultFilenames[resultFilenames.length - 1]) {
      // Overwite latest.json too
      fs.copyFileSync(resultsPath, getLatestResultsPath());
    }
  } catch (err) {
    logger.error(`Failed to update eval at ${resultsPath}:\n${err}`);
  }
}

export function readLatestResults(): ResultsFile | undefined {
  return JSON.parse(fs.readFileSync(getLatestResultsPath(), 'utf-8'));
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

export function getPromptsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
): PromptWithMetadata[] {
  const resultFilenames = listPreviousResultFilenames();
  const groupedPrompts: { [hash: string]: PromptWithMetadata } = {};

  for (const fileName of resultFilenames) {
    const file = readResult(fileName);
    if (!file) {
      continue;
    }
    const { result, createdAt } = file;
    if (result && predicate(result)) {
      for (const prompt of result.results.table.head.prompts) {
        const evalId = sha256(JSON.stringify(result.config));
        const promptId = sha256(prompt.raw);
        const datasetId = result.config.tests ? sha256(JSON.stringify(result.config.tests)) : '-';
        if (promptId in groupedPrompts) {
          groupedPrompts[promptId].recentEvalDate = new Date(
            Math.max(
              groupedPrompts[promptId].recentEvalDate.getTime(),
              new Date(createdAt).getTime(),
            ),
          );
          groupedPrompts[promptId].count += 1;
          groupedPrompts[promptId].evals.push({
            id: evalId,
            filePath: fileName,
            datasetId,
            metrics: prompt.metrics,
          });
        } else {
          groupedPrompts[promptId] = {
            count: 1,
            id: promptId,
            prompt,
            recentEvalDate: new Date(createdAt),
            recentEvalId: evalId,
            recentEvalFilepath: fileName,
            evals: [
              {
                id: evalId,
                filePath: fileName,
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

export function getTestCases() {
  return getTestCasesWithPredicate(() => true);
}

export function getTestCasesWithPredicate(
  predicate: (result: ResultsFile) => boolean,
): TestCasesWithMetadata[] {
  const resultFilenames = listPreviousResultFilenames();
  const groupedTestCases: { [hash: string]: TestCasesWithMetadata } = {};

  for (const fileName of resultFilenames) {
    const file = readResult(fileName);
    if (!file) {
      continue;
    }
    const { result, createdAt } = file;
    const testCases = result?.config?.tests;
    if (testCases && predicate(result)) {
      const evalId = sha256(JSON.stringify(result.config));
      const datasetId = sha256(JSON.stringify(testCases));
      if (datasetId in groupedTestCases) {
        groupedTestCases[datasetId].recentEvalDate = new Date(
          Math.max(
            groupedTestCases[datasetId].recentEvalDate.getTime(),
            new Date(createdAt).getTime(),
          ),
        );
        groupedTestCases[datasetId].count += 1;
        const newPrompts = result.results.table.head.prompts.map((prompt) => ({
          id: sha256(prompt.raw),
          prompt,
          evalId,
          evalFilepath: fileName,
        }));
        const promptsById: Record<string, TestCasesWithMetadataPrompt> = {};
        for (const prompt of groupedTestCases[datasetId].prompts.concat(newPrompts)) {
          if (!(prompt.id in promptsById)) {
            promptsById[prompt.id] = prompt;
          }
        }
        groupedTestCases[datasetId].prompts = Object.values(promptsById);
      } else {
        const newPrompts = result.results.table.head.prompts.map((prompt) => ({
          id: createHash('sha256').update(prompt.raw).digest('hex'),
          prompt,
          evalId,
          evalFilepath: fileName,
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
          recentEvalFilepath: fileName,
          prompts: Object.values(promptsById),
        };
      }
    }
  }

  return Object.values(groupedTestCases);
}

export function getPromptFromHash(hash: string) {
  const prompts = getPrompts();
  for (const prompt of prompts) {
    if (prompt.id.startsWith(hash)) {
      return prompt;
    }
  }
  return undefined;
}

export function getDatasetFromHash(hash: string) {
  const datasets = getTestCases();
  for (const dataset of datasets) {
    if (dataset.id.startsWith(hash)) {
      return dataset;
    }
  }
  return undefined;
}

export function getEvals() {
  return getEvalsWithPredicate(() => true);
}

export function getEvalFromHash(hash: string) {
  const evals = getEvals();
  for (const eval_ of evals) {
    if (eval_.id.startsWith(hash)) {
      return eval_;
    }
  }
  return undefined;
}

export function getEvalsWithPredicate(
  predicate: (result: ResultsFile) => boolean,
): EvalWithMetadata[] {
  const ret: EvalWithMetadata[] = [];
  const resultsFilenames = listPreviousResultFilenames();
  for (const fileName of resultsFilenames) {
    const file = readResult(fileName);
    if (!file) {
      continue;
    }
    const { result, createdAt } = file;
    if (result && predicate(result)) {
      const evalId = sha256(fileName + ':' + JSON.stringify(result.config));
      ret.push({
        id: evalId,
        filePath: fileName,
        date: createdAt,
        config: result.config,
        results: result.results,
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
