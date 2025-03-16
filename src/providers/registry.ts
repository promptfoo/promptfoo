import dedent from 'dedent';
import path from 'path';
import { importModule } from '../esm';
import logger from '../logger';
import RedteamBestOfNProvider from '../redteam/providers/bestOfN';
import RedteamCrescendoProvider from '../redteam/providers/crescendo';
import RedteamGoatProvider from '../redteam/providers/goat';
import RedteamIterativeProvider from '../redteam/providers/iterative';
import RedteamImageIterativeProvider from '../redteam/providers/iterativeImage';
import RedteamIterativeTreeProvider from '../redteam/providers/iterativeTree';
import RedteamPandamoniumProvider from '../redteam/providers/pandamonium';
import type { LoadApiProviderContext } from '../types';
import type { ApiProvider, ProviderOptions } from '../types/providers';
import { isJavascriptFile } from '../util/file';
import { AI21ChatCompletionProvider } from './ai21';
import { AlibabaChatCompletionProvider, AlibabaEmbeddingProvider } from './alibaba';
import { AnthropicCompletionProvider } from './anthropic/completion';
import { AnthropicMessagesProvider } from './anthropic/messages';
import { ANTHROPIC_MODELS } from './anthropic/util';
import {
  AzureAssistantProvider,
  AzureChatCompletionProvider,
  AzureCompletionProvider,
  AzureEmbeddingProvider,
} from './azure';
import { AzureModerationProvider } from './azure/moderation';
import { BAMProvider } from './bam';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from './bedrock';
import { BrowserProvider } from './browser';
import { ClouderaAiChatCompletionProvider } from './cloudera';
import * as CloudflareAiProviders from './cloudflare-ai';
import { CohereChatCompletionProvider, CohereEmbeddingProvider } from './cohere';
import { DatabricksMosaicAiChatCompletionProvider } from './databricks';
import { EchoProvider } from './echo';
import { FalImageGenerationProvider } from './fal';
import { GolangProvider } from './golangCompletion';
import { GoogleChatProvider } from './google';
import { GoogleMMLiveProvider } from './googleMultimodalLive';
import { GroqProvider } from './groq';
import { HttpProvider } from './http';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from './huggingface';
import { JfrogMlChatCompletionProvider } from './jfrog';
import { LlamaProvider } from './llama';
import {
  LocalAiChatProvider,
  LocalAiCompletionProvider,
  LocalAiEmbeddingProvider,
} from './localai';
import { ManualInputProvider } from './manualInput';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from './mistral';
import { OllamaChatProvider, OllamaCompletionProvider, OllamaEmbeddingProvider } from './ollama';
import { OpenAiAssistantProvider } from './openai/assistant';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { OpenAiImageProvider } from './openai/image';
import { OpenAiModerationProvider } from './openai/moderation';
import { OpenAiRealtimeProvider } from './openai/realtime';
import { parsePackageProvider } from './packageParser';
import { PortkeyChatCompletionProvider } from './portkey';
import { PythonProvider } from './pythonCompletion';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from './replicate';
import { ScriptCompletionProvider } from './scriptCompletion';
import { SequenceProvider } from './sequence';
import { SimulatedUser } from './simulatedUser';
import { createTogetherAiProvider } from './togetherai';
import { VertexChatProvider, VertexEmbeddingProvider } from './vertex';
import { VoyageEmbeddingProvider } from './voyage';
import { WatsonXProvider } from './watsonx';
import { WebhookProvider } from './webhook';
import { WebSocketProvider } from './websocket';
import { createXAIProvider } from './xai';

interface ProviderFactory {
  test: (providerPath: string) => boolean;
  create: (
    providerPath: string,
    providerOptions: ProviderOptions,
    context: LoadApiProviderContext,
  ) => Promise<ApiProvider>;
}

