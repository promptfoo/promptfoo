import fs from 'fs';
import path from 'path';

import invariant from 'tiny-invariant';
import yaml from 'js-yaml';

import logger from './logger';
import {
  OpenAiAssistantProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  OpenAiEmbeddingProvider,
  OpenAiImageProvider,
  OpenAiModerationProvider,
} from './providers/openai';
import { AnthropicCompletionProvider, AnthropicMessagesProvider } from './providers/anthropic';
import { ReplicateModerationProvider, ReplicateProvider } from './providers/replicate';
import {
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  LocalAiEmbeddingProvider,
} from './providers/localai';
import { PalmChatProvider } from './providers/palm';
import { LlamaProvider } from './providers/llama';
import {
  OllamaEmbeddingProvider,
  OllamaCompletionProvider,
  OllamaChatProvider,
} from './providers/ollama';
import { VertexChatProvider } from './providers/vertex';
import { MistralChatCompletionProvider } from './providers/mistral';
import { WebhookProvider } from './providers/webhook';
import { ScriptCompletionProvider } from './providers/scriptCompletion';
import {
  AzureOpenAiAssistantProvider,
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
  AzureOpenAiEmbeddingProvider,
} from './providers/azureopenai';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from './providers/huggingface';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from './providers/bedrock';
import { PythonProvider } from './providers/pythonCompletion';
import { CohereChatCompletionProvider } from './providers/cohere';
import * as CloudflareAiProviders from './providers/cloudflare-ai';
import { BAMChatProvider, BAMEmbeddingProvider } from './providers/bam';
import { PortkeyChatCompletionProvider } from './providers/portkey';
import { HttpProvider } from './providers/http';
import { importModule } from './esm';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderOptions,
  ProviderOptionsMap,
  TestSuiteConfig,
} from './types';

