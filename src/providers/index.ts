import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import yaml from 'js-yaml';
import cliState from '../cliState';
import logger from '../logger';
import {
  getCloudDatabaseId,
  getProviderFromCloud,
  isCloudProvider,
  validateLinkedTargetId,
} from '../util/cloud';
import { maybeLoadConfigFromExternalFile } from '../util/file';
import { renderEnvOnlyInObject } from '../util/index';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { providerMap } from './registry';

import type { EnvOverrides } from '../types/env';
import type { LoadApiProviderContext, TestSuiteConfig } from '../types/index';
import type {
  ApiProvider,
  ProviderFunction,
  ProviderOptions,
  ProviderOptionsMap,
} from '../types/providers';

// FIXME(ian): Make loadApiProvider handle all the different provider types (string, ProviderOptions, ApiProvider, etc), rather than the callers.
export async function loadApiProvider(
  providerPath: string,
  context: LoadApiProviderContext = {},
): Promise<ApiProvider> {
  const { options = {}, basePath, env } = context;

  // Merge environment overrides: context.env (test suite level) is base,
  // options.env (provider-specific) takes precedence for per-provider customization
  const mergedEnv: EnvOverrides | undefined =
    env || options.env ? { ...env, ...options.env } : undefined;

  // Render ONLY environment variable templates at load time (e.g., {{ env.AZURE_ENDPOINT }})
  // This allows constructors to access real env values while preserving runtime templates
  // like {{ vars.* }} for per-test customization at callApi() time
  const renderedConfig = options.config
    ? renderEnvOnlyInObject(options.config, mergedEnv)
    : undefined;
  const renderedId = options.id ? renderEnvOnlyInObject(options.id, mergedEnv) : undefined;

  const providerOptions: ProviderOptions = {
    id: renderedId,
    config: {
      ...renderedConfig,
      basePath,
    },
    env: mergedEnv,
  };

  // Validate linkedTargetId if present (Promptfoo Cloud feature)
  if (providerOptions.config?.linkedTargetId) {
    await validateLinkedTargetId(providerOptions.config.linkedTargetId);
  }

  const renderedProviderPath = getNunjucksEngine().renderString(
    providerPath,
    mergedEnv ? { env: mergedEnv } : {},
  );

  if (isCloudProvider(renderedProviderPath)) {
    const cloudDatabaseId = getCloudDatabaseId(renderedProviderPath);

    const cloudProvider = await getProviderFromCloud(cloudDatabaseId);
    if (isCloudProvider(cloudProvider.id)) {
      throw new Error(
        `This cloud provider ${cloudDatabaseId} points to another cloud provider: ${cloudProvider.id}. This is not allowed. A cloud provider should point to a specific provider, not another cloud provider.`,
      );
    }

    // Merge local config overrides with cloud provider config
    // Local config takes precedence to allow per-eval customization
    const mergedOptions: ProviderOptions = {
      ...cloudProvider,
      config: {
        ...cloudProvider.config,
        ...options.config,
      },
      // Allow local overrides for these fields
      label: options.label ?? cloudProvider.label,
      transform: options.transform ?? cloudProvider.transform,
      delay: options.delay ?? cloudProvider.delay,
      prompts: options.prompts ?? cloudProvider.prompts,
      inputs: options.inputs ?? cloudProvider.inputs,
      // Merge all three env sources: context (base) -> cloud -> local (highest priority)
      env: {
        ...env, // Context env (from testSuite.env - proxies, tracing IDs, etc.)
        ...cloudProvider.env, // Cloud provider env overrides context
        ...options.env, // Local env overrides everything
      },
    };

    logger.debug(
      `[Cloud Provider] Loaded ${cloudDatabaseId}, resolved to ${cloudProvider.id}${options.config ? ' with local config overrides' : ''}`,
    );

    const mergedContext = {
      ...context,
      options: mergedOptions,
      env: mergedOptions.env,
    };

    return loadApiProvider(cloudProvider.id, mergedContext);
  }

  if (
    renderedProviderPath.startsWith('file://') &&
    (renderedProviderPath.endsWith('.yaml') ||
      renderedProviderPath.endsWith('.yml') ||
      renderedProviderPath.endsWith('.json'))
  ) {
    const filePath = renderedProviderPath.slice('file://'.length);
    const modulePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(basePath || process.cwd(), filePath);
    const rawContent = yaml.load(fs.readFileSync(modulePath, 'utf8'));
    const fileContent = maybeLoadConfigFromExternalFile(rawContent) as ProviderOptions;
    invariant(fileContent, `Provider config ${filePath} is undefined`);

    // If fileContent is an array, it contains multiple providers
    if (Array.isArray(fileContent)) {
      // This is handled by loadApiProviders, so we'll throw an error here
      throw new Error(
        `Multiple providers found in ${filePath}. Use loadApiProviders instead of loadApiProvider.`,
      );
    }

    invariant(fileContent.id, `Provider config ${filePath} must have an id`);
    logger.info(`Loaded provider ${fileContent.id} from ${filePath}`);

    // Merge file's env with context.env - context.env takes precedence
    // This allows callers to override file-defined defaults
    const mergedFileEnv: EnvOverrides | undefined =
      fileContent.env || env ? { ...fileContent.env, ...env } : undefined;

    return loadApiProvider(fileContent.id, {
      basePath,
      options: {
        ...fileContent,
        env: mergedFileEnv,
      },
    });
  }

  for (const factory of providerMap) {
    if (factory.test(renderedProviderPath)) {
      const ret = await factory.create(renderedProviderPath, providerOptions, context);
      ret.transform = options.transform;
      ret.delay = options.delay;
      ret.inputs = options.inputs;
      ret.label ||= getNunjucksEngine().renderString(
        String(options.label || ''),
        mergedEnv ? { env: mergedEnv } : {},
      );
      return ret;
    }
  }

  const errorMessage = dedent`
    Could not identify provider: ${chalk.bold(providerPath)}.

    ${chalk.white(dedent`
      Please check your configuration and ensure the provider is correctly specified.

      For more information on supported providers, visit: `)} ${chalk.cyan('https://promptfoo.dev/docs/providers/')}
  `;
  logger.error(errorMessage);
  throw new Error(errorMessage);
}