export const providerMap: ProviderFactory[] = [
  {
    test: (providerPath: string) => providerPath.startsWith('adaline:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      if (splits.length < 4) {
        throw new Error(
          `Invalid adaline provider path: ${providerPath}. path format should be 'adaline:<provider_name>:<model_type>:<model_name>' eg. 'adaline:openai:chat:gpt-4o'`,
        );
      }
      const providerName = splits[1];
      const modelType = splits[2];
      const modelName = splits[3];
      const { AdalineGatewayChatProvider, AdalineGatewayEmbeddingProvider } = await import(
        './adaline.gateway'
      );
      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new AdalineGatewayEmbeddingProvider(providerName, modelName, providerOptions);
      }
      return new AdalineGatewayChatProvider(providerName, modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('ai21:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const modelName = providerPath.split(':')[1];
      return new AI21ChatCompletionProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('alibaba:') ||
      providerPath.startsWith('alicloud:') ||
      providerPath.startsWith('aliyun:') ||
      providerPath.startsWith('dashscope:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new AlibabaEmbeddingProvider(modelName || modelType, providerOptions);
      }
      return new AlibabaChatCompletionProvider(modelName || modelType, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('anthropic:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits[2];

      if (modelType === 'messages') {
        return new AnthropicMessagesProvider(modelName, providerOptions);
      }
      if (modelType === 'completion') {
        return new AnthropicCompletionProvider(modelName, providerOptions);
      }
      if (AnthropicCompletionProvider.ANTHROPIC_COMPLETION_MODELS.includes(modelType)) {
        return new AnthropicCompletionProvider(modelType, providerOptions);
      }

      // Check if the second part is a valid Anthropic model name
      // If it is, assume it's a messages model
      const modelIds = ANTHROPIC_MODELS.map((model) => model.id);
      if (modelIds.includes(modelType)) {
        return new AnthropicMessagesProvider(modelType, providerOptions);
      }

      throw new Error(
        dedent`Unknown Anthropic model type or model name: ${modelType}. Use one of the following formats: 
        - anthropic:messages:<model name> - For Messages API
        - anthropic:completion:<model name> - For Completion API
        - anthropic:<model name> - Shorthand for Messages API with a known model name`,
      );
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('azure:') ||
      providerPath.startsWith('azureopenai:') ||
      providerPath === 'azure:moderation',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      // Handle azure:moderation directly
      if (providerPath === 'azure:moderation') {
        const { deploymentName, modelName } = providerOptions.config || {};
        return new AzureModerationProvider(
          deploymentName || modelName || 'text-content-safety',
          providerOptions,
        );
      }

      // Handle other Azure providers
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const deploymentName = splits[2];

      if (modelType === 'chat') {
        return new AzureChatCompletionProvider(deploymentName, providerOptions);
      }
      if (modelType === 'assistant') {
        return new AzureAssistantProvider(deploymentName, providerOptions);
      }
      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new AzureEmbeddingProvider(
          deploymentName || 'text-embedding-ada-002',
          providerOptions,
        );
      }
      if (modelType === 'completion') {
        return new AzureCompletionProvider(deploymentName, providerOptions);
      }
      throw new Error(
        `Unknown Azure model type: ${modelType}. Use one of the following providers: azure:chat:<model name>, azure:assistant:<assistant id>, azure:completion:<model name>, azure:moderation:<model name>`,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('bam:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');
      if (modelType === 'chat') {
        return new BAMProvider(modelName || 'ibm/granite-13b-chat-v2', providerOptions);
      }
      throw new Error(
        `Invalid BAM provider: ${providerPath}. Use one of the following providers: bam:chat:<model name>`,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('bedrock:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      if (modelType === 'completion') {
        // Backwards compatibility: `completion` used to be required
        return new AwsBedrockCompletionProvider(modelName, providerOptions);
      }
      if (modelType === 'embeddings' || modelType === 'embedding') {
        return new AwsBedrockEmbeddingProvider(modelName, providerOptions);
      }
      return new AwsBedrockCompletionProvider(
        `${modelType}${modelName ? `:${modelName}` : ''}`,
        providerOptions,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('cloudera:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const modelName = providerPath.split(':')[1];
      return new ClouderaAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: providerOptions.config || {},
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('cloudflare-ai:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      // Load Cloudflare AI
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const deploymentName = splits[2];

      if (modelType === 'chat') {
        return new CloudflareAiProviders.CloudflareAiChatCompletionProvider(
          deploymentName,
          providerOptions,
        );
      }
      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new CloudflareAiProviders.CloudflareAiEmbeddingProvider(
          deploymentName,
          providerOptions,
        );
      }
      if (modelType === 'completion') {
        return new CloudflareAiProviders.CloudflareAiCompletionProvider(
          deploymentName,
          providerOptions,
        );
      }
      throw new Error(
        `Unknown Cloudflare AI model type: ${modelType}. Use one of the following providers: cloudflare-ai:chat:<model name>, cloudflare-ai:completion:<model name>, cloudflare-ai:embedding:`,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('cohere:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new CohereEmbeddingProvider(modelName, providerOptions);
      }
      if (modelType === 'chat' || modelType === undefined) {
        return new CohereChatCompletionProvider(modelName || modelType, providerOptions);
      }
      // Default to chat provider for any other model type
      return new CohereChatCompletionProvider(
        providerPath.substring('cohere:'.length),
        providerOptions,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('databricks:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new DatabricksMosaicAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: providerOptions.config || {},
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('deepseek:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':') || 'deepseek-chat';
      return new OpenAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: 'https://api.deepseek.com/v1',
          apiKeyEnvar: 'DEEPSEEK_API_KEY',
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath === 'echo',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new EchoProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('exec:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      // Load script module
      const scriptPath = providerPath.split(':')[1];
      return new ScriptCompletionProvider(scriptPath, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('f5:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      let endpoint = splits.slice(1).join(':');
      if (endpoint.startsWith('/')) {
        endpoint = endpoint.slice(1);
      }
      return new OpenAiChatCompletionProvider(endpoint, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: providerOptions.config?.apiBaseUrl + '/' + endpoint,
          apiKeyEnvar: 'F5_API_KEY',
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('fal:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const [_, modelType, modelName] = providerPath.split(':');
      if (modelType === 'image') {
        return new FalImageGenerationProvider(modelName, providerOptions);
      }
      throw new Error(
        `Invalid fal provider path: ${providerPath}. Use one of the following providers: fal:image:<model name>`,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('fireworks:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new OpenAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: 'https://api.fireworks.ai/inference/v1',
          apiKeyEnvar: 'FIREWORKS_API_KEY',
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('github:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new OpenAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: 'https://models.inference.ai.azure.com',
          apiKeyEnvar: 'GITHUB_TOKEN',
        },
      });
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('golang:') ||
      (providerPath.startsWith('file://') &&
        (providerPath.endsWith('.go') || providerPath.includes('.go:'))),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const scriptPath = providerPath.startsWith('file://')
        ? providerPath.slice('file://'.length)
        : providerPath.split(':').slice(1).join(':');
      return new GolangProvider(scriptPath, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('groq:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const modelName = providerPath.split(':')[1];
      return new GroqProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('hyperbolic:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new OpenAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: 'https://api.hyperbolic.xyz/v1',
          apiKeyEnvar: 'HYPERBOLIC_API_KEY',
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('localai:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits[2];
      if (modelType === 'chat') {
        return new LocalAiChatProvider(modelName, providerOptions);
      }
      if (modelType === 'completion') {
        return new LocalAiCompletionProvider(modelName, providerOptions);
      }
      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new LocalAiEmbeddingProvider(modelName, providerOptions);
      }
      return new LocalAiChatProvider(modelType, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('mistral:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');
      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new MistralEmbeddingProvider(providerOptions);
      }
      return new MistralChatCompletionProvider(modelName || modelType, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('ollama:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const firstPart = splits[1];
      if (firstPart === 'chat') {
        const modelName = splits.slice(2).join(':');
        return new OllamaChatProvider(modelName, providerOptions);
      }
      if (firstPart === 'completion') {
        const modelName = splits.slice(2).join(':');
        return new OllamaCompletionProvider(modelName, providerOptions);
      }
      if (firstPart === 'embedding' || firstPart === 'embeddings') {
        const modelName = splits.slice(2).join(':');
        return new OllamaEmbeddingProvider(modelName, providerOptions);
      }
      // Default to completion provider
      const modelName = splits.slice(1).join(':');
      return new OllamaCompletionProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('openai:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      // Load OpenAI module
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      if (modelType === 'chat') {
        return new OpenAiChatCompletionProvider(modelName || 'gpt-4o-mini', providerOptions);
      }
      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new OpenAiEmbeddingProvider(modelName || 'text-embedding-3-large', providerOptions);
      }
      if (modelType === 'completion') {
        return new OpenAiCompletionProvider(modelName || 'gpt-3.5-turbo-instruct', providerOptions);
      }
      if (modelType === 'moderation') {
        return new OpenAiModerationProvider(modelName || 'omni-moderation-latest', providerOptions);
      }
      if (modelType === 'realtime') {
        return new OpenAiRealtimeProvider(
          modelName || 'gpt-4o-realtime-preview-2024-12-17',
          providerOptions,
        );
      }
      if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelType)) {
        return new OpenAiChatCompletionProvider(modelType, providerOptions);
      }
      if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODEL_NAMES.includes(modelType)) {
        return new OpenAiCompletionProvider(modelType, providerOptions);
      }
      if (OpenAiRealtimeProvider.OPENAI_REALTIME_MODEL_NAMES.includes(modelType)) {
        return new OpenAiRealtimeProvider(modelType, providerOptions);
      }
      if (modelType === 'assistant') {
        return new OpenAiAssistantProvider(modelName, providerOptions);
      }
      if (modelType === 'image') {
        return new OpenAiImageProvider(modelName, providerOptions);
      }
      // Assume user did not provide model type, and it's a chat model
      logger.warn(
        `Unknown OpenAI model type: ${modelType}. Treating it as a chat model. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>, openai:embeddings:<model name>, openai:image:<model name>, openai:realtime:<model name>`,
      );
      return new OpenAiChatCompletionProvider(modelType, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('openrouter:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new OpenAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          apiKeyEnvar: 'OPENROUTER_API_KEY',
          passthrough: {
            // Pass through OpenRouter-specific options
            // https://openrouter.ai/docs/requests
            ...(providerOptions.config.transforms && {
              transforms: providerOptions.config.transforms,
            }),
            ...(providerOptions.config.models && { models: providerOptions.config.models }),
            ...(providerOptions.config.route && { route: providerOptions.config.route }),
            ...(providerOptions.config.provider && { provider: providerOptions.config.provider }),
            ...(providerOptions.config.passthrough && {
              passthrough: providerOptions.config.passthrough,
            }),
          },
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('package:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return parsePackageProvider(providerPath, context.basePath || process.cwd(), providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('perplexity:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new OpenAiChatCompletionProvider(modelName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          apiBaseUrl: 'https://api.perplexity.ai',
          apiKeyEnvar: 'PERPLEXITY_API_KEY',
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('portkey:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new PortkeyChatCompletionProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('replicate:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');
      if (modelType === 'moderation') {
        return new ReplicateModerationProvider(modelName, providerOptions);
      }
      if (modelType === 'image') {
        return new ReplicateImageProvider(modelName, providerOptions);
      }
      // By default, there is no model type.
      return new ReplicateProvider(
        modelName ? modelType + ':' + modelName : modelType,
        providerOptions,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('togetherai:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createTogetherAiProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('vertex:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const firstPart = splits[1];
      if (firstPart === 'chat') {
        return new VertexChatProvider(splits.slice(2).join(':'), providerOptions);
      }
      if (firstPart === 'embedding' || firstPart === 'embeddings') {
        return new VertexEmbeddingProvider(splits.slice(2).join(':'), providerOptions);
      }
      // Default to chat provider
      return new VertexChatProvider(splits.slice(1).join(':'), providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('voyage:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new VoyageEmbeddingProvider(providerPath.split(':')[1], providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('watsonx:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new WatsonXProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('webhook:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const webhookUrl = providerPath.substring('webhook:'.length);
      return new WebhookProvider(webhookUrl, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('xai:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createXAIProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath === 'browser',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new BrowserProvider(providerPath, providerOptions);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('google:') || providerPath.startsWith('palm:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');

      if (splits.length >= 3) {
        const serviceType = splits[1];
        const modelName = splits.slice(2).join(':');

        if (serviceType === 'live') {
          // This is a Multimodal Live API request
          return new GoogleMMLiveProvider(modelName, providerOptions);
        }
      }

      // Default to regular Google API
      const modelName = splits[1];
      return new GoogleChatProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('http:') ||
      providerPath.startsWith('https:') ||
      providerPath === 'http' ||
      providerPath === 'https',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new HttpProvider(providerPath, providerOptions);
    },
  },
  {
    test: (providerPath: string) => isJavascriptFile(providerPath),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      if (providerPath.startsWith('file://')) {
        providerPath = providerPath.slice('file://'.length);
      }
      // Load custom module
      const modulePath = path.isAbsolute(providerPath)
        ? providerPath
        : path.join(context.basePath || process.cwd(), providerPath);

      const CustomApiProvider = await importModule(modulePath);
      return new CustomApiProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('jfrog:') || providerPath.startsWith('qwak:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new JfrogMlChatCompletionProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'llama' || providerPath.startsWith('llama:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const modelName = providerPath.split(':')[1];
      return new LlamaProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:manual-input',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new ManualInputProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:best-of-n',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamBestOfNProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:crescendo',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamCrescendoProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:goat',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamGoatProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamIterativeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:image',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamImageIterativeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:tree',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamIterativeTreeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:pandamonium',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamPandamoniumProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:simulated-user',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new SimulatedUser(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'sequence',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new SequenceProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('ws:') ||
      providerPath.startsWith('wss:') ||
      providerPath === 'websocket' ||
      providerPath === 'ws' ||
      providerPath === 'wss',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new WebSocketProvider(providerPath, providerOptions);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('huggingface:') || providerPath.startsWith('hf:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      if (splits.length < 3) {
        throw new Error(
          `Invalid Huggingface provider path: ${providerPath}. Use one of the following providers: huggingface:feature-extraction:<model name>, huggingface:text-generation:<model name>, huggingface:text-classification:<model name>, huggingface:token-classification:<model name>`,
        );
      }
      const modelName = splits.slice(2).join(':');
      if (splits[1] === 'feature-extraction') {
        return new HuggingfaceFeatureExtractionProvider(modelName, providerOptions);
      }
      if (splits[1] === 'sentence-similarity') {
        return new HuggingfaceSentenceSimilarityProvider(modelName, providerOptions);
      }
      if (splits[1] === 'text-generation') {
        return new HuggingfaceTextGenerationProvider(modelName, providerOptions);
      }
      if (splits[1] === 'text-classification') {
        return new HuggingfaceTextClassificationProvider(modelName, providerOptions);
      }
      if (splits[1] === 'token-classification') {
        return new HuggingfaceTokenExtractionProvider(modelName, providerOptions);
      }
      throw new Error(
        `Invalid Huggingface provider path: ${providerPath}. Use one of the following providers: huggingface:feature-extraction:<model name>, huggingface:text-generation:<model name>, huggingface:text-classification:<model name>, huggingface:token-classification:<model name>`,
      );
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('python:') ||
      (providerPath.startsWith('file://') &&
        (providerPath.endsWith('.py') || providerPath.includes('.py:'))),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const scriptPath = providerPath.startsWith('file://')
        ? providerPath.slice('file://'.length)
        : providerPath.split(':').slice(1).join(':');
      return new PythonProvider(scriptPath, providerOptions);
    },
  },
];
