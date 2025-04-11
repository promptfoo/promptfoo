import chalk from 'chalk';
import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import process from 'process';
import { readAssertions } from '../../assertions';
import { validateAssertions } from '../../assertions/validateAssertions';
import cliState from '../../cliState';
import { filterTests } from '../../commands/eval/filterTests';
import { getEnvBool, isCI } from '../../envars';
import logger from '../../logger';
import { readPrompts, readProviderPromptMap } from '../../prompts';
import { loadApiProviders } from '../../providers';
import telemetry from '../../telemetry';
import {
  type CommandLineOptions,
  type Prompt,
  type Scenario,
  type TestCase,
  type TestSuite,
  type UnifiedConfig,
} from '../../types';
import { isRunningUnderNpx, maybeLoadFromExternalFile, readFilters } from '../../util';
import invariant from '../../util/invariant';
import { PromptSchema } from '../../validators/prompts';
import { readTest, readTests } from '../testCaseReader';
import { loadDefaultConfig } from './default';
import { readConfigFile } from './shared';

/**
 * Reads a configuration from the specified path.
 */
export async function readConfig(configPath: string): Promise<UnifiedConfig> {
  return readConfigFile(configPath);
}

/**
 * Reads multiple configuration files and combines them into a single UnifiedConfig.
 *
 * @param {string[]} configPaths - An array of paths to configuration files. Supports glob patterns.
 * @returns {Promise<UnifiedConfig>} A promise that resolves to a unified configuration object.
 */
export async function combineConfigs(configPaths: string[]): Promise<UnifiedConfig> {
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

  const extensions: UnifiedConfig['extensions'] = [];
  for (const config of configs) {
    if (Array.isArray(config.extensions)) {
      extensions.push(...config.extensions);
    }
  }
  if (extensions.length > 1 && configs.length > 1) {
    console.warn(
      'Warning: Multiple configurations and extensions detected. Currently, all extensions are run across all configs and do not respect their original promptfooconfig. Please file an issue on our GitHub repository if you need support for this use case.',
    );
  }

  let redteam: UnifiedConfig['redteam'] | undefined;
  for (const config of configs) {
    if (config.redteam) {
      if (!redteam) {
        redteam = {
          plugins: [],
          strategies: [],
        };
      }
      for (const redteamKey of Object.keys(config.redteam) as Array<keyof typeof redteam>) {
        if (['entities', 'plugins', 'strategies'].includes(redteamKey)) {
          if (Array.isArray(config.redteam[redteamKey])) {
            const currentValue = redteam[redteamKey] || [];
            const newValue = config.redteam[redteamKey];
            if (Array.isArray(newValue)) {
              (redteam[redteamKey] as unknown[]) = [
                ...new Set([...(currentValue as unknown[]), ...(newValue as unknown[])]),
              ].sort();
            }
          }
        } else {
          (redteam as Record<string, unknown>)[redteamKey] =
            config.redteam[redteamKey as keyof typeof config.redteam];
        }
      }
    }
  }

  const configsAreStringOrArray = configs.every(
    (config) => typeof config.prompts === 'string' || Array.isArray(config.prompts),
  );

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
    } else if (PromptSchema.safeParse(relativePath).success) {
      return relativePath;
    } else {
      throw new Error(`Invalid prompt object: ${JSON.stringify(relativePath)}`);
    }
  };

  const seenPrompts = new Set<string | Prompt>();
  const addSeenPrompt = (prompt: string | Prompt) => {
    if (typeof prompt === 'string') {
      seenPrompts.add(prompt);
    } else if (typeof prompt === 'object' && prompt.id) {
      seenPrompts.add(prompt);
    } else if (PromptSchema.safeParse(prompt).success) {
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
      config.prompts.forEach((prompt) => {
        invariant(
          typeof prompt === 'string' ||
            (typeof prompt === 'object' &&
              (typeof prompt.raw === 'string' || typeof prompt.label === 'string')),
          `Invalid prompt: ${JSON.stringify(prompt)}. Prompts must be either a string or an object with a 'raw' or 'label' string property.`,
        );
        addSeenPrompt(makeAbsolute(configPaths[idx], prompt as string | Prompt));
      });
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
    tags: configs.reduce((prev, curr) => ({ ...prev, ...curr.tags }), {}),
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
        metadata: { ...prev?.metadata, ...curr.defaultTest?.metadata },
      };
    }, {}),
    derivedMetrics: configs.reduce<UnifiedConfig['derivedMetrics']>((prev, curr) => {
      if (curr.derivedMetrics) {
        return [...(prev ?? []), ...curr.derivedMetrics];
      }
      return prev;
    }, undefined),
    nunjucksFilters: configs.reduce((prev, curr) => ({ ...prev, ...curr.nunjucksFilters }), {}),
    env: configs.reduce((prev, curr) => ({ ...prev, ...curr.env }), {}),
    evaluateOptions: configs.reduce((prev, curr) => ({ ...prev, ...curr.evaluateOptions }), {}),
    outputPath: configs.flatMap((config) =>
      typeof config.outputPath === 'string'
        ? [config.outputPath]
        : Array.isArray(config.outputPath)
          ? config.outputPath
          : [],
    ),
    commandLineOptions: configs.reduce(
      (prev, curr) => ({ ...prev, ...curr.commandLineOptions }),
      {},
    ),
    extensions,
    redteam,
    metadata: configs.reduce((prev, curr) => ({ ...prev, ...curr.metadata }), {}),
    sharing: (() => {
      if (configs.some((config) => config.sharing === false)) {
        return false;
      }

      const sharingConfig = configs.find((config) => typeof config.sharing === 'object');
      return sharingConfig ? sharingConfig.sharing : true;
    })(),
  };

  return combinedConfig;
}

