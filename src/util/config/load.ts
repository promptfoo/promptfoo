import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import process from 'process';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import chalk from 'chalk';
import dedent from 'dedent';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { z } from 'zod';
import { readAssertions } from '../../assertions/index';
import { validateAssertions } from '../../assertions/validateAssertions';
import cliState from '../../cliState';
import { filterProviderConfigs } from '../../commands/eval/filterProviders';
import { filterTests } from '../../commands/eval/filterTests';
import { getEnvBool, isCI } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import { readPrompts, readProviderPromptMap } from '../../prompts/index';
import { loadApiProviders, resolveProviderConfigs } from '../../providers/index';
import telemetry from '../../telemetry';
import {
  type CommandLineOptions,
  CommandLineOptionsSchema,
  EvaluateOptionsSchema,
  type Prompt,
  type ProviderOptions,
  ProvidersSchema,
  type RedteamPluginObject,
  type RedteamStrategyObject,
  type Scenario,
  type TestCase,
  type TestSuite,
  TestSuiteConfigSchema,
  type UnifiedConfig,
  UnifiedConfigSchema,
} from '../../types/index';
import { maybeLoadFromExternalFile } from '../../util/file';
import { isJavascriptFile } from '../../util/fileExtensions';
import { readFilters, renderEnvOnlyInObject } from '../../util/index';
import invariant from '../../util/invariant';
import { PromptSchema } from '../../validators/prompts';
import { promptfooCommand } from '../promptfooCommand';
import { readTest, readTests } from '../testCaseReader';
import { validateTestPromptReferences } from '../validateTestPromptReferences';
import { validateTestProviderReferences } from '../validateTestProviderReferences';

/**
 * Type guard to check if a test case has vars property
 */
function isTestCaseWithVars(test: unknown): test is { vars: Record<string, unknown> } {
  return typeof test === 'object' && test !== null && 'vars' in test;
}

