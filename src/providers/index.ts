import chalk from 'chalk';
import dedent from 'dedent';
import cliState from '../cliState';
import logger from '../logger';
import {
  getCloudDatabaseId,
  getProviderFromCloud,
  isCloudProvider,
  validateLinkedTargetId,
} from '../util/cloud';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import {
  isProviderConfigFileReference,
  loadProviderConfigsFromFile,
  normalizeProviderRef,
  readProviderConfigFile,
} from '../util/providerRef';
import { renderEnvOnlyInObject } from '../util/render';
import { sanitizeObject } from '../util/sanitizer';
import { providerMap } from './registry';

import type { EnvOverrides } from '../types/env';
import type { LoadApiProviderContext, TestSuiteConfig } from '../types/index';
import type {
  ApiProvider,
  ProviderFunction,
  ProviderOptions,
  ProviderOptionsMap,
} from '../types/providers';

function describeInvalidProvider(provider: unknown): string {
  try {
    const sanitizedProvider = sanitizeObject(provider, {
      context: 'invalid provider config',
      throwOnError: true,
    });
    return (safeJsonStringify(sanitizedProvider) ?? Object.prototype.toString.call(provider)).slice(
      0,
      200,
    );
  } catch (err) {
    logger.debug('Failed to sanitize invalid provider for error message', { error: err });
    return Object.prototype.toString.call(provider);
  }
}

// NOTE: loadApiProvider only accepts string paths. Callers use normalizeProviderRef
// (src/util/providerRef.ts) to classify provider shapes before calling this function.
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

  // Render only env templates in provider path to avoid blanking unresolved placeholders.
  // This keeps behavior consistent with provider id/config rendering and file:// provider refs.
  const renderedProviderPath = renderEnvOnlyInObject(providerPath, mergedEnv);

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

  if (isProviderConfigFileReference(renderedProviderPath)) {
    const { configs, relativePath, wasArray } = readProviderConfigFile(
      renderedProviderPath,
      basePath,
    );
    const fileContent = configs[0];
    invariant(fileContent, `Provider config file ${relativePath} contains no providers`);

    // Multi-provider files must go through loadApiProviders
    if (wasArray) {
      throw new Error(
        `Multiple providers found in ${relativePath}. Use loadApiProviders instead of loadApiProvider.`,
      );
    }

    invariant(fileContent.id, `Provider config ${relativePath} must have an id`);
    logger.info('Loaded provider from config file', {
      providerConfigPath: relativePath,
      providerId: fileContent.id,
    });

    // Merge file's env with context.env - context.env takes precedence
    // This allows callers to override file-defined defaults
    const mergedFileEnv: EnvOverrides | undefined =
      fileContent.env || mergedEnv ? { ...fileContent.env, ...mergedEnv } : undefined;

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
      ret.label ||= renderEnvOnlyInObject(options.label || '', mergedEnv);
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
 * Helper function to resolve provider from various formats (string, object, function).
 * Checks the resolved provider cache first and falls back to loadApiProvider for uncached providers.
 */
export async function resolveProvider(
  provider: any,
  resolvedProviders: Record<string, ApiProvider>,
  context: { env?: any; basePath?: string } = {},
): Promise<ApiProvider> {
  // Guard clause for null or undefined provider values
  if (provider == null) {
    throw new Error('Provider cannot be null or undefined');
  }

  if (typeof provider === 'string') {
    if (resolvedProviders[provider]) {
      return resolvedProviders[provider];
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
    const descriptor = normalizeProviderRef(provider);
    invariant(
      descriptor.kind === 'options' || descriptor.kind === 'map',
      `Provider object must have an 'id' field or be a ProviderOptionsMap (e.g. { "openai:responses:gpt-5.4": { config: ... } }). Got: ${describeInvalidProvider(provider)}`,
    );
    const loadOptions: LoadApiProviderOptions = { options: descriptor.loadOptions };
    if (context.env) {
      loadOptions.env = context.env;
    }
    if (context.basePath) {
      loadOptions.basePath = context.basePath;
    }
    return await loadApiProvider(descriptor.loadProviderPath, loadOptions);
  } else if (typeof provider === 'function') {
    const descriptor = normalizeProviderRef(provider);
    // Handle function providers directly instead of passing to loadApiProvider
    return {
      id: () => descriptor.id,
      callApi: provider,
    };
  } else {
    throw new Error('Invalid provider type');
  }
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
    if (isProviderConfigFileReference(providerPaths)) {
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
    const descriptor = normalizeProviderRef(provider);
    if (descriptor.kind === 'file') {
      // Resolve file:// references to ProviderOptions[]
      results.push(...loadProviderConfigsFromFile(descriptor.loadProviderPath, basePath));
    } else if (descriptor.kind === 'named') {
      // Keep non-file strings as-is
      results.push(descriptor.loadProviderPath);
    } else {
      // Keep functions, ProviderOptions, ProviderOptionsMap, and unrecognized objects as-is
      // for downstream validation by loadApiProviders
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
    if (isProviderConfigFileReference(providerPaths)) {
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
        const descriptor = normalizeProviderRef(provider, { index: idx });
        switch (descriptor.kind) {
          case 'file':
            return loadProvidersFromFile(descriptor.loadProviderPath, { basePath, env });
          case 'named':
            return [await loadApiProvider(descriptor.loadProviderPath, { basePath, env })];
          case 'function':
            return [
              {
                id: () => descriptor.id,
                callApi: provider as ProviderFunction,
              },
            ];
          case 'options':
          case 'map':
            return [
              await loadApiProvider(descriptor.loadProviderPath, {
                options: descriptor.loadOptions,
                basePath,
                env,
              }),
            ];
          case 'unknown':
            throw new Error(
              `Invalid provider at index ${idx}: expected a provider id string, ProviderOptions with an 'id' field, or a ProviderOptionsMap (e.g. { "openai:responses:gpt-5.4": { config: ... } }). Got: ${describeInvalidProvider(provider)}`,
            );
          default: {
            const _exhaustive: never = descriptor;
            throw new Error(`Unhandled provider kind: ${(_exhaustive as any).kind}`);
          }
        }
      }),
    );
    return providersArrays.flat();
  }
  throw new Error('Invalid providers list');
}

/**
 * Reads a provider config file and returns the IDs of all providers defined in it.
 * Requires every provider entry to have an `id` field.
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

/**
 * Extracts provider IDs from a provider paths configuration without instantiating providers.
 * Handles strings, functions, and arrays of mixed provider types.
 * For file:// references, reads the config file to extract IDs.
 */
export function getProviderIds(providerPaths: TestSuiteConfig['providers']): string[] {
  if (typeof providerPaths === 'string') {
    if (isProviderConfigFileReference(providerPaths)) {
      return getProviderIdsFromFile(providerPaths);
    }
    return [providerPaths];
  } else if (typeof providerPaths === 'function') {
    return ['custom-function'];
  } else if (Array.isArray(providerPaths)) {
    return providerPaths.flatMap((provider, idx) => {
      const descriptor = normalizeProviderRef(provider, { index: idx });
      if (descriptor.kind === 'file') {
        return getProviderIdsFromFile(descriptor.loadProviderPath);
      }
      if (descriptor.kind === 'unknown') {
        throw new Error(
          `Invalid provider at index ${idx}: expected a provider id string, ProviderOptions with an 'id' field, or a ProviderOptionsMap. Got: ${describeInvalidProvider(provider)}`,
        );
      }
      return descriptor.id;
    });
  }
  throw new Error('Invalid providers list');
}
