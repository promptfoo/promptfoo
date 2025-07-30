import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import yaml from 'js-yaml';
import cliState from '../cliState';
import logger from '../logger';
import { getCloudDatabaseId, getProviderFromCloud, isCloudProvider } from '../util/cloud';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { providerMap } from './registry';

import type { LoadApiProviderContext, TestSuiteConfig } from '../types';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions, ProviderOptionsMap } from '../types/providers';

// FIXME(ian): Make loadApiProvider handle all the different provider types (string, ProviderOptions, ApiProvider, etc), rather than the callers.
export async function loadApiProvider(
  providerPath: string,
  context: LoadApiProviderContext = {},
): Promise<ApiProvider> {
  const { options = {}, basePath, env } = context;
  const providerOptions: ProviderOptions = {
    id: options.id,
    config: {
      ...options.config,
      basePath,
    },
    env,
  };

  const renderedProviderPath = getNunjucksEngine().renderString(providerPath, {});

  if (isCloudProvider(renderedProviderPath)) {
    const cloudDatabaseId = getCloudDatabaseId(renderedProviderPath);

    const provider = await getProviderFromCloud(cloudDatabaseId);
    if (isCloudProvider(provider.id)) {
      throw new Error(
        `This cloud provider ${cloudDatabaseId} points to another cloud provider: ${provider.id}. This is not allowed. A cloud provider should point to a specific provider, not another cloud provider.`,
      );
    }
    return loadApiProvider(provider.id, { ...context, options: provider });
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
    const fileContent = yaml.load(fs.readFileSync(modulePath, 'utf8')) as ProviderOptions;
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
    return loadApiProvider(fileContent.id, { ...context, options: fileContent });
  }

  for (const factory of providerMap) {
    if (factory.test(renderedProviderPath)) {
      const ret = await factory.create(renderedProviderPath, providerOptions, context);
      ret.transform = options.transform;
      ret.delay = options.delay;
      ret.label ||= getNunjucksEngine().renderString(String(options.label || ''), {});
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
}

/**
 * Helper function to resolve provider from various formats (string, object, function)
 * Uses providerMap for optimization and falls back to loadApiProvider with proper context
 */
export async function resolveProvider(
  provider: any,
  providerMap: Record<string, ApiProvider>,
  context: { env?: any } = {},
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
    return context.env
      ? await loadApiProvider(provider, { env: context.env })
      : await loadApiProvider(provider);
  } else if (typeof provider === 'object') {
    const casted = provider as ProviderOptions;
    invariant(casted.id, 'Provider object must have an id');
    const loadOptions: LoadApiProviderOptions = { options: casted };
    if (context.env) {
      loadOptions.env = context.env;
    }
    return await loadApiProvider(casted.id, loadOptions);
  } else if (typeof provider === 'function') {
    return context.env
      ? await loadApiProvider(provider, { env: context.env })
      : await loadApiProvider(provider);
  } else {
    throw new Error('Invalid provider type');
  }
}

/**
 * Helper function to load providers from a file path.
 * This can handle both single provider and multiple providers in a file.
 */
async function loadProvidersFromFile(
  filePath: string,
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  const { basePath, env } = options;
  const relativePath = filePath.slice('file://'.length);
  const modulePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(basePath || process.cwd(), relativePath);

  const fileContent = yaml.load(fs.readFileSync(modulePath, 'utf8')) as
    | ProviderOptions
    | ProviderOptions[];
  invariant(fileContent, `Provider config ${relativePath} is undefined`);

  const configs = [fileContent].flat() as ProviderOptions[];
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
              id: provider.label ? () => provider.label! : () => `custom-function-${idx}`,
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
export function getProviderIds(providerPaths: TestSuiteConfig['providers']): string[] {
  if (typeof providerPaths === 'string') {
    return [providerPaths];
  } else if (typeof providerPaths === 'function') {
    return ['custom-function'];
  } else if (Array.isArray(providerPaths)) {
    return providerPaths.map((provider, idx) => {
      if (typeof provider === 'string') {
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