/**
 * Interface for loadApiProvider options that includes both required and optional properties
 */
interface LoadApiProviderOptions {
  options?: ProviderOptions;
  env?: any;
  basePath?: string;
}

/**
 * Helper function to resolve provider from various formats (string, object, function)
 * Uses providerMap for optimization and falls back to loadApiProvider with proper context
 */
export async function resolveProvider(
  provider: any,
  providerMap: Record<string, ApiProvider>,
  context: { env?: any; basePath?: string } = {},
): Promise<ApiProvider> {
  // Guard clause for null or undefined provider values
  if (provider == null) {
    throw new Error('Provider cannot be null or undefined');
  }

  if (typeof provider === 'string') {
    // Check providerMap first for optimization, then fall back to loadApiProvider with context
    if (providerMap[provider]) {
      return providerMap[provider];
    }
    const loadOptions: LoadApiProviderOptions = {};
    if (context.env) {
      loadOptions.env = context.env;
    }
    if (context.basePath) {
      loadOptions.basePath = context.basePath;
    }
    return await loadApiProvider(provider, loadOptions);
  } else if (typeof provider === 'object') {
    const casted = provider as ProviderOptions;
    invariant(casted.id, 'Provider object must have an id');
    const loadOptions: LoadApiProviderOptions = { options: casted };
    if (context.env) {
      loadOptions.env = context.env;
    }
    if (context.basePath) {
      loadOptions.basePath = context.basePath;
    }
    return await loadApiProvider(casted.id, loadOptions);
  } else if (typeof provider === 'function') {
    // Handle function providers directly instead of passing to loadApiProvider
    return {
      id: () => provider.label ?? 'custom-function',
      callApi: provider,
    };
  } else {
    throw new Error('Invalid provider type');
  }
}

/**
 * Helper function to load provider configs from a file path without instantiating them.
 * Returns the raw ProviderOptions with all fields (including `prompts`) intact.
 */
function loadProviderConfigsFromFile(filePath: string, basePath?: string): ProviderOptions[] {
  const relativePath = filePath.slice('file://'.length);
  const modulePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(basePath || process.cwd(), relativePath);

  const rawContent = yaml.load(fs.readFileSync(modulePath, 'utf8'));
  const fileContent = maybeLoadConfigFromExternalFile(rawContent) as
    | ProviderOptions
    | ProviderOptions[];
  invariant(fileContent, `Provider config ${relativePath} is undefined`);

  return [fileContent].flat() as ProviderOptions[];
}

/**
 * Checks if a string is a file:// reference to a YAML/JSON config file.
 */
function isFileReference(str: string): boolean {
  return (
    str.startsWith('file://') &&
    (str.endsWith('.yaml') || str.endsWith('.yml') || str.endsWith('.json'))
  );
}

/**
 * Resolves raw provider configurations, loading file:// references.
 * Preserves non-file providers (strings, functions) in their original form
 * so they can be properly handled by loadApiProviders.
 *
 * This is used to:
 * 1. Build the provider-prompt map (respecting `prompts` filters from external files)
 * 2. Enable --filter-providers to match resolved provider ids/labels from files
 * 3. Pass to loadApiProviders without re-reading files
 */
