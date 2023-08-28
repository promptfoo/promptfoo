import path from 'path';

import {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  OpenAiEmbeddingProvider,
} from './providers/openai';
import { AnthropicCompletionProvider } from './providers/anthropic';
import { ReplicateProvider } from './providers/replicate';
import { LocalAiCompletionProvider, LocalAiChatProvider } from './providers/localai';
import { LlamaProvider } from './providers/llama';
import { OllamaProvider } from './providers/ollama';
import { WebhookProvider } from './providers/webhook';
import { ScriptCompletionProvider } from './providers/scriptCompletion';
import {
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
} from './providers/azureopenai';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderOptions,
  ProviderFunction,
  ProviderId,
  ProviderOptionsMap,
} from './types';

export async function loadApiProviders(
  providerPaths:
    | ProviderId
    | ProviderId[]
    | ProviderOptionsMap[]
    | ProviderOptions[]
    | ProviderFunction,
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  if (typeof providerPaths === 'string') {
    return [await loadApiProvider({ providerPath: providerPaths, basePath: options.basePath })];
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
          return loadApiProvider({ providerPath: provider, basePath: options.basePath });
        } else if (typeof provider === 'function') {
          return {
            id: () => `custom-function-${idx}`,
            callApi: provider,
          };
        } else if (provider.id) {
          // List of ProviderConfig objects
          return loadApiProvider({ providerPath: (provider as ProviderOptions).id!, options: provider, basePath: options.basePath });
        } else {
          // List of { id: string, config: ProviderConfig } objects
          const id = Object.keys(provider)[0];
          const providerObject = (provider as ProviderOptionsMap)[id];
          const context = { ...providerObject, id: providerObject.id || id };
          return loadApiProvider({ providerPath: id, options: context, basePath: options.basePath });
        }
      }),
    );
  }
  throw new Error('Invalid providers list');
}

export async function loadApiProvider({
  providerPath,
  options = {},
  basePath,
}: {
  providerPath: string;
  options?: ProviderOptions;
  basePath?: string;
}): Promise<ApiProvider> {
  if (providerPath?.startsWith('exec:')) {
    // Load script module
    const scriptPath = providerPath.split(':')[1];
    return new ScriptCompletionProvider(scriptPath, {
      id: `exec:${scriptPath}`,
      config: { basePath },
    });
  } else if (providerPath?.startsWith('openai:')) {
    // Load OpenAI module
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits[2];

    if (modelType === 'chat') {
      return new OpenAiChatCompletionProvider(
        modelName || 'gpt-3.5-turbo',
        options.config,
        options.id,
      );
    } else if (modelType === 'embedding') {
      return new OpenAiEmbeddingProvider(
        modelName || 'text-embedding-ada-002',
        options.config,
        options.id,
      );
    } else if (modelType === 'completion') {
      return new OpenAiCompletionProvider(
        modelName || 'text-davinci-003',
        options.config,
        options.id,
      );
    } else if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelType)) {
      return new OpenAiChatCompletionProvider(modelType, options.config, options.id);
    } else if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelType)) {
      return new OpenAiCompletionProvider(modelType, options.config, options.id);
    } else {
      throw new Error(
        `Unknown OpenAI model type: ${modelType}. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>`,
      );
    }
  } else if (providerPath?.startsWith('azureopenai:')) {
    // Load Azure OpenAI module
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const deploymentName = splits[2];

    if (modelType === 'chat') {
      return new AzureOpenAiChatCompletionProvider(deploymentName, options.config, options.id);
    } else if (modelType === 'completion') {
      return new AzureOpenAiCompletionProvider(deploymentName, options.config, options.id);
    } else {
      throw new Error(
        `Unknown Azure OpenAI model type: ${modelType}. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>`,
      );
    }
  } else if (providerPath?.startsWith('anthropic:')) {
    // Load Anthropic module
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits[2];

    if (modelType === 'completion') {
      return new AnthropicCompletionProvider(modelName || 'claude-instant-1', options.config);
    } else if (AnthropicCompletionProvider.ANTHROPIC_COMPLETION_MODELS.includes(modelType)) {
      return new AnthropicCompletionProvider(modelType, options.config);
    } else {
      throw new Error(
        `Unknown Anthropic model type: ${modelType}. Use one of the following providers: anthropic:completion:<model name>`,
      );
    }
  } else if (providerPath?.startsWith('replicate:')) {
    // Load Replicate module
    const splits = providerPath.split(':');
    const modelName = splits.slice(1).join(':');

    return new ReplicateProvider(modelName, options.config);
  }

  if (providerPath.startsWith('webhook:')) {
    const webhookUrl = providerPath.substring('webhook:'.length);
    return new WebhookProvider(webhookUrl);
  } else if (providerPath === 'llama' || providerPath.startsWith('llama:')) {
    const modelName = providerPath.split(':')[1];
    return new LlamaProvider(modelName, options.config);
  } else if (providerPath.startsWith('ollama:')) {
    const modelName = providerPath.split(':')[1];
    return new OllamaProvider(modelName);
  } else if (providerPath?.startsWith('localai:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits[2];

    if (modelType === 'chat') {
      return new LocalAiChatProvider(modelName);
    } else if (modelType === 'completion') {
      return new LocalAiCompletionProvider(modelName);
    } else {
      return new LocalAiChatProvider(modelType);
    }
  }

  // Load custom module
  const CustomApiProvider = (await import(path.join(process.cwd(), providerPath))).default;
  return new CustomApiProvider(options);
}

export default {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  AnthropicCompletionProvider,
  ReplicateProvider,
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  loadApiProvider,
};