/**
 * @param type - The type of configuration file. Incrementally implemented; currently supports `DatasetGeneration`.
 *  TODO(Optimization): Perform type-specific validation e.g. using Zod schemas for data model variants.
 */
export async function resolveConfigs(
  cmdObj: Partial<CommandLineOptions>,
  _defaultConfig: Partial<UnifiedConfig>,
  type?: 'DatasetGeneration',
): Promise<{ testSuite: TestSuite; config: Partial<UnifiedConfig>; basePath: string }> {
  let fileConfig: Partial<UnifiedConfig> = {};
  let defaultConfig = _defaultConfig;
  const configPaths = cmdObj.config;
  if (configPaths) {
    fileConfig = await combineConfigs(configPaths);
    // The user has provided a config file, so we do not want to use the default config.
    defaultConfig = {};
  }
  // Standalone assertion mode
  if (cmdObj.assertions) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'standalone assertions mode',
    });
    if (!cmdObj.modelOutputs) {
      logger.error('You must provide --model-outputs when using --assertions');
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

  // Use base path in cases where path was supplied in the config file
  const basePath = configPaths ? path.dirname(configPaths[0]) : '';

  cliState.basePath = basePath;

  const defaultTestRaw = fileConfig.defaultTest || defaultConfig.defaultTest;
  const config: Omit<UnifiedConfig, 'evaluateOptions' | 'commandLineOptions'> = {
    tags: fileConfig.tags || defaultConfig.tags,
    description: cmdObj.description || fileConfig.description || defaultConfig.description,
    prompts: cmdObj.prompts || fileConfig.prompts || defaultConfig.prompts || [],
    providers: cmdObj.providers || fileConfig.providers || defaultConfig.providers || [],
    tests: cmdObj.tests || cmdObj.vars || fileConfig.tests || defaultConfig.tests || [],
    scenarios: fileConfig.scenarios || defaultConfig.scenarios,
    env: fileConfig.env || defaultConfig.env,
    sharing: getEnvBool('PROMPTFOO_DISABLE_SHARING')
      ? false
      : (fileConfig.sharing ?? defaultConfig.sharing ?? true),
    defaultTest: defaultTestRaw ? await readTest(defaultTestRaw, basePath) : undefined,
    derivedMetrics: fileConfig.derivedMetrics || defaultConfig.derivedMetrics,
    outputPath: cmdObj.output || fileConfig.outputPath || defaultConfig.outputPath,
    extensions: fileConfig.extensions || defaultConfig.extensions || [],
    metadata: fileConfig.metadata || defaultConfig.metadata,
    redteam: fileConfig.redteam || defaultConfig.redteam,
  };

  const hasPrompts = [config.prompts].flat().filter(Boolean).length > 0;
  const hasProviders = [config.providers].flat().filter(Boolean).length > 0;
  const hasConfigFile = Boolean(configPaths);

  if (!hasConfigFile && !hasPrompts && !hasProviders && !isCI()) {
    const runCommand = isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo';

    logger.warn(dedent`
      ${chalk.yellow.bold('⚠️  No promptfooconfig found')}

      ${chalk.white('Try running with:')}
  
      ${chalk.cyan(`${runCommand} eval -c ${chalk.bold('path/to/promptfooconfig.yaml')}`)}
  
      ${chalk.white('Or create a config with:')}
  
      ${chalk.green(`${runCommand} init`)}
    `);
    process.exit(1);
  }

  if (!hasPrompts) {
    logger.error('You must provide at least 1 prompt');
    process.exit(1);
  }

  if (
    // Dataset configs don't require providers
    type !== 'DatasetGeneration' &&
    !hasProviders
  ) {
    logger.error('You must specify at least 1 provider (for example, openai:gpt-4o)');
    process.exit(1);
  }

  invariant(Array.isArray(config.providers), 'providers must be an array');
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
    fileConfig.scenarios = (await maybeLoadFromExternalFile(fileConfig.scenarios)) as Scenario[];
  }
  if (Array.isArray(fileConfig.scenarios)) {
    for (const scenario of fileConfig.scenarios) {
      if (typeof scenario === 'object' && scenario.tests && typeof scenario.tests === 'string') {
        scenario.tests = await maybeLoadFromExternalFile(scenario.tests);
      }
      if (typeof scenario === 'object' && scenario.tests && Array.isArray(scenario.tests)) {
        const parsedScenarioTests: TestCase[] = await readTests(
          scenario.tests,
          cmdObj.tests ? undefined : basePath,
        );
        scenario.tests = parsedScenarioTests;
      }
      invariant(typeof scenario === 'object', 'scenario must be an object');
      const filteredTests = await filterTests(
        {
          ...(scenario ?? {}),
          providers: parsedProviders,
          prompts: parsedPrompts,
        },
        {
          firstN: cmdObj.filterFirstN,
          pattern: cmdObj.filterPattern,
          failing: cmdObj.filterFailing,
          sample: cmdObj.filterSample,
        },
      );
      invariant(filteredTests, 'filteredTests are undefined');
      scenario.tests = filteredTests;
    }
  }

  const parsedProviderPromptMap = readProviderPromptMap(config, parsedPrompts);

  if (parsedPrompts.length === 0) {
    logger.error('No prompts found');
    process.exit(1);
  }

  const defaultTest: TestCase = {
    metadata: config.metadata,
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
    tags: config.tags,
    prompts: parsedPrompts,
    providers: parsedProviders,
    providerPromptMap: parsedProviderPromptMap,
    tests: parsedTests,
    scenarios: config.scenarios as Scenario[],
    defaultTest,
    derivedMetrics: config.derivedMetrics,
    nunjucksFilters: await readFilters(
      fileConfig.nunjucksFilters || defaultConfig.nunjucksFilters || {},
      basePath,
    ),
    extensions: config.extensions,
  };

  if (testSuite.tests) {
    validateAssertions(testSuite.tests);
  }

  cliState.config = config;
  return { config, testSuite, basePath };
}

/**
 * Loads configuration from a specified path or uses the default configuration.
 * Handles cases where the config path is a directory.
 *
 * @param configOption - Path to the configuration file from command line options
 * @returns The loaded configuration and its path
 */
export async function loadConfigFromOption(configOption?: string) {
  let configPath = configOption;

  // If a path is provided but it's a directory, look for config file in the directory
  if (configPath && fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
    const { defaultConfigPath } = await loadDefaultConfig(configPath);
    configPath = defaultConfigPath;
  }

  // Load the config
  const result = configPath
    ? await loadDefaultConfig(
        path.dirname(configPath),
        path.basename(configPath, path.extname(configPath)),
      )
    : await loadDefaultConfig();

  return result;
}