export function resolveProviderConfigs(
  providerPaths: TestSuiteConfig['providers'],
  options: { basePath?: string } = {},
): TestSuiteConfig['providers'] {
  const { basePath } = options;

  if (typeof providerPaths === 'string') {
    if (isFileReference(providerPaths)) {
      return loadProviderConfigsFromFile(providerPaths, basePath);
    }
    // Keep non-file strings as-is for loadApiProviders to handle
    return providerPaths;
  }

  if (typeof providerPaths === 'function') {
    // Keep functions as-is for loadApiProviders to handle
    return providerPaths;
  }

  if (!Array.isArray(providerPaths)) {
    return providerPaths;
  }

  const results: (string | ProviderFunction | ProviderOptions | ProviderOptionsMap)[] = [];

  for (const provider of providerPaths) {
    if (typeof provider === 'string') {
      if (isFileReference(provider)) {
        // Resolve file:// references to ProviderOptions[]
        results.push(...loadProviderConfigsFromFile(provider, basePath));
      } else {
        // Keep non-file strings as-is
        results.push(provider);
      }
    } else if (typeof provider === 'function') {
      // Keep functions as-is
      results.push(provider);
    } else {
      // Keep ProviderOptions and ProviderOptionsMap as-is
      results.push(provider);
    }
  }

  return results;
}

/**
 * Helper function to load providers from a file path.
 * Uses loadProviderConfigsFromFile to read configs, then instantiates them.
 */
async function loadProvidersFromFile(
  filePath: string,
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  const { basePath, env } = options;
  const configs = loadProviderConfigsFromFile(filePath, basePath);
  const relativePath = filePath.slice('file://'.length);

  return Promise.all(
    configs.map((config) => {
      invariant(config.id, `Provider config in ${relativePath} must have an id`);
      return loadApiProvider(config.id, { options: config, basePath, env });
    }),
  );
}

export async function loadApiProviders(
  providerPaths: TestSuiteConfig['providers'],
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  const { basePath } = options;

  const env = {
    ...cliState.config?.env,
    ...options.env,
  };

  if (typeof providerPaths === 'string') {
    // Check if the string path points to a file
    if (
      providerPaths.startsWith('file://') &&
      (providerPaths.endsWith('.yaml') ||
        providerPaths.endsWith('.yml') ||
        providerPaths.endsWith('.json'))
    ) {
      return loadProvidersFromFile(providerPaths, { basePath, env });
    }
    return [await loadApiProvider(providerPaths, { basePath, env })];
  } else if (typeof providerPaths === 'function') {
    return [
      {
        id: () => 'custom-function',
        callApi: providerPaths,
      },
    ];
  } else if (Array.isArray(providerPaths)) {
    const providersArrays = await Promise.all(
      providerPaths.map(async (provider, idx) => {
        if (typeof provider === 'string') {
          if (
            provider.startsWith('file://') &&
            (provider.endsWith('.yaml') || provider.endsWith('.yml') || provider.endsWith('.json'))
          ) {
            return loadProvidersFromFile(provider, { basePath, env });
          }
          return [await loadApiProvider(provider, { basePath, env })];
        }
        if (typeof provider === 'function') {
          return [
            {
              id: () => provider.label ?? `custom-function-${idx}`,
              callApi: provider,
            },
          ];
        }
        if (provider.id) {
          // List of ProviderConfig objects
          return [
            await loadApiProvider((provider as ProviderOptions).id!, {
              options: provider,
              basePath,
              env,
            }),
          ];
        }
        // List of { id: string, config: ProviderConfig } objects
        const id = Object.keys(provider)[0];
        const providerObject = (provider as ProviderOptionsMap)[id];
        const context = { ...providerObject, id: providerObject.id || id };
        return [await loadApiProvider(id, { options: context, basePath, env })];
      }),
    );
    return providersArrays.flat();
  }
  throw new Error('Invalid providers list');
}

/**
 * Given a `providerPaths` object, resolves a list of provider IDs. Mimics the waterfall behavior
 * of `loadApiProviders` to ensure consistent behavior given the shape of the `providerPaths`
 * object.
 *
 * @param providerPaths - The list of providers to get the IDs of.
 * @returns The IDs of the providers in the providerPaths list.
 */
function getProviderIdsFromFile(providerPath: string): string[] {
  const basePath = cliState.basePath || process.cwd();
  const configs = loadProviderConfigsFromFile(providerPath, basePath);
  const relativePath = providerPath.slice('file://'.length);
  return configs.map((config) => {
    invariant(config.id, `Provider config in ${relativePath} must have an id`);
    return config.id;
  });
}

export function getProviderIds(providerPaths: TestSuiteConfig['providers']): string[] {
  if (typeof providerPaths === 'string') {
    if (isFileReference(providerPaths)) {
      return getProviderIdsFromFile(providerPaths);
    }
    return [providerPaths];
  } else if (typeof providerPaths === 'function') {
    return ['custom-function'];
  } else if (Array.isArray(providerPaths)) {
    return providerPaths.flatMap((provider, idx) => {
      if (typeof provider === 'string') {
        if (isFileReference(provider)) {
          return getProviderIdsFromFile(provider);
        }
        return provider;
      }
      if (typeof provider === 'function') {
        return provider.label || `custom-function-${idx}`;
      }
      if ((provider as ProviderOptions).id) {
        return (provider as ProviderOptions).id!;
      }
      const id = Object.keys(provider)[0];
      const providerObject = (provider as ProviderOptionsMap)[id];
      return providerObject.id || id;
    });
  }
  throw new Error('Invalid providers list');
}
