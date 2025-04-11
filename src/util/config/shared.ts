import $RefParser from '@apidevtools/json-schema-ref-parser';
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import { fromError } from 'zod-validation-error';
import { getEnvBool } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import { UnifiedConfigSchema, type UnifiedConfig, type ProviderOptions } from '../../types';
import { isJavascriptFile } from '../../util/file';

/**
 * Dereferences a configuration object, resolving $ref values.
 * Returns the original config if PROMPTFOO_DISABLE_REF_PARSER is set.
 */
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
 * Reads a configuration file and handles legacy format conversions.
 *
 * @param configPath - The path to the configuration file.
 * @returns A Promise that resolves to the configuration object.
 */
export async function readConfigFile(configPath: string): Promise<UnifiedConfig> {
  let ret: UnifiedConfig & {
    targets?: UnifiedConfig['providers'];
    plugins?: any[];
    strategies?: any[];
  };

  const ext = path.parse(configPath).ext;
  if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
    const rawConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) ?? {};
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    // Validator requires `prompts`, but prompts is not actually required for redteam.
    const UnifiedConfigSchemaWithoutPrompts = UnifiedConfigSchema.innerType()
      .innerType()
      .extend({ prompts: UnifiedConfigSchema.innerType().innerType().shape.prompts.optional() });
    const validationResult = UnifiedConfigSchemaWithoutPrompts.safeParse(dereferencedConfig);
    if (!validationResult.success) {
      logger.warn(
        `Invalid configuration file ${configPath}:\n${fromError(validationResult.error).message}`,
      );
    }
    ret = dereferencedConfig;
  } else if (isJavascriptFile(configPath)) {
    const imported = await importModule(configPath);
    const validationResult = UnifiedConfigSchema.safeParse(imported);
    if (!validationResult.success) {
      logger.warn(
        `Invalid configuration file ${configPath}:\n${fromError(validationResult.error).message}`,
      );
    }
    ret = imported as UnifiedConfig;
  } else {
    throw new Error(`Unsupported configuration file format: ${ext}`);
  }

  // Handle legacy config formats
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
          (test) => typeof test === 'object' && Object.keys(test.vars || {}).includes('prompt'),
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

/**
 * Checks if a configuration file exists and reads it if present.
 *
 * @param configPath - The path to the configuration file.
 * @returns A Promise that resolves to the configuration object, or undefined if the file doesn't exist.
 */
export async function maybeReadConfig(configPath: string): Promise<UnifiedConfig | undefined> {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return readConfigFile(configPath);
}
