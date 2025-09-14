import path from 'path';

import dedent from 'dedent';
import { importModule } from '../esm.js';
import logger from '../logger.js';
import { MemoryPoisoningProvider } from '../redteam/providers/agentic/memoryPoisoning.js';
import RedteamBestOfNProvider from '../redteam/providers/bestOfN.js';
import { CrescendoProvider as RedteamCrescendoProvider } from '../redteam/providers/crescendo/index.js';
import RedteamCustomProvider from '../redteam/providers/custom/index.js';
import RedteamGoatProvider from '../redteam/providers/goat.js';
import RedteamIterativeProvider from '../redteam/providers/iterative.js';
import RedteamImageIterativeProvider from '../redteam/providers/iterativeImage.js';
import RedteamIterativeTreeProvider from '../redteam/providers/iterativeTree.js';
import RedteamMischievousUserProvider from '../redteam/providers/mischievousUser.js';
import { isJavascriptFile } from '../util/fileExtensions.js';
import { AI21ChatCompletionProvider } from './ai21.js';
import { AlibabaChatCompletionProvider, AlibabaEmbeddingProvider } from './alibaba.js';
import { AnthropicCompletionProvider } from './anthropic/completion.js';
import { AnthropicMessagesProvider } from './anthropic/messages.js';
import { ANTHROPIC_MODELS } from './anthropic/util.js';
import { AzureAssistantProvider } from './azure/assistant.js';
import { AzureChatCompletionProvider } from './azure/chat.js';
import { AzureCompletionProvider } from './azure/completion.js';
import { AzureEmbeddingProvider } from './azure/embedding.js';
import { AzureModerationProvider } from './azure/moderation.js';
import { BAMProvider } from './bam.js';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from './bedrock/index.js';
import { BrowserProvider } from './browser.js';
import { createCerebrasProvider } from './cerebras.js';
import { ClouderaAiChatCompletionProvider } from './cloudera.js';
import { CohereChatCompletionProvider, CohereEmbeddingProvider } from './cohere.js';
import { DatabricksMosaicAiChatCompletionProvider } from './databricks.js';
import { EchoProvider } from './echo.js';
import { FalImageGenerationProvider } from './fal.js';
import { createGitHubProvider } from './github/index.js';
import { GolangProvider } from './golangCompletion.js';
import { AIStudioChatProvider } from './google/ai.studio.js';
import { GoogleImageProvider } from './google/image.js';
import { GoogleLiveProvider } from './google/live.js';
import { VertexChatProvider, VertexEmbeddingProvider } from './google/vertex.js';
import { GroqProvider } from './groq.js';
import { HeliconeGatewayProvider } from './helicone.js';
import { HttpProvider } from './http.js';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from './huggingface';
import { JfrogMlChatCompletionProvider } from './jfrog.js';
import { createLambdaLabsProvider } from './lambdalabs.js';
import { LlamaProvider } from './llama.js';
import {
  LocalAiChatProvider,
  LocalAiCompletionProvider,
  LocalAiEmbeddingProvider,
} from './localai';
import { ManualInputProvider } from './manualInput.js';
import { MCPProvider } from './mcp/index.js';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from './mistral.js';
import { OllamaChatProvider, OllamaCompletionProvider, OllamaEmbeddingProvider } from './ollama.js';
import { OpenAiAssistantProvider } from './openai/assistant.js';
import { OpenAiChatCompletionProvider } from './openai/chat.js';
import { OpenAiCompletionProvider } from './openai/completion.js';
import { OpenAiEmbeddingProvider } from './openai/embedding.js';
import { OpenAiImageProvider } from './openai/image.js';
import { OpenAiModerationProvider } from './openai/moderation.js';
import { OpenAiRealtimeProvider } from './openai/realtime.js';
import { OpenAiResponsesProvider } from './openai/responses.js';
import { createOpenRouterProvider } from './openrouter.js';
import { parsePackageProvider } from './packageParser.js';
import { createPerplexityProvider } from './perplexity.js';
import { PortkeyChatCompletionProvider } from './portkey.js';
import { PromptfooModelProvider } from './promptfooModel.js';
import { PythonProvider } from './pythonCompletion.js';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from './replicate';
import { createScriptBasedProviderFactory } from './scriptBasedProvider.js';
import { ScriptCompletionProvider } from './scriptCompletion.js';
import { SequenceProvider } from './sequence.js';
import { SimulatedUser } from './simulatedUser.js';
import { createTogetherAiProvider } from './togetherai.js';
import { VoyageEmbeddingProvider } from './voyage.js';
import { WatsonXProvider } from './watsonx.js';
import { WebhookProvider } from './webhook.js';
import { WebSocketProvider } from './websocket.js';
import { createXAIProvider } from './xai/chat.js';
import { createXAIImageProvider } from './xai/image.js';
import { createLlamaApiProvider } from './llamaApi.js';

