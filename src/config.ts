import $RefParser from '@apidevtools/json-schema-ref-parser';
import chalk from 'chalk';
import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';
import invariant from 'tiny-invariant';
import { readAssertions } from './assertions';
import { validateAssertions } from './assertions/validateAssertions';
import { filterTests } from './commands/eval/filterTests';
import { importModule } from './esm';
import logger from './logger';
import { readPrompts, readProviderPromptMap } from './prompts';
import { loadApiProviders } from './providers';
import { readTest, readTests } from './testCases';
import {
  CommandLineOptions,
  Prompt,
  ProviderOptions,
  ProviderSchema,
  TestCase,
  TestSuite,
  UnifiedConfig,
} from './types';
import { readFilters } from './util';

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

  const functionsParametersList: { parameters?: object }[][] = [];
  const toolsParametersList: { parameters?: object }[][] = [];

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
      const rawConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as UnifiedConfig;
      return dereferenceConfig(rawConfig);
    case '.js':
    case '.cjs':
    case '.mjs':
      return (await importModule(configPath)) as UnifiedConfig;
    default:
      throw new Error(`Unsupported configuration file format: ${ext}`);
  }
}

export async function maybeReadConfig(configPath: string): Promise<UnifiedConfig | undefined> {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return readConfig(configPath);
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

  const seenPrompts = new Set<string | Prompt>();
  const addSeenPrompt = (prompt: string | Prompt) => {
    if (typeof prompt === 'string') {
      seenPrompts.add(prompt);
    } else if (typeof prompt === 'object' && prompt.id) {
      seenPrompts.add(prompt);
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
    metadata: configs.reduce((prev, curr) => ({ ...prev, ...curr.metadata }), {}),
    sharing: !configs.some((config) => config.sharing === false),
  };

  return combinedConfig;
}

export async function resolveConfigs(
  cmdObj: Partial<CommandLineOptions>,
  defaultConfig: Partial<UnifiedConfig>,
): Promise<{ testSuite: TestSuite; config: Partial<UnifiedConfig>; basePath: string }> {
  // Config parsing
  let fileConfig: Partial<UnifiedConfig> = {};
  const configPaths = cmdObj.config;
  if (configPaths) {
    fileConfig = await readConfigs(configPaths);
  }

  // Standalone assertion mode
  if (cmdObj.assertions) {
    if (!cmdObj.modelOutputs) {
      logger.error(chalk.red('You must provide --model-outputs when using --assertions'));
      process.exit(1);
    }
    const modelOutputs = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), cmdObj.modelOutputs), 'utf8'),
    ) as string[] | { output: string; tags?: string[] }[];
    const assertions = await readAssertions(cmdObj.assertions);
    fileConfig.prompts = ['{{output}}'];
    fileConfig.providers = ['echo'];
    fileConfig.tests = modelOutputs.map((output) => {
      if (typeof output === 'string') {
        return {
          vars: {
            output,
          },
          assert: assertions,
        };
      }
      return {
        vars: {
          output: output.output,
          ...(output.tags === undefined ? {} : { tags: output.tags.join(', ') }),
        },
        assert: assertions,
      };
    });
  }

  // Use basepath in cases where path was supplied in the config file
  const basePath = configPaths ? path.dirname(configPaths[0]) : '';

  const defaultTestRaw = fileConfig.defaultTest || defaultConfig.defaultTest;
  const config: Omit<UnifiedConfig, 'evaluateOptions' | 'commandLineOptions'> = {
    description: fileConfig.description || defaultConfig.description,
    prompts: cmdObj.prompts || fileConfig.prompts || defaultConfig.prompts || [],
    providers: cmdObj.providers || fileConfig.providers || defaultConfig.providers || [],
    tests: cmdObj.tests || cmdObj.vars || fileConfig.tests || defaultConfig.tests || [],
    scenarios: fileConfig.scenarios || defaultConfig.scenarios,
    env: fileConfig.env || defaultConfig.env,
    sharing:
      process.env.PROMPTFOO_DISABLE_SHARING === '1'
        ? false
        : fileConfig.sharing ?? defaultConfig.sharing ?? true,
    defaultTest: defaultTestRaw ? await readTest(defaultTestRaw, basePath) : undefined,
    derivedMetrics: fileConfig.derivedMetrics || defaultConfig.derivedMetrics,
    outputPath: cmdObj.output || fileConfig.outputPath || defaultConfig.outputPath,
    metadata: fileConfig.metadata || defaultConfig.metadata,
  };

  // Validation
  if (!config.prompts || config.prompts.length === 0) {
    logger.error(chalk.red('You must provide at least 1 prompt'));
    process.exit(1);
  }

  if (!config.providers || config.providers.length === 0) {
    logger.error(chalk.red('You must specify at least 1 provider (for example, openai:gpt-4o)'));
    process.exit(1);
  }
  invariant(Array.isArray(config.providers), 'providers must be an array');
  config.providers.forEach((provider) => {
    const result = ProviderSchema.safeParse(provider);
    if (!result.success) {
      const errors = result.error.errors
        .map((err) => {
          return `- ${err.message}`;
        })
        .join('\n');
      const providerString = typeof provider === 'string' ? provider : JSON.stringify(provider);
      logger.warn(
        chalk.yellow(
          dedent`
              Provider: ${providerString} encountered errors during schema validation:

                ${errors}

              Please double check your configuration.` + '\n',
        ),
      );
    }
  });

  // Parse prompts, providers, and tests
  const parsedPrompts = await readPrompts(config.prompts, cmdObj.prompts ? undefined : basePath);
  const parsedProviders = await loadApiProviders(config.providers, {
    env: config.env,
    basePath,
  });
  const parsedTests: TestCase[] = await readTests(
    config.tests || [],
    cmdObj.tests ? undefined : basePath,
  );

  // Parse testCases for each scenario
  if (fileConfig.scenarios) {
    for (const scenario of fileConfig.scenarios) {
      const parsedScenarioTests: TestCase[] = await readTests(
        scenario.tests,
        cmdObj.tests ? undefined : basePath,
      );
      scenario.tests = parsedScenarioTests;
      const filteredTests = await filterTests(
        {
          ...scenario,
          providers: parsedProviders,
          prompts: parsedPrompts,
        },
        {
          firstN: cmdObj.filterFirstN,
          pattern: cmdObj.filterPattern,
          failing: cmdObj.filterFailing,
        },
      );
      invariant(filteredTests, 'filteredTests are undefined');
      scenario.tests = filteredTests;
    }
  }

  const parsedProviderPromptMap = readProviderPromptMap(config, parsedPrompts);

  if (parsedPrompts.length === 0) {
    logger.error(chalk.red('No prompts found'));
    process.exit(1);
  }

  const defaultTest: TestCase = {
    options: {
      prefix: cmdObj.promptPrefix,
      suffix: cmdObj.promptSuffix,
      provider: cmdObj.grader,
      // rubricPrompt
      ...(config.defaultTest?.options || {}),
    },
    ...config.defaultTest,
  };

  const testSuite: TestSuite = {
    description: config.description,
    prompts: parsedPrompts,
    providers: parsedProviders,
    providerPromptMap: parsedProviderPromptMap,
    tests: parsedTests,
    scenarios: config.scenarios,
    defaultTest,
    derivedMetrics: config.derivedMetrics,
    nunjucksFilters: await readFilters(
      fileConfig.nunjucksFilters || defaultConfig.nunjucksFilters || {},
    ),
  };

  if (testSuite.tests) {
    validateAssertions(testSuite.tests);
  }

  return { config, testSuite, basePath };
}
