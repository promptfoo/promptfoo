import path from 'path';

import {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  OpenAiEmbeddingProvider,
} from './providers/openai';
import { AnthropicCompletionProvider } from './providers/anthropic';
import { ReplicateProvider } from './providers/replicate';
import { LocalAiCompletionProvider, LocalAiChatProvider, LocalAiEmbeddingProvider } from './providers/localai';
import { PalmChatProvider } from './providers/palm';
import { LlamaProvider } from './providers/llama';
import { OllamaEmbeddingProvider, OllamaProvider } from './providers/ollama';
import { VertexChatProvider } from './providers/vertex';
import { WebhookProvider } from './providers/webhook';
import { ScriptCompletionProvider } from './providers/scriptCompletion';
import {
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
  AzureOpenAiEmbeddingProvider,
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
  const { basePath, env } = options;
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
            id: () => `custom-function-${idx}`,
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

export async function loadApiProvider(
  providerPath: string,
  context: {
    options?: ProviderOptions;
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider> {
  const { options = {}, basePath, env } = context;
  const providerOptions = {
    id: options.id,
    config: options.config,
    env,
  };
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
      return new OpenAiChatCompletionProvider(modelName || 'gpt-3.5-turbo', providerOptions);
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      return new OpenAiEmbeddingProvider(modelName || 'text-embedding-ada-002', providerOptions);
    } else if (modelType === 'completion') {
      return new OpenAiCompletionProvider(modelName || 'text-davinci-003', providerOptions);
    } else if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelType)) {
      return new OpenAiChatCompletionProvider(modelType, providerOptions);
    } else if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelType)) {
      return new OpenAiCompletionProvider(modelType, providerOptions);
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
      return new AzureOpenAiChatCompletionProvider(deploymentName, providerOptions);
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      return new AzureOpenAiEmbeddingProvider(deploymentName || 'text-embedding-ada-002', providerOptions);
    } else if (modelType === 'completion') {
      return new AzureOpenAiCompletionProvider(deploymentName, providerOptions);
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
      return new AnthropicCompletionProvider(modelName || 'claude-instant-1', providerOptions);
    } else if (AnthropicCompletionProvider.ANTHROPIC_COMPLETION_MODELS.includes(modelType)) {
      return new AnthropicCompletionProvider(modelType, providerOptions);
    } else {
      throw new Error(
        `Unknown Anthropic model type: ${modelType}. Use one of the following providers: anthropic:completion:<model name>`,
      );
    }
  } else if (providerPath?.startsWith('replicate:')) {
    // Load Replicate module
    const splits = providerPath.split(':');
    const modelName = splits.slice(1).join(':');

    return new ReplicateProvider(modelName, providerOptions);
  }

  if (providerPath.startsWith('webhook:')) {
    const webhookUrl = providerPath.substring('webhook:'.length);
    return new WebhookProvider(webhookUrl, providerOptions);
  } else if (providerPath === 'llama' || providerPath.startsWith('llama:')) {
    const modelName = providerPath.split(':')[1];
    return new LlamaProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('ollama:embeddings:') || providerPath.startsWith('ollama:embedding:')) {
    const modelName = providerPath.split(':')[2];
    return new OllamaEmbeddingProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('ollama:')) {
    const modelName = providerPath.split(':').slice(1).join(':');
    return new OllamaProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('palm:')) {
    const modelName = providerPath.split(':')[1];
    return new PalmChatProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('vertex')) {
    const modelName = providerPath.split(':')[1];
    return new VertexChatProvider(modelName, providerOptions);
  } else if (providerPath?.startsWith('localai:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits[2];

    if (modelType === 'chat') {
      return new LocalAiChatProvider(modelName, providerOptions);
    } else if (modelType === 'completion') {
      return new LocalAiCompletionProvider(modelName, providerOptions);
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      return new LocalAiEmbeddingProvider(modelName, providerOptions);
    } else {
      return new LocalAiChatProvider(modelType, providerOptions);
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
