import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import invariant from 'tiny-invariant';
import cliState from './cliState';
import { importModule } from './esm';
import logger from './logger';
import { AI21ChatCompletionProvider } from './providers/ai21';
import { AnthropicCompletionProvider, AnthropicMessagesProvider } from './providers/anthropic';
import {
  AzureOpenAiAssistantProvider,
  AzureOpenAiChatCompletionProvider,
  AzureOpenAiCompletionProvider,
  AzureOpenAiEmbeddingProvider,
} from './providers/azureopenai';
import { BAMChatProvider, BAMEmbeddingProvider } from './providers/bam';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from './providers/bedrock';
import { BrowserProvider } from './providers/browser';
import * as CloudflareAiProviders from './providers/cloudflare-ai';
import { CohereChatCompletionProvider, CohereEmbeddingProvider } from './providers/cohere';
import { GolangProvider } from './providers/golangCompletion';
import { GroqProvider } from './providers/groq';
import { HttpProvider } from './providers/http';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from './providers/huggingface';
import { LlamaProvider } from './providers/llama';
import {
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  LocalAiEmbeddingProvider,
} from './providers/localai';
import { ManualInputProvider } from './providers/manualInput';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from './providers/mistral';
import {
  OllamaEmbeddingProvider,
  OllamaCompletionProvider,
  OllamaChatProvider,
} from './providers/ollama';
import {
  OpenAiAssistantProvider,
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  OpenAiEmbeddingProvider,
  OpenAiImageProvider,
  OpenAiModerationProvider,
} from './providers/openai';
import { PalmChatProvider } from './providers/palm';
import { PortkeyChatCompletionProvider } from './providers/portkey';
import { PythonProvider } from './providers/pythonCompletion';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from './providers/replicate';
import { ScriptCompletionProvider } from './providers/scriptCompletion';
import { VertexChatProvider, VertexEmbeddingProvider } from './providers/vertex';
import { VoyageEmbeddingProvider } from './providers/voyage';
import { WebhookProvider } from './providers/webhook';
import { WebSocketProvider } from './providers/websocket';
import RedteamCrescendoProvider from './redteam/providers/crescendo';
import RedteamIterativeProvider from './redteam/providers/iterative';
import RedteamImageIterativeProvider from './redteam/providers/iterativeImage';
import RedteamIterativeTreeProvider from './redteam/providers/iterativeTree';
import type { TestSuiteConfig } from './types';
import type {
  ApiProvider,
  EnvOverrides,
  ProviderOptions,
  ProviderOptionsMap,
} from './types/providers';

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
    id: options.id,
    config: {
      ...options.config,
      basePath,
    },
    env,
  };
  let ret: ApiProvider;
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
    ret = new ScriptCompletionProvider(scriptPath, providerOptions);
  } else if (providerPath.startsWith('python:')) {
    const scriptPath = providerPath.split(':').slice(1).join(':');
    ret = new PythonProvider(scriptPath, providerOptions);
  } else if (providerPath.startsWith('openai:')) {
    // Load OpenAI module
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');

    if (modelType === 'chat') {
      ret = new OpenAiChatCompletionProvider(modelName || 'gpt-4o-mini', providerOptions);
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
      // Assume user did not provide model type, and it's a chat model
      logger.warn(
        `Unknown OpenAI model type: ${modelType}. Treating it as a chat model. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>, openai:embeddings:<model name>, openai:image:<model name>`,
      );
      ret = new OpenAiChatCompletionProvider(modelType, providerOptions);
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
        `Unknown Anthropic model type: ${modelType}. Use one of the following providers: anthropic:messages:<model name>, anthropic:completion:<model name>`,
      );
    }
  } else if (providerPath.startsWith('voyage:')) {
    ret = new VoyageEmbeddingProvider(providerPath.split(':')[1], providerOptions);
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
    } else if (modelType === 'image') {
      ret = new ReplicateImageProvider(modelName, providerOptions);
    } else {
      // By default, there is no model type.
      ret = new ReplicateProvider(
        modelName ? modelType + ':' + modelName : modelType,
        providerOptions,
      );
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
  } else if (providerPath.startsWith('ollama:')) {
    const splits = providerPath.split(':');
    const firstPart = splits[1];
    if (firstPart === 'chat') {
      const modelName = splits.slice(2).join(':');
      ret = new OllamaChatProvider(modelName, providerOptions);
    } else if (firstPart === 'completion') {
      const modelName = splits.slice(2).join(':');
      ret = new OllamaCompletionProvider(modelName, providerOptions);
    } else if (firstPart === 'embedding' || firstPart === 'embeddings') {
      const modelName = splits.slice(2).join(':');
      ret = new OllamaEmbeddingProvider(modelName, providerOptions);
    } else {
      // Default to completion provider
      const modelName = splits.slice(1).join(':');
      ret = new OllamaCompletionProvider(modelName, providerOptions);
    }
  } else if (providerPath.startsWith('palm:') || providerPath.startsWith('google:')) {
    const modelName = providerPath.split(':')[1];
    ret = new PalmChatProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('vertex:')) {
    const splits = providerPath.split(':');
    const firstPart = splits[1];
    if (firstPart === 'chat') {
      ret = new VertexChatProvider(splits.slice(2).join(':'), providerOptions);
    } else if (firstPart === 'embedding' || firstPart === 'embeddings') {
      ret = new VertexEmbeddingProvider(splits.slice(2).join(':'), providerOptions);
    } else {
      // Default to chat provider
      ret = new VertexChatProvider(splits.slice(1).join(':'), providerOptions);
    }
  } else if (providerPath.startsWith('mistral:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');
    if (modelType === 'embedding' || modelType === 'embeddings') {
      ret = new MistralEmbeddingProvider(providerOptions);
    } else {
      ret = new MistralChatCompletionProvider(modelName || modelType, providerOptions);
    }
  } else if (providerPath.startsWith('cohere:')) {
    const splits = providerPath.split(':');
    const modelType = splits[1];
    const modelName = splits.slice(2).join(':');

    if (modelType === 'embedding' || modelType === 'embeddings') {
      ret = new CohereEmbeddingProvider(modelName, providerOptions);
    } else if (modelType === 'chat' || modelType === undefined) {
      ret = new CohereChatCompletionProvider(modelName || modelType, providerOptions);
    } else {
      // Default to chat provider for any other model type
      ret = new CohereChatCompletionProvider(
        providerPath.substring('cohere:'.length),
        providerOptions,
      );
    }
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
  } else if (
    providerPath.startsWith('http:') ||
    providerPath.startsWith('https:') ||
    providerPath === 'http' ||
    providerPath === 'https'
  ) {
    ret = new HttpProvider(providerPath, providerOptions);
  } else if (
    providerPath.startsWith('ws:') ||
    providerPath.startsWith('wss:') ||
    providerPath === 'websocket' ||
    providerPath === 'ws' ||
    providerPath === 'wss'
  ) {
    ret = new WebSocketProvider(providerPath, providerOptions);
  } else if (providerPath === 'browser') {
    ret = new BrowserProvider(providerPath, providerOptions);
  } else if (providerPath === 'promptfoo:redteam:iterative') {
    ret = new RedteamIterativeProvider(providerOptions.config);
  } else if (providerPath === 'promptfoo:redteam:iterative:tree') {
    ret = new RedteamIterativeTreeProvider(providerOptions.config);
  } else if (providerPath === 'promptfoo:redteam:iterative:image') {
    ret = new RedteamImageIterativeProvider(providerOptions.config);
  } else if (providerPath === 'promptfoo:redteam:crescendo') {
    ret = new RedteamCrescendoProvider(providerOptions.config);
  } else if (providerPath === 'promptfoo:manual-input') {
    ret = new ManualInputProvider(providerOptions);
  } else if (providerPath.startsWith('groq:')) {
    const modelName = providerPath.split(':')[1];
    ret = new GroqProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('ai21:')) {
    const modelName = providerPath.split(':')[1];
    ret = new AI21ChatCompletionProvider(modelName, providerOptions);
  } else if (providerPath.startsWith('golang:')) {
    const scriptPath = providerPath.split(':').slice(1).join(':');
    ret = new GolangProvider(scriptPath, providerOptions);
  } else {
    if (providerPath.startsWith('file://')) {
      providerPath = providerPath.slice('file://'.length);
    }
    // Load custom module
    const modulePath = path.isAbsolute(providerPath)
      ? providerPath
      : path.join(basePath || process.cwd(), providerPath);

    const CustomApiProvider = await importModule(modulePath);
    ret = new CustomApiProvider(options);
  }
  ret.transform = options.transform;
  ret.delay = options.delay;
  ret.label ||= options.label;
  return ret;
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

export default {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  OpenAiAssistantProvider,
  AnthropicCompletionProvider,
  AnthropicMessagesProvider,
  ReplicateProvider,
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  BAMChatProvider,
  BAMEmbeddingProvider,
  GroqProvider,
  MistralChatCompletionProvider,
  MistralEmbeddingProvider,
  loadApiProvider,
};
