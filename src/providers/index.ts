import chalk from 'chalk';
import dedent from 'dedent';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import cliState from '../cliState';
import logger from '../logger';
import type { LoadApiProviderContext, TestSuiteConfig } from '../types';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions, ProviderOptionsMap } from '../types/providers';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { providerMap } from './registry';

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
    let fileContent: ProviderOptions;
    if (renderedProviderPath.endsWith('.json')) {
      fileContent = JSON.parse(fs.readFileSync(modulePath, 'utf8')) as ProviderOptions;
    } else {
      fileContent = yaml.load(fs.readFileSync(modulePath, 'utf8')) as ProviderOptions;
    }
    invariant(fileContent, `Provider config ${filePath} is undefined`);
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

export async function loadApiProviders(
  providerPaths: TestSuiteConfig['providers'],
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  const { basePath } = options;
  const env = options.env || cliState.config?.env;
  if (typeof providerPaths === 'string') {
    return [await loadApiProvider(providerPaths, { basePath, env })];
  } else if (typeof providerPaths === 'function') {
    return [
      {
        id: () => 'custom-function',
        callApi: providerPaths,
      },
    ];
  } else if (Array.isArray(providerPaths)) {
    return Promise.all(
      providerPaths.map((provider, idx) => {
        if (typeof provider === 'string') {
          return loadApiProvider(provider, { basePath, env });
        }
        if (typeof provider === 'function') {
          return {
            id: provider.label ? () => provider.label! : () => `custom-function-${idx}`,
            callApi: provider,
          };
        }
        if (provider.id) {
          // List of ProviderConfig objects
          return loadApiProvider((provider as ProviderOptions).id!, {
            options: provider,
            basePath,
            env,
          });
        }
        // List of { id: string, config: ProviderConfig } objects
        const id = Object.keys(provider)[0];
        const providerObject = (provider as ProviderOptionsMap)[id];
        const context = { ...providerObject, id: providerObject.id || id };
        return loadApiProvider(id, { options: context, basePath, env });
      }),
    );
  }
  throw new Error('Invalid providers list');
}