import type { LoadApiProviderContext } from '../types/index.js';
import type { ApiProvider, ProviderOptions } from '../types/providers.js';

interface ProviderFactory {
  test: (providerPath: string) => boolean;
  create: (
    providerPath: string,
    providerOptions: ProviderOptions,
    context: LoadApiProviderContext,
  ) => Promise<ApiProvider>;
}

export const providerMap: ProviderFactory[] = [
  createScriptBasedProviderFactory('exec', null, ScriptCompletionProvider),
  createScriptBasedProviderFactory('golang', 'go', GolangProvider),
  createScriptBasedProviderFactory('python', 'py', PythonProvider),
  {
    test: (providerPath: string) => providerPath === 'agentic:memory-poisoning',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new MemoryPoisoningProvider(providerOptions);
    },
  },
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

      // Handle nova-sonic model
      if (modelType === 'nova-sonic' || modelType.includes('amazon.nova-sonic')) {
        const { NovaSonicProvider } = await import('./bedrock/nova-sonic');
        return new NovaSonicProvider('amazon.nova-sonic-v1:0', providerOptions);
      }

      // Handle AgentCore
      if (modelType === 'agentcore' || modelType === 'agent-core') {
        const { AwsBedrockAgentCoreProvider } = await import('./bedrock/agentcore');
        return new AwsBedrockAgentCoreProvider(modelName, providerOptions);
      }

      if (modelType === 'completion') {
        // Backwards compatibility: `completion` used to be required
        return new AwsBedrockCompletionProvider(modelName, providerOptions);
      }
      if (modelType === 'embeddings' || modelType === 'embedding') {
        return new AwsBedrockEmbeddingProvider(modelName, providerOptions);
      }
      if (modelType === 'kb' || modelType === 'knowledge-base') {
        const { AwsBedrockKnowledgeBaseProvider } = await import('./bedrock/knowledgeBase');
        return new AwsBedrockKnowledgeBaseProvider(modelName, providerOptions);
      }
      // Reconstruct the full model name preserving the original format
      const fullModelName = splits.slice(1).join(':');
      return new AwsBedrockCompletionProvider(fullModelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('sagemaker:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const endpointName = splits.slice(2).join(':');

      // Dynamically import SageMaker provider
      const { SageMakerCompletionProvider, SageMakerEmbeddingProvider } = await import(
        './sagemaker'
      );

      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new SageMakerEmbeddingProvider(endpointName || modelType, providerOptions);
      }

      // Handle the 'sagemaker:<endpoint>' format (no model type specified)
      if (splits.length === 2) {
        return new SageMakerCompletionProvider(modelType, providerOptions);
      }

      // Handle special case for JumpStart models
      if (endpointName.includes('jumpstart') || modelType === 'jumpstart') {
        return new SageMakerCompletionProvider(endpointName, {
          ...providerOptions,
          config: {
            ...providerOptions.config,
            modelType: 'jumpstart',
          },
        });
      }

      // Handle 'sagemaker:<model-type>:<endpoint>' format for other model types
      return new SageMakerCompletionProvider(endpointName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          modelType,
        },
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('cerebras:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createCerebrasProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
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
      const { createCloudflareAiProvider } = await import('./cloudflare-ai');
      return createCloudflareAiProvider(providerPath, {
        ...providerOptions,
        env: context.env,
      });
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
    ) => createGitHubProvider(providerPath, providerOptions, context),
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
    test: (providerPath: string) => providerPath.startsWith('helicone:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      // Parse helicone:model format (e.g., helicone:openai/gpt-4o)
      const model = providerPath.substring('helicone:'.length);

      if (!model) {
        throw new Error(
          'Helicone provider requires a model in format helicone:<provider/model> (e.g., helicone:openai/gpt-4o, helicone:anthropic/claude-3-5-sonnet)',
        );
      }

      return new HeliconeGatewayProvider(model, providerOptions);
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
      const modelType = splits[1];

      // Handle hyperbolic:image:<model> format
      if (modelType === 'image') {
        const { createHyperbolicImageProvider } = await import('./hyperbolic/image');
        return createHyperbolicImageProvider(providerPath, {
          ...providerOptions,
          env: context.env,
        });
      }

      // Handle hyperbolic:audio:<model> format
      if (modelType === 'audio') {
        const { createHyperbolicAudioProvider } = await import('./hyperbolic/audio');
        return createHyperbolicAudioProvider(providerPath, {
          ...providerOptions,
          env: context.env,
        });
      }

      // Handle regular hyperbolic:<model> format for chat
      const { createHyperbolicProvider } = await import('./hyperbolic/chat');
      return createHyperbolicProvider(providerPath, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('litellm:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { createLiteLLMProvider } = await import('./litellm');
      return createLiteLLMProvider(providerPath, {
        config: providerOptions,
        env: context.env,
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
        return new OpenAiChatCompletionProvider(modelName || 'gpt-4.1-2025-04-14', providerOptions);
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
      if (modelType === 'responses') {
        return new OpenAiResponsesProvider(modelName || 'gpt-4.1-2025-04-14', providerOptions);
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
      if (OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES.includes(modelType)) {
        return new OpenAiResponsesProvider(modelType, providerOptions);
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
      return createOpenRouterProvider(providerPath, {
        config: providerOptions,
        env: context.env,
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
      return createPerplexityProvider(providerPath, {
        config: providerOptions,
        env: context.env,
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
    test: (providerPath: string) => providerPath.startsWith('llamaapi:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createLlamaApiProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('aimlapi:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { createAimlApiProvider } = await import('./aimlapi');
      return createAimlApiProvider(providerPath, {
        ...providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('docker:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { createDockerProvider } = await import('./docker');
      return createDockerProvider(providerPath, {
        ...providerOptions,
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
      const splits = providerPath.split(':');
      const modelType = splits[1];

      // Handle xai:image:<model> format
      if (modelType === 'image') {
        return createXAIImageProvider(providerPath, {
          ...providerOptions,
          env: context.env,
        });
      }

      // Handle regular xai:<model> format
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
          // This is a Live API request
          return new GoogleLiveProvider(modelName, providerOptions);
        } else if (serviceType === 'image') {
          // This is an Image Generation request
          return new GoogleImageProvider(modelName, providerOptions);
        }
      }

      // Default to regular Google API
      const modelName = splits[1];
      return new AIStudioChatProvider(modelName, providerOptions);
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
      // Preserve the original path as the provider ID
      const providerId = providerOptions.id ?? providerPath;

      if (providerPath.startsWith('file://')) {
        providerPath = providerPath.slice('file://'.length);
      }
      // Load custom module
      const modulePath = path.isAbsolute(providerPath)
        ? providerPath
        : path.join(context.basePath || process.cwd(), providerPath);

      const CustomApiProvider = await importModule(modulePath);
      return new CustomApiProvider({ ...providerOptions, id: providerId });
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
    test: (providerPath: string) => providerPath === 'mcp' || providerPath.startsWith('mcp:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      let config = providerOptions.config || { enabled: true };

      // Handle mcp:<server_name> format for server-specific configs
      if (splits.length > 1) {
        const serverName = splits[1];
        // User can configure specific server in the config
        config = {
          ...config,
          serverName,
        };
      }

      return new MCPProvider({
        config,
        id: providerOptions.id,
      });
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
    test: (providerPath: string) =>
      providerPath === 'promptfoo:redteam:custom' ||
      providerPath.startsWith('promptfoo:redteam:custom:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamCustomProvider(providerOptions.config);
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
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:mischievous-user',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return new RedteamMischievousUserProvider(providerOptions.config);
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
    test: (providerPath: string) => providerPath.startsWith('promptfoo:model:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const modelName = providerPath.split(':')[2];
      return new PromptfooModelProvider(modelName, {
        ...providerOptions,
        model: modelName,
      });
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
    test: (providerPath: string) => providerPath.startsWith('lambdalabs:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createLambdaLabsProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
];
