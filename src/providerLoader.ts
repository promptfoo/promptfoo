import chalk from 'chalk';
import dedent from 'dedent';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import cliState from './cliState';
import logger from './logger';
// Import all providers
import * as providers from './providers';
import type { LoadApiProviderContext, TestSuiteConfig } from './types';
import type { EnvOverrides } from './types/env';
import type { ApiProvider, ProviderOptions, ProviderOptionsMap } from './types/providers';
import invariant from './util/invariant';
import { getNunjucksEngine } from './util/templates';

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

  providerPath = getNunjucksEngine().renderString(providerPath, {});

  let ret: ApiProvider;

  try {
    // Provider loading logic moved from providers.ts
    if (
      providerPath.startsWith('file://') &&
      (providerPath.endsWith('.yaml') ||
        providerPath.endsWith('.yml') ||
        providerPath.endsWith('.json'))
    ) {
      const filePath = providerPath.slice('file://'.length);
      const modulePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(basePath || process.cwd(), filePath);
      let fileContent: ProviderOptions;
      if (providerPath.endsWith('.json')) {
        fileContent = JSON.parse(fs.readFileSync(modulePath, 'utf8')) as ProviderOptions;
      } else {
        fileContent = yaml.load(fs.readFileSync(modulePath, 'utf8')) as ProviderOptions;
      }
      invariant(fileContent, `Provider config ${filePath} is undefined`);
      invariant(fileContent.id, `Provider config ${filePath} must have an id`);
      logger.info(`Loaded provider ${fileContent.id} from ${filePath}`);
      ret = await loadApiProvider(fileContent.id, { ...context, options: fileContent });
    } else if (providerPath === 'echo') {
      ret = {
        id: () => 'echo',
        callApi: async (input: string) => ({ output: input }),
      };
    } else if (providerPath.startsWith('exec:')) {
      // Load script module
      const scriptPath = providerPath.split(':')[1];
      ret = new providers.ScriptCompletionProvider(scriptPath, providerOptions);
    } else if (
      providerPath.startsWith('python:') ||
      (providerPath.startsWith('file://') &&
        (providerPath.endsWith('.py') || providerPath.includes('.py:')))
    ) {
      const scriptPath = providerPath.startsWith('file://')
        ? providerPath.slice('file://'.length)
        : providerPath.split(':').slice(1).join(':');
      ret = new providers.PythonProvider(scriptPath, providerOptions);
    } else if (providerPath.startsWith('openai:')) {
      // Load OpenAI module
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      if (modelType === 'chat') {
        ret = new providers.OpenAiChatCompletionProvider(
          modelName || 'gpt-4o-mini',
          providerOptions,
        );
      } else if (modelType === 'embedding' || modelType === 'embeddings') {
        ret = new providers.OpenAiEmbeddingProvider(
          modelName || 'text-embedding-3-large',
          providerOptions,
        );
      } else if (modelType === 'completion') {
        ret = new providers.OpenAiCompletionProvider(
          modelName || 'gpt-3.5-turbo-instruct',
          providerOptions,
        );
      } else if (modelType === 'moderation') {
        ret = new providers.OpenAiModerationProvider(
          modelName || 'omni-moderation-latest',
          providerOptions,
        );
      } else if (
        providers.OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelType)
      ) {
        ret = new providers.OpenAiChatCompletionProvider(modelType, providerOptions);
      } else if (
        providers.OpenAiCompletionProvider.OPENAI_COMPLETION_MODEL_NAMES.includes(modelType)
      ) {
        ret = new providers.OpenAiCompletionProvider(modelType, providerOptions);
      } else if (modelType === 'assistant') {
        ret = new providers.OpenAiAssistantProvider(modelName, providerOptions);
      } else if (modelType === 'image') {
        ret = new providers.OpenAiImageProvider(modelName, providerOptions);
      } else {
        // Assume user did not provide model type, and it's a chat model
        logger.warn(
          `Unknown OpenAI model type: ${modelType}. Treating it as a chat model. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>, openai:embeddings:<model name>, openai:image:<model name>`,
        );
        ret = new providers.OpenAiChatCompletionProvider(modelType, providerOptions);
      }
    } else {
      // Default case - throw error for unknown provider
      throw new Error(dedent`
        Could not identify provider: ${chalk.bold(providerPath)}.

        ${chalk.white(dedent`
          Please check your configuration and ensure the provider is correctly specified.

          For more information on supported providers, visit: `)} ${chalk.cyan('https://promptfoo.dev/docs/providers/')}
      `);
    }

    // Apply common properties
    ret.transform = options.transform;
    ret.delay = options.delay;
    ret.label ||= getNunjucksEngine().renderString(String(options.label || ''), {});

    return ret;
  } catch (error) {
    logger.error(`Error loading provider: ${error}`);
    throw error;
  }
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
        } else if (typeof provider === 'function') {
          return {
            id: provider.label ? () => provider.label! : () => `custom-function-${idx}`,
            callApi: provider,
          };
        } else if (provider.id) {
          // List of ProviderConfig objects
          return loadApiProvider((provider as ProviderOptions).id!, {
            options: provider,
            basePath,
            env,
          });
        } else {
          // List of { id: string, config: ProviderConfig } objects
          const id = Object.keys(provider)[0];
          const providerObject = (provider as ProviderOptionsMap)[id];
          const context = { ...providerObject, id: providerObject.id || id };
          return loadApiProvider(id, { options: context, basePath, env });
        }
      }),
    );
  }
  throw new Error('Invalid providers list');
}