export async function dereferenceConfig(rawConfig: UnifiedConfig): Promise<UnifiedConfig> {
  if (getEnvBool('PROMPTFOO_DISABLE_REF_PARSER')) {
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
      if (typeof provider === 'string') {
        return;
      }
      if (typeof provider === 'function') {
        return;
      }
      if (!provider.config) {
        // Handle when provider is a map
        provider = Object.values(provider)[0] as ProviderOptions;
      }

      // Handle dereferencing for inline tools, but skip external file paths (which are just strings)
      if (Array.isArray(provider.config?.functions)) {
        functionsParametersList[providerIndex] = extractFunctionParameters(
          provider.config.functions,
        );
      }

      if (Array.isArray(provider.config?.tools)) {
        toolsParametersList[providerIndex] = extractToolParameters(provider.config.tools);
      }
    });
  }

  // Dereference JSON
  const config = (await $RefParser.dereference(rawConfig)) as unknown as UnifiedConfig;

  // Restore functions and tools parameters
  if (Array.isArray(config.providers)) {
    config.providers.forEach((provider, index) => {
      if (typeof provider === 'string') {
        return;
      }
      if (typeof provider === 'function') {
        return;
      }
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

/**
 * Renders environment variable templates in a config object using two-pass rendering.
 * This handles nested templates in config.env (fixes #7079).
 *
 * Pass 1: Render config.env values using only process.env (isolated from cliState)
 * Pass 2: Render full config using pre-rendered config.env as overrides
 *
 * @param config - The config object to render
 * @returns The config with env templates rendered
 */
function renderConfigEnvTemplates<T extends { env?: Record<string, string> }>(config: T): T {
  // Respect PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS - use empty object if disabled
  const processEnvDisabled = getEnvBool(
    'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS',
    getEnvBool('PROMPTFOO_SELF_HOSTED', false),
  );
  const baseEnvForFirstPass = processEnvDisabled ? {} : process.env;

  // First pass: render config.env values using only process.env (replaceBase=true)
  // This avoids pulling stale cliState.config?.env in watch/reload scenarios
  const rawConfigEnv = config.env;
  const renderedConfigEnv = rawConfigEnv
    ? (renderEnvOnlyInObject(rawConfigEnv, baseEnvForFirstPass, true) as Record<string, string>)
    : undefined;

  // Filter out undefined values from renderedConfigEnv (common in JS configs: env: { FOO: process.env.FOO })
  // Note: To explicitly mask a process.env var, use empty string instead of undefined
  const filteredConfigEnv = renderedConfigEnv
    ? Object.fromEntries(Object.entries(renderedConfigEnv).filter(([, v]) => v !== undefined))
    : undefined;

  // Second pass: render full config using pre-rendered config.env as overrides
  return renderEnvOnlyInObject(config, filteredConfigEnv);
}

export async function readConfig(configPath: string): Promise<UnifiedConfig> {
  let ret: UnifiedConfig & {
    targets?: UnifiedConfig['providers'];
    plugins?: RedteamPluginObject[];
    strategies?: RedteamStrategyObject[];
  };
  const ext = path.parse(configPath).ext;
  if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
    const rawConfig = yaml.load(await fsPromises.readFile(configPath, 'utf-8')) ?? {};
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);

    // Render environment variable templates (e.g., {{ env.VAR }}) before validation.
    // This allows env vars to be used in paths and other config values.
    // Runtime templates like {{ vars.x }} are preserved for later evaluation.
    const renderedConfig = renderConfigEnvTemplates(dereferencedConfig as UnifiedConfig);

    // Validator requires `prompts`, but prompts is not actually required for redteam.
    // We create a relaxed schema for validation that makes prompts optional
    const UnifiedConfigSchemaWithoutPrompts = TestSuiteConfigSchema.extend({
      evaluateOptions: EvaluateOptionsSchema.optional(),
      commandLineOptions: CommandLineOptionsSchema.partial().optional(),
      providers: ProvidersSchema.optional(),
      targets: ProvidersSchema.optional(),
      prompts: TestSuiteConfigSchema.shape.prompts.optional(),
    }).refine(
      (data) => {
        const hasTargets = data.targets !== undefined;
        const hasProviders = data.providers !== undefined;
        return (hasTargets && !hasProviders) || (!hasTargets && hasProviders);
      },
      {
        message: "Exactly one of 'targets' or 'providers' must be provided, but not both",
      },
    );
    const validationResult = UnifiedConfigSchemaWithoutPrompts.safeParse(renderedConfig);
    if (!validationResult.success) {
      logger.warn(
        `Invalid configuration file ${configPath}:\n${z.prettifyError(validationResult.error)}`,
      );
    }
    ret = renderedConfig;
  } else if (isJavascriptFile(configPath)) {
    // importModule normalizes ERR_MODULE_NOT_FOUND to ENOENT for missing files
    const imported = await importModule(configPath);

    // Render environment variable templates for JS configs too.
    // This ensures consistent behavior across config file types.
    const renderedConfig = renderConfigEnvTemplates(imported as UnifiedConfig);

    const validationResult = UnifiedConfigSchema.safeParse(renderedConfig);
    if (!validationResult.success) {
      logger.warn(
        `Invalid configuration file ${configPath}:\n${z.prettifyError(validationResult.error)}`,
      );
    }
    ret = renderedConfig;
  } else {
    throw new Error(`Unsupported configuration file format: ${ext}`);
  }

  if (ret.targets) {
    logger.debug(`Rewriting config.targets to config.providers`);
    ret.providers = ret.targets;
    delete ret.targets;
  }
  if (ret.plugins) {
    logger.debug(`Rewriting config.plugins to config.redteam.plugins`);
    ret.redteam = ret.redteam || {};
    ret.redteam.plugins = ret.plugins;
    delete ret.plugins;
  }
  if (ret.strategies) {
    logger.debug(`Rewriting config.strategies to config.redteam.strategies`);
    ret.redteam = ret.redteam || {};
    ret.redteam.strategies = ret.strategies;
    delete ret.strategies;
  }
  if (!ret.prompts) {
    logger.debug(`Setting default prompt because there is no \`prompts\` field`);
    const hasAnyPrompt =
      // Allow no tests
      !ret.tests ||
      // Allow any string
      typeof ret.tests === 'string' ||
      // Check the array for `prompt` vars
      (Array.isArray(ret.tests) &&
        ret.tests.some(
          (test) => isTestCaseWithVars(test) && Object.keys(test.vars || {}).includes('prompt'),
        ));

    if (!hasAnyPrompt) {
      logger.warn(
        `Warning: Expected top-level "prompts" property in config or a test variable named "prompt"`,
      );
    }
    ret.prompts = ['{{prompt}}'];
  }
  return ret;
}

export async function maybeReadConfig(configPath: string): Promise<UnifiedConfig | undefined> {
  try {
    return await readConfig(configPath);
  } catch (error) {
    // If file doesn't exist, return undefined
    // Note: readConfig normalizes ERR_MODULE_NOT_FOUND to ENOENT for missing JS/TS files
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
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
    const resolvedPath = path.resolve(process.cwd(), configPath);

    const globPaths = globSync(resolvedPath, {
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
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const configPath = configPaths[i];
    if (typeof config.tests === 'string') {
      const newTests = await readTests(config.tests, path.dirname(configPath));
      tests.push(...newTests);
    } else if (Array.isArray(config.tests)) {
      tests.push(...config.tests);
    } else if (config.tests && typeof config.tests === 'object' && 'path' in config.tests) {
      // Handle TestGeneratorConfig object
      const newTests = await readTests(config.tests, path.dirname(configPath));
      tests.push(...newTests);
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
    defaultTest: configs.reduce((prev: Partial<TestCase> | string | undefined, curr) => {
      // If any config has a string defaultTest (file reference), preserve it
      if (typeof curr.defaultTest === 'string') {
        return curr.defaultTest;
      }
      // If prev is already a string (file reference), keep it
      if (typeof prev === 'string') {
        return prev;
      }
      // If neither prev nor curr has defaultTest, return undefined
      if (!prev && !curr.defaultTest) {
        return undefined;
      }
      // Otherwise merge objects
      const currDefaultTest = typeof curr.defaultTest === 'object' ? curr.defaultTest : {};
      const prevObj = typeof prev === 'object' ? prev : {};
      return {
        ...prevObj,
        ...currDefaultTest,
        vars: { ...prevObj?.vars, ...currDefaultTest?.vars },
        assert: [...(prevObj?.assert || []), ...(currDefaultTest?.assert || [])],
        options: { ...prevObj?.options, ...currDefaultTest?.options },
        metadata: { ...prevObj?.metadata, ...currDefaultTest?.metadata },
      };
    }, undefined) as UnifiedConfig['defaultTest'],
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
      return sharingConfig ? sharingConfig.sharing : undefined;
    })(),
    tracing: configs.find((config) => config.tracing)?.tracing,
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
  type?: 'DatasetGeneration' | 'AssertionGeneration',
): Promise<{
  testSuite: TestSuite;
  config: Partial<UnifiedConfig>;
  basePath: string;
  commandLineOptions?: Partial<CommandLineOptions>;
}> {
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
    telemetry.record('feature_used', {
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

  // Get the raw defaultTest value which could be a string (file://), object (TestCase), or undefined
  const defaultTestRaw: any = fileConfig.defaultTest || defaultConfig.defaultTest;

  // Load defaultTest from file:// reference if needed
  let processedDefaultTest: Partial<TestCase> | undefined;
  if (typeof defaultTestRaw === 'string' && defaultTestRaw.startsWith('file://')) {
    // Set basePath in cliState temporarily for file resolution
    const originalBasePath = cliState.basePath;
    cliState.basePath = basePath;
    const loaded = await maybeLoadFromExternalFile(defaultTestRaw);
    cliState.basePath = originalBasePath;
    processedDefaultTest = loaded as Partial<TestCase>;
  } else if (defaultTestRaw) {
    processedDefaultTest = defaultTestRaw as Partial<TestCase>;
  }

  const config: Omit<UnifiedConfig, 'commandLineOptions'> = {
    tags: fileConfig.tags || defaultConfig.tags,
    description: cmdObj.description || fileConfig.description || defaultConfig.description,
    prompts: cmdObj.prompts || fileConfig.prompts || defaultConfig.prompts || [],
    providers: cmdObj.providers || fileConfig.providers || defaultConfig.providers || [],
    tests: cmdObj.tests || cmdObj.vars || fileConfig.tests || defaultConfig.tests || [],
    scenarios: fileConfig.scenarios || defaultConfig.scenarios,
    env: fileConfig.env || defaultConfig.env,
    sharing: getEnvBool('PROMPTFOO_DISABLE_SHARING')
      ? false
      : (fileConfig.sharing ?? defaultConfig.sharing),
    defaultTest: processedDefaultTest
      ? await readTest(processedDefaultTest, basePath, true)
      : undefined,
    derivedMetrics: fileConfig.derivedMetrics || defaultConfig.derivedMetrics,
    outputPath: cmdObj.output || fileConfig.outputPath || defaultConfig.outputPath,
    extensions: [
      ...(cmdObj.extension || []),
      ...(fileConfig.extensions || defaultConfig.extensions || []),
    ],
    metadata: fileConfig.metadata || defaultConfig.metadata,
    redteam: fileConfig.redteam || defaultConfig.redteam,
    tracing: fileConfig.tracing || defaultConfig.tracing,
    evaluateOptions: fileConfig.evaluateOptions || defaultConfig.evaluateOptions,
  };

  const hasPrompts = [config.prompts].flat().filter(Boolean).length > 0;
  const hasProviders = [config.providers].flat().filter(Boolean).length > 0;
  const hasConfigFile = Boolean(configPaths);

  if (!hasConfigFile && !hasPrompts && !hasProviders && !isCI()) {
    logger.warn(dedent`
      ${chalk.yellow.bold('⚠️  No promptfooconfig found')}

      ${chalk.white('Try running with:')}

      ${chalk.cyan(`${promptfooCommand('')} eval -c ${chalk.bold('path/to/promptfooconfig.yaml')}`)}

      ${chalk.white('Or create a config with:')}

      ${chalk.green(promptfooCommand('init'))}
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
    type !== 'AssertionGeneration' &&
    !hasProviders
  ) {
    logger.error('You must specify at least 1 provider (for example, openai:gpt-4.1)');
    process.exit(1);
  }

  invariant(Array.isArray(config.providers), 'providers must be an array');

  // Resolve provider configs: loads file:// references while preserving non-file providers.
  // This enables:
  // 1. Building the provider-prompt map with `prompts` filters from external files (#1307)
  // 2. Filtering by resolved provider ids/labels (not just file paths)
  // 3. Avoiding double file I/O (files are read once here, not again in loadApiProviders)
  const resolvedProviderConfigs = resolveProviderConfigs(config.providers, { basePath });

  // Filter providers BEFORE instantiation to avoid loading providers that won't be used.
  // Filtering on resolved configs allows matching by provider id/label from file-based providers.
  const filterOption = cmdObj.filterProviders || cmdObj.filterTargets;
  const filteredProviderConfigs = filterProviderConfigs(resolvedProviderConfigs, filterOption);

  if (
    filterOption &&
    Array.isArray(filteredProviderConfigs) &&
    filteredProviderConfigs.length === 0
  ) {
    logger.warn(
      `No providers matched the filter "${filterOption}". Check your --filter-providers/--filter-targets value.`,
    );
  }

  // Parse prompts, providers, and tests
  // Pass filtered resolved configs to avoid re-reading files
  const parsedPrompts = await readPrompts(config.prompts, cmdObj.prompts ? undefined : basePath);
  const parsedProviders = await loadApiProviders(filteredProviderConfigs, {
    env: config.env,
    basePath,
  });
  const parsedTests: TestCase[] = await readTests(
    config.tests || [],
    cmdObj.tests ? undefined : basePath,
  );

  // Parse testCases for each scenario
  if (
    fileConfig.scenarios &&
    (!Array.isArray(fileConfig.scenarios) || fileConfig.scenarios.length > 0)
  ) {
    fileConfig.scenarios = (await maybeLoadFromExternalFile(fileConfig.scenarios)) as Scenario[];
    // Flatten the scenarios array in case glob patterns were used
    fileConfig.scenarios = fileConfig.scenarios.flat();
    // Update config.scenarios with the flattened array
    config.scenarios = fileConfig.scenarios;
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

  // Build provider-prompt map using filtered resolved configs (not raw config with file:// strings)
  // This ensures that `prompts` filters from external provider files are respected (#1307)
  // and that the map is consistent with the filtered providers
  const parsedProviderPromptMap = readProviderPromptMap(
    { providers: filteredProviderConfigs },
    parsedPrompts,
  );

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
      ...(processedDefaultTest?.options || {}),
    },
    ...(processedDefaultTest || {}),
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
    tracing: config.tracing,
  };

  // Validate assertions in tests and defaultTest using Zod schema
  // Note: defaultTest can be a string (file://) reference, so only pass if it's an object
  validateAssertions(
    testSuite.tests || [],
    typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined,
  );

  // Validate provider references in tests and scenarios
  validateTestProviderReferences(
    testSuite.tests || [],
    testSuite.providers,
    typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined,
    testSuite.scenarios,
  );

  // Validate that all prompt references in tests exist
  validateTestPromptReferences(
    testSuite.tests || [],
    testSuite.prompts,
    typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined,
  );

  cliState.config = config;

  // Extract commandLineOptions from either explicit config files or default config
  let commandLineOptions = fileConfig.commandLineOptions || defaultConfig.commandLineOptions;

  // Resolve relative envPath(s) against the config file directory
  if (commandLineOptions?.envPath && basePath) {
    const envPaths = Array.isArray(commandLineOptions.envPath)
      ? commandLineOptions.envPath
      : [commandLineOptions.envPath];

    const resolvedPaths = envPaths.map((p) => (path.isAbsolute(p) ? p : path.resolve(basePath, p)));

    commandLineOptions = {
      ...commandLineOptions,
      // Keep as single string if only one path, array otherwise
      envPath: resolvedPaths.length === 1 ? resolvedPaths[0] : resolvedPaths,
    };
  }

  return {
    config,
    testSuite,
    basePath,
    commandLineOptions,
  };
}