export async function loadApiProviders(
  providerPaths: TestSuiteConfig['providers'],
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

// FIXME(ian): Make loadApiProvider handle all the different provider types (string, ProviderOptions, ApiProvider, etc), rather than the callers.
export async function loadApiProvider(
  providerPath: string,
  context: {
    options?: ProviderOptions;
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider> {
  const { options = {}, basePath, env } = context;
  const providerOptions: ProviderOptions = {
    // Hack(ian): Override id with label. This makes it so that debug and display info, which rely on id, will use the label instead.
    id: options.label || options.id,
    config: {
      ...options.config,
      basePath,
    },
    env,
  };
  let ret: ApiProvider;
  if (
    providerPath.startsWith('file://') &&
    (providerPath.endsWith('.yaml') || providerPath.endsWith('.yml'))
  ) {
    const filePath = providerPath.slice('file://'.length);
    const yamlContent = yaml.load(fs.readFileSync(filePath, 'utf8')) as ProviderOptions;
    invariant(yamlContent, `Provider config ${filePath} is undefined`);
    invariant(yamlContent.id, `Provider config ${filePath} must have an id`);
    logger.info(`Loaded provider ${yamlContent.id} from ${filePath}`);
    ret = await loadApiProvider(yamlContent.id, { ...context, options: yamlContent });
  } else if (providerPath === 'echo') {
    ret = {
      id: () => 'echo',
      callApi: async (input) => ({ output: input }),
    };
  } else if (providerPath.startsWith('exec:')) {
    // Load script module
    const scriptPath = providerPath.split(':')[1];
    ret = new ScriptCompletionProvider(scriptPath, providerOptions);
  } else if (providerPath.startsWith('python:')) {
    const scriptPath = providerPath.split(':')[1];
    ret = new PythonProvider(scriptPath, providerOptions);
  } else if (providerPath.startsWith('openai:')) {
    // Load OpenAI module
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');

    if (modelType === 'chat') {
      ret = new OpenAiChatCompletionProvider(modelName || 'gpt-3.5-turbo', providerOptions);
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      ret = new OpenAiEmbeddingProvider(modelName || 'text-embedding-3-large', providerOptions);
    } else if (modelType === 'completion') {
      ret = new OpenAiCompletionProvider(modelName || 'gpt-3.5-turbo-instruct', providerOptions);
    } else if (modelType === 'moderation') {
      ret = new OpenAiModerationProvider(modelName || 'text-moderation-latest', providerOptions);
    } else if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelType)) {
      ret = new OpenAiChatCompletionProvider(modelType, providerOptions);
    } else if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODEL_NAMES.includes(modelType)) {
      ret = new OpenAiCompletionProvider(modelType, providerOptions);
    } else if (modelType === 'assistant') {
      ret = new OpenAiAssistantProvider(modelName, providerOptions);
    } else if (modelType === 'image') {
      ret = new OpenAiImageProvider(modelName, providerOptions);
    } else {
      throw new Error(
        `Unknown OpenAI model type: ${modelType}. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>, openai:embeddings:<model name>, openai:image:<model name>`,
      );
    }
  } else if (providerPath.startsWith('azureopenai:')) {
    // Load Azure OpenAI module
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const deploymentName = splits[2];

    if (modelType === 'chat') {
      ret = new AzureOpenAiChatCompletionProvider(deploymentName, providerOptions);
    } else if (modelType === 'assistant') {
      ret = new AzureOpenAiAssistantProvider(deploymentName, providerOptions);
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      ret = new AzureOpenAiEmbeddingProvider(
        deploymentName || 'text-embedding-ada-002',
        providerOptions,
      );
    } else if (modelType === 'completion') {
      ret = new AzureOpenAiCompletionProvider(deploymentName, providerOptions);
    } else {
      throw new Error(
        `Unknown Azure OpenAI model type: ${modelType}. Use one of the following providers: azureopenai:chat:<model name>, azureopenai:assistant:<assistant id>, azureopenai:completion:<model name>`,
      );
    }
  } else if (providerPath.startsWith('openrouter:')) {
    const splits = providerPath.split(':');
    const modelName = splits.slice(1).join(':');
    ret = new OpenAiChatCompletionProvider(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: 'https://openrouter.ai/api/v1',
        apiKeyEnvar: 'OPENROUTER_API_KEY',
      },
    });
  } else if (providerPath.startsWith('portkey:')) {
    const splits = providerPath.split(':');
    const modelName = splits.slice(1).join(':');
    ret = new PortkeyChatCompletionProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('anthropic:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits[2];

    if (modelType === 'messages') {
      ret = new AnthropicMessagesProvider(modelName, providerOptions);
    } else if (modelType === 'completion') {
      ret = new AnthropicCompletionProvider(modelName, providerOptions);
    } else if (AnthropicCompletionProvider.ANTHROPIC_COMPLETION_MODELS.includes(modelType)) {
      ret = new AnthropicCompletionProvider(modelType, providerOptions);
    } else {
      throw new Error(
        `Unknown Anthropic model type: ${modelType}. Use one of the following providers: anthropic:completion:<model name>`,
      );
    }
  } else if (providerPath.startsWith('bedrock:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');

    if (modelType === 'completion') {
      // Backwards compatibility: `completion` used to be required
      ret = new AwsBedrockCompletionProvider(modelName, providerOptions);
    } else if (modelType === 'embeddings' || modelType === 'embedding') {
      ret = new AwsBedrockEmbeddingProvider(modelName, providerOptions);
    } else {
      ret = new AwsBedrockCompletionProvider(
        `${modelType}${modelName ? `:${modelName}` : ''}`,
        providerOptions,
      );
    }
  } else if (providerPath.startsWith('huggingface:') || providerPath.startsWith('hf:')) {
    const splits = providerPath.split(':');
    if (splits.length < 3) {
      throw new Error(
        `Invalid Huggingface provider path: ${providerPath}. Use one of the following providers: huggingface:feature-extraction:<model name>, huggingface:text-generation:<model name>, huggingface:text-classification:<model name>, huggingface:token-classification:<model name>`,
      );
    }
    const modelName = splits.slice(2).join(':');
    if (splits[1] === 'feature-extraction') {
      ret = new HuggingfaceFeatureExtractionProvider(modelName, providerOptions);
    } else if (splits[1] === 'sentence-similarity') {
      ret = new HuggingfaceSentenceSimilarityProvider(modelName, providerOptions);
    } else if (splits[1] === 'text-generation') {
      ret = new HuggingfaceTextGenerationProvider(modelName, providerOptions);
    } else if (splits[1] === 'text-classification') {
      ret = new HuggingfaceTextClassificationProvider(modelName, providerOptions);
    } else if (splits[1] === 'token-classification') {
      ret = new HuggingfaceTokenExtractionProvider(modelName, providerOptions);
    } else {
      throw new Error(
        `Invalid Huggingface provider path: ${providerPath}. Use one of the following providers: huggingface:feature-extraction:<model name>, huggingface:text-generation:<model name>, huggingface:text-classification:<model name>, huggingface:token-classification:<model name>`,
      );
    }
  } else if (providerPath.startsWith('replicate:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');
    if (modelType === 'moderation') {
      ret = new ReplicateModerationProvider(modelName, providerOptions);
    } else {
      // By default, there is no model type.
      ret = new ReplicateProvider(modelType + ':' + modelName, providerOptions);
    }
  } else if (providerPath.startsWith('bam:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');
    if (modelType === 'chat') {
      ret = new BAMChatProvider(modelName || 'ibm/granite-13b-chat-v2', providerOptions);
    } else {
      throw new Error(
        `Invalid BAM provider: ${providerPath}. Use one of the following providers: bam:chat:<model name>`,
      );
    }
  } else if (providerPath.startsWith('cloudflare-ai:')) {
    // Load Cloudflare AI
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const deploymentName = splits[2];

    if (modelType === 'chat') {
      ret = new CloudflareAiProviders.CloudflareAiChatCompletionProvider(
        deploymentName,
        providerOptions,
      );
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      ret = new CloudflareAiProviders.CloudflareAiEmbeddingProvider(
        deploymentName,
        providerOptions,
      );
    } else if (modelType === 'completion') {
      ret = new CloudflareAiProviders.CloudflareAiCompletionProvider(
        deploymentName,
        providerOptions,
      );
    } else {
      throw new Error(
        `Unknown Cloudflare AI model type: ${modelType}. Use one of the following providers: cloudflare-ai:chat:<model name>, cloudflare-ai:completion:<model name>, cloudflare-ai:embedding:`,
      );
    }
  } else if (providerPath.startsWith('webhook:')) {
    const webhookUrl = providerPath.substring('webhook:'.length);
    ret = new WebhookProvider(webhookUrl, providerOptions);
  } else if (providerPath === 'llama' || providerPath.startsWith('llama:')) {
    const modelName = providerPath.split(':')[1];
    ret = new LlamaProvider(modelName, providerOptions);
  } else if (
    providerPath.startsWith('ollama:embeddings:') ||
    providerPath.startsWith('ollama:embedding:')
  ) {
    const modelName = providerPath.split(':')[2];
    ret = new OllamaEmbeddingProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('ollama:')) {
    const splits = providerPath.split(':');
    const firstPart = splits[1];
    if (firstPart === 'chat') {
      const modelName = splits.slice(2).join(':');
      ret = new OllamaChatProvider(modelName, providerOptions);
    } else if (firstPart === 'completion') {
      const modelName = splits.slice(2).join(':');
      ret = new OllamaCompletionProvider(modelName, providerOptions);
    } else {
      // Default to completion provider
      const modelName = splits.slice(1).join(':');
      ret = new OllamaCompletionProvider(modelName, providerOptions);
    }
  } else if (providerPath.startsWith('palm:') || providerPath.startsWith('google:')) {
    const modelName = providerPath.split(':')[1];
    ret = new PalmChatProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('vertex')) {
    const modelName = providerPath.split(':')[1];
    ret = new VertexChatProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('mistral:')) {
    const modelName = providerPath.split(':')[1];
    ret = new MistralChatCompletionProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('cohere:')) {
    const modelName = providerPath.split(':')[1];
    ret = new CohereChatCompletionProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('localai:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits[2];

    if (modelType === 'chat') {
      ret = new LocalAiChatProvider(modelName, providerOptions);
    } else if (modelType === 'completion') {
      ret = new LocalAiCompletionProvider(modelName, providerOptions);
    } else if (modelType === 'embedding' || modelType === 'embeddings') {
      ret = new LocalAiEmbeddingProvider(modelName, providerOptions);
    } else {
      ret = new LocalAiChatProvider(modelType, providerOptions);
    }
  } else if (providerPath.startsWith('http:') || providerPath.startsWith('https:')) {
    ret = new HttpProvider(providerPath, providerOptions);
  } else if (providerPath === 'promptfoo:redteam:iterative') {
    const RedteamIterativeProvider = (await import(path.join(__dirname, './redteam/iterative')))
      .default;
    ret = new RedteamIterativeProvider(providerOptions);
  } else {
    if (providerPath.startsWith('file://')) {
      providerPath = providerPath.slice('file://'.length);
    }
    // Load custom module
    const modulePath = path.join(basePath || process.cwd(), providerPath);
    const CustomApiProvider = await importModule(modulePath);
    ret = new CustomApiProvider(options);
    ret.label = ret.label || options.label;
  }

  ret.transform = options.transform;
  ret.delay = options.delay;
  return ret;
}

export default {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  OpenAiAssistantProvider,
  AnthropicCompletionProvider,
  ReplicateProvider,
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  BAMChatProvider,
  BAMEmbeddingProvider,
  loadApiProvider,
};
