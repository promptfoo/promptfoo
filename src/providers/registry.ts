import path from 'path';

import dedent from 'dedent';
import { importModule } from '../esm';
import logger from '../logger';
import { MemoryPoisoningProvider } from '../redteam/providers/agentic/memoryPoisoning';
import RedteamAuthoritativeMarkupInjectionProvider from '../redteam/providers/authoritativeMarkupInjection';
import RedteamBestOfNProvider from '../redteam/providers/bestOfN';
import { CrescendoProvider as RedteamCrescendoProvider } from '../redteam/providers/crescendo/index';
import RedteamCustomProvider from '../redteam/providers/custom/index';
import RedteamGoatProvider from '../redteam/providers/goat';
import { HydraProvider as RedteamHydraProvider } from '../redteam/providers/hydra/index';
import RedteamIndirectWebPwnProvider from '../redteam/providers/indirectWebPwn';
import RedteamIterativeProvider from '../redteam/providers/iterative';
import RedteamImageIterativeProvider from '../redteam/providers/iterativeImage';
import RedteamIterativeMetaProvider from '../redteam/providers/iterativeMeta';
import RedteamIterativeTreeProvider from '../redteam/providers/iterativeTree';
import RedteamMischievousUserProvider from '../redteam/providers/mischievousUser';
import { isJavascriptFile } from '../util/fileExtensions';
import { AI21ChatCompletionProvider } from './ai21';
import { AlibabaChatCompletionProvider, AlibabaEmbeddingProvider } from './alibaba';
import { AnthropicCompletionProvider } from './anthropic/completion';
import { AnthropicMessagesProvider } from './anthropic/messages';
import { ANTHROPIC_MODELS } from './anthropic/util';
import { AzureAssistantProvider } from './azure/assistant';
import { AzureChatCompletionProvider } from './azure/chat';
import { AzureCompletionProvider } from './azure/completion';
import { AzureEmbeddingProvider } from './azure/embedding';
import { AzureFoundryAgentProvider } from './azure/foundry-agent';
import { AzureModerationProvider } from './azure/moderation';
import { AzureResponsesProvider } from './azure/responses';
import { AzureVideoProvider } from './azure/video';
import { AwsBedrockConverseProvider } from './bedrock/converse';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from './bedrock/index';
import { BrowserProvider } from './browser';
import { createCerebrasProvider } from './cerebras';
import { ClouderaAiChatCompletionProvider } from './cloudera';
import { CohereChatCompletionProvider, CohereEmbeddingProvider } from './cohere';
import { DatabricksMosaicAiChatCompletionProvider } from './databricks';
import { createDeepSeekProvider } from './deepseek';
import { EchoProvider } from './echo';
import {
  ElevenLabsAgentsProvider,
  ElevenLabsAlignmentProvider,
  ElevenLabsHistoryProvider,
  ElevenLabsIsolationProvider,
  ElevenLabsSTTProvider,
  ElevenLabsTTSProvider,
} from './elevenlabs';
import { createEnvoyProvider } from './envoy';
import { FalImageGenerationProvider } from './fal';
import { createGitHubProvider } from './github/index';
import { GolangProvider } from './golangCompletion';
import { AIStudioChatProvider } from './google/ai.studio';
import { GeminiImageProvider } from './google/gemini-image';
import { GoogleImageProvider } from './google/image';
import { GoogleLiveProvider } from './google/live';
import { VertexChatProvider, VertexEmbeddingProvider } from './google/vertex';
import { GoogleVideoProvider } from './google/video';
import { GroqProvider, GroqResponsesProvider } from './groq/index';
import { HeliconeGatewayProvider } from './helicone';
import { HttpProvider } from './http';
import {
  HuggingfaceChatCompletionProvider,
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from './huggingface';
import { JfrogMlChatCompletionProvider } from './jfrog';
import { LlamaProvider } from './llama';
import { createLlamaApiProvider } from './llamaApi';
import {
  LocalAiChatProvider,
  LocalAiCompletionProvider,
  LocalAiEmbeddingProvider,
} from './localai';
import { ManualInputProvider } from './manualInput';
import { MCPProvider } from './mcp/index';
import { MistralChatCompletionProvider, MistralEmbeddingProvider } from './mistral';
import { createNscaleProvider } from './nscale';
import { OllamaChatProvider, OllamaCompletionProvider, OllamaEmbeddingProvider } from './ollama';
import { OpenAiAssistantProvider } from './openai/assistant';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { OpenAiImageProvider } from './openai/image';
import { OpenAiModerationProvider } from './openai/moderation';
import { OpenAiRealtimeProvider } from './openai/realtime';
import { OpenAiResponsesProvider } from './openai/responses';
import { OpenAiVideoProvider } from './openai/video';
import { createOpenRouterProvider } from './openrouter';
import { parsePackageProvider } from './packageParser';
import { createPerplexityProvider } from './perplexity';
import { PortkeyChatCompletionProvider } from './portkey';
import { PromptfooModelProvider } from './promptfooModel';
import { PythonProvider } from './pythonCompletion';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from './replicate';
import { RubyProvider } from './rubyCompletion';
import { createScriptBasedProviderFactory } from './scriptBasedProvider';
import { ScriptCompletionProvider } from './scriptCompletion';
import { SequenceProvider } from './sequence';
import { SimulatedUser } from './simulatedUser';
import { createSnowflakeProvider } from './snowflake';
import { createTogetherAiProvider } from './togetherai';
import { TransformersEmbeddingProvider, TransformersTextGenerationProvider } from './transformers';
import { createTrueFoundryProvider } from './truefoundry';
import { createVercelProvider } from './vercel';
import { VoyageEmbeddingProvider } from './voyage';
import { WatsonXChatProvider, WatsonXProvider } from './watsonx';
import { WebhookProvider } from './webhook';
import { WebSocketProvider } from './websocket';
import { createXAIProvider } from './xai/chat';
import { createXAIImageProvider } from './xai/image';
import { createXAIResponsesProvider } from './xai/responses';
import { createXAIVideoProvider } from './xai/video';
import { createXAIVoiceProvider } from './xai/voice';

import type { LoadApiProviderContext } from '../types/index';
import type { ApiProvider, ProviderOptions } from '../types/providers';

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
  createScriptBasedProviderFactory('ruby', 'rb', RubyProvider),
  {
    test: (providerPath: string) => providerPath === 'agentic:memory-poisoning',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new MemoryPoisoningProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('ai21:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
    test: (providerPath: string) =>
      providerPath.startsWith('opencode:') || providerPath === 'opencode',
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { OpenCodeSDKProvider } = await import('./opencode-sdk');

      // opencode:sdk or opencode - uses OpenCode's configured default model
      // Model selection is configured via OpenCode CLI: opencode config set model <provider/model>
      return new OpenCodeSDKProvider({
        ...providerOptions,
        id: providerPath,
        config: providerOptions.config,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('anthropic:claude-agent-sdk') ||
      providerPath.startsWith('anthropic:claude-code'),
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { ClaudeCodeSDKProvider } = await import('./claude-agent-sdk');
      return new ClaudeCodeSDKProvider({
        ...providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('anthropic:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      if (modelType === 'foundry-agent') {
        return new AzureFoundryAgentProvider(deploymentName, providerOptions);
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
      if (modelType === 'responses') {
        return new AzureResponsesProvider(deploymentName || 'gpt-4.1-2025-04-14', providerOptions);
      }
      if (modelType === 'video') {
        return new AzureVideoProvider(deploymentName || 'sora', providerOptions);
      }
      throw new Error(
        `Unknown Azure model type: ${modelType}. Use one of the following providers: azure:chat:<model name>, azure:assistant:<assistant id>, azure:completion:<model name>, azure:moderation:<model name>, azure:responses:<model name>, azure:video:<deployment name>`,
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('bam:'),
    create: async () => {
      throw new Error(
        'IBM BAM provider has been deprecated. The service was sunset in March 2025. Please use the WatsonX provider instead. See https://promptfoo.dev/docs/providers/watsonx for migration instructions.',
      );
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('bedrock:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      // Handle Converse API
      if (modelType === 'converse') {
        return new AwsBedrockConverseProvider(modelName, providerOptions);
      }

      // Handle nova-sonic model
      if (modelType === 'nova-sonic' || modelType.includes('amazon.nova-sonic')) {
        const { NovaSonicProvider } = await import('./bedrock/nova-sonic');
        return new NovaSonicProvider('amazon.nova-sonic-v1:0', providerOptions);
      }

      // Handle Luma Ray video model
      // Supports: bedrock:luma.ray-v2:0 or bedrock:video:luma.ray-v2:0
      // Note: Luma model IDs include version after colon (e.g., luma.ray-v2:0)
      if (modelType.includes('luma.ray') || modelName.includes('luma.ray')) {
        const { LumaRayVideoProvider } = await import('./bedrock/luma-ray');
        // For bedrock:luma.ray-v2:0, reconstruct full model name from splits[1:]
        // For bedrock:video:luma.ray-v2:0, use modelName directly
        const videoModelName = modelName.includes('luma.ray')
          ? modelName
          : splits.slice(1).join(':') || 'luma.ray-v2:0';
        return new LumaRayVideoProvider(videoModelName, providerOptions);
      }

      // Handle Nova Reel video model
      // Supports: bedrock:video:amazon.nova-reel-v1:1 or bedrock:amazon.nova-reel-v1:1
      // Only match if modelType contains nova-reel OR (modelType is 'video' AND modelName contains nova-reel or is empty)
      if (
        modelType.includes('amazon.nova-reel') ||
        (modelType === 'video' && (modelName.includes('amazon.nova-reel') || modelName === ''))
      ) {
        const { NovaReelVideoProvider } = await import('./bedrock/nova-reel');
        const videoModelName = modelName || 'amazon.nova-reel-v1:1';
        return new NovaReelVideoProvider(videoModelName, providerOptions);
      }

      // Handle Bedrock Agents
      if (modelType === 'agents') {
        const { AwsBedrockAgentsProvider } = await import('./bedrock/agents');
        return new AwsBedrockAgentsProvider(modelName, providerOptions);
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
    test: (providerPath: string) => providerPath.startsWith('bedrock-agent:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      const agentId = providerPath.substring('bedrock-agent:'.length);
      const { AwsBedrockAgentsProvider } = await import('./bedrock/agents');
      return new AwsBedrockAgentsProvider(agentId, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('sagemaker:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
    test: (providerPath: string) => providerPath.startsWith('cloudflare-gateway:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { createCloudflareGatewayProvider } = await import('./cloudflare-gateway');
      return createCloudflareGatewayProvider(providerPath, {
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      return createDeepSeekProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath === 'echo',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new EchoProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('elevenlabs:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const capability = splits[1]; // tts, stt, agents, history, isolation, alignment
      const _additionalId = splits.length > 2 ? splits.slice(2).join(':') : undefined;

      // Route to appropriate provider based on capability
      switch (capability) {
        case 'tts':
          return new ElevenLabsTTSProvider(providerPath, {
            ...providerOptions,
            env: context.env,
          });
        case 'stt':
          return new ElevenLabsSTTProvider(providerPath, {
            ...providerOptions,
            env: context.env,
          });
        case 'agents':
          return new ElevenLabsAgentsProvider(providerPath, {
            ...providerOptions,
            env: context.env,
          });
        case 'history':
          return new ElevenLabsHistoryProvider(providerPath, {
            ...providerOptions,
            env: context.env,
          });
        case 'isolation':
          return new ElevenLabsIsolationProvider(providerPath, {
            ...providerOptions,
            env: context.env,
          });
        case 'alignment':
          return new ElevenLabsAlignmentProvider(providerPath, {
            ...providerOptions,
            env: context.env,
          });
        default:
          throw new Error(
            `ElevenLabs capability "${capability}" is not supported. Available: tts, stt, agents, history, isolation, alignment`,
          );
      }
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('envoy:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createEnvoyProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('f5:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
    ) => {
      // Handle groq:responses:<model> format for Responses API
      if (providerPath.startsWith('groq:responses:')) {
        const modelName = providerPath.slice('groq:responses:'.length);
        if (!modelName) {
          throw new Error(
            `Invalid groq:responses provider path: "${providerPath}". ` +
              'Use format groq:responses:<model> (e.g., groq:responses:llama-3.3-70b-versatile)',
          );
        }
        return new GroqResponsesProvider(modelName, providerOptions);
      }

      // Handle groq:<model> format for Chat Completions API
      const modelName = providerPath.slice('groq:'.length);
      if (!modelName) {
        throw new Error(
          `Invalid groq provider path: "${providerPath}". ` +
            'Use format groq:<model> (e.g., groq:llama-3.3-70b-versatile)',
        );
      }
      return new GroqProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('helicone:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
    test: (providerPath: string) => providerPath.startsWith('nscale:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createNscaleProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('ollama:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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

      // Codex SDK providers (openai:codex-sdk or openai:codex)
      if (modelType === 'codex-sdk' || modelType === 'codex') {
        const { OpenAICodexSDKProvider } = await import('./openai/codex-sdk');
        return new OpenAICodexSDKProvider({
          ...providerOptions,
          env: context.env,
        });
      }
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
      if (modelType === 'transcription') {
        const { OpenAiTranscriptionProvider } = await import('./openai/transcription');
        return new OpenAiTranscriptionProvider(
          modelName || 'gpt-4o-transcribe-diarize',
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
      if (OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES.includes(modelType)) {
        return new OpenAiResponsesProvider(modelType, providerOptions);
      }
      if (modelType === 'agents') {
        const { OpenAiAgentsProvider } = await import('./openai/agents');
        return new OpenAiAgentsProvider(modelName || 'default-agent', providerOptions);
      }
      if (modelType === 'chatkit') {
        const { OpenAiChatKitProvider } = await import('./openai/chatkit');
        return new OpenAiChatKitProvider(modelName || '', providerOptions);
      }
      if (modelType === 'assistant') {
        return new OpenAiAssistantProvider(modelName, providerOptions);
      }
      if (modelType === 'image') {
        return new OpenAiImageProvider(modelName, providerOptions);
      }
      if (modelType === 'video') {
        return new OpenAiVideoProvider(modelName || 'sora-2', providerOptions);
      }
      // Assume user did not provide model type, and it's a chat model
      logger.warn(
        `Unknown OpenAI model type: ${modelType}. Treating it as a chat model. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>, openai:embeddings:<model name>, openai:image:<model name>, openai:video:<model name>, openai:realtime:<model name>, openai:agents:<agent name>, openai:chatkit:<workflow_id>, openai:codex-sdk`,
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
      _context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelName = splits.slice(1).join(':');
      return new PortkeyChatCompletionProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('quiverai:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { createQuiverAiProvider } = await import('./quiverai');
      return createQuiverAiProvider(providerPath, providerOptions, context.env);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('replicate:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
    test: (providerPath: string) => providerPath.startsWith('truefoundry:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createTrueFoundryProvider(providerPath, {
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
    test: (providerPath: string) => providerPath.startsWith('cometapi:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      const { createCometApiProvider } = await import('./cometapi');
      return createCometApiProvider(providerPath, {
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
    test: (providerPath: string) => providerPath.startsWith('vercel:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createVercelProvider(providerPath, {
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
    ) => {
      return new VoyageEmbeddingProvider(providerPath.split(':')[1], providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('watsonx:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];

      // Support watsonx:chat:<model> for chat API
      if (modelType === 'chat') {
        const modelName = splits.slice(2).join(':');
        return new WatsonXChatProvider(modelName, providerOptions);
      }

      // Default: watsonx:<model> for text generation
      const modelName = splits.slice(1).join(':');
      return new WatsonXProvider(modelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('webhook:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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

      // Handle xai:video:<model> format for Grok Imagine video generation
      if (modelType === 'video') {
        return createXAIVideoProvider(providerPath, {
          ...providerOptions,
          env: context.env,
        });
      }

      // Handle xai:responses:<model> format for Agent Tools API
      if (modelType === 'responses') {
        return createXAIResponsesProvider(providerPath, {
          ...providerOptions,
          env: context.env,
        });
      }

      // Handle xai:voice:<model> format for Voice Agent API
      if (modelType === 'voice') {
        return createXAIVoiceProvider(providerPath, {
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');

      if (splits.length >= 3) {
        const serviceType = splits[1];
        const modelName = splits.slice(2).join(':');

        if (serviceType === 'live') {
          // This is a Live API request
          return new GoogleLiveProvider(modelName, providerOptions);
        } else if (serviceType === 'image') {
          // This is an Imagen image generation request
          return new GoogleImageProvider(modelName, providerOptions);
        } else if (serviceType === 'video') {
          // This is a Veo video generation request
          return new GoogleVideoProvider(modelName, providerOptions);
        }
      }

      // Default to regular Google API
      const modelName = splits[1];

      // Check if this is a Gemini native image generation model
      // These models have 'image' in their name (e.g., gemini-2.5-flash-image, gemini-3-pro-image-preview)
      if (modelName.includes('-image')) {
        return new GeminiImageProvider(modelName, providerOptions);
      }

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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new ManualInputProvider(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:best-of-n',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamBestOfNProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:crescendo',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamCrescendoProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath === 'promptfoo:redteam:custom' ||
      providerPath.startsWith('promptfoo:redteam:custom:'),
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamCustomProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:goat',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamGoatProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) =>
      providerPath === 'promptfoo:redteam:authoritative-markup-injection',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamAuthoritativeMarkupInjectionProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:mischievous-user',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamMischievousUserProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamIterativeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:image',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamImageIterativeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:tree',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamIterativeTreeProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:iterative:meta',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamIterativeMetaProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:hydra',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamHydraProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:redteam:indirect-web-pwn',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new RedteamIndirectWebPwnProvider(providerOptions.config);
    },
  },
  {
    test: (providerPath: string) => providerPath === 'promptfoo:simulated-user',
    create: async (
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      return new SimulatedUser(providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('promptfoo:model:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
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
      _context: LoadApiProviderContext,
    ) => {
      const splits = providerPath.split(':');
      if (splits.length < 3) {
        throw new Error(
          `Invalid Huggingface provider path: ${providerPath}. Use one of the following providers: huggingface:chat:<model name>, huggingface:text-generation:<model name>, huggingface:feature-extraction:<model name>, huggingface:text-classification:<model name>, huggingface:token-classification:<model name>, huggingface:sentence-similarity:<model name>`,
        );
      }
      const modelName = splits.slice(2).join(':');
      if (splits[1] === 'chat') {
        return new HuggingfaceChatCompletionProvider(modelName, providerOptions);
      }
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
        `Invalid Huggingface provider path: ${providerPath}. Use one of the following providers: huggingface:chat:<model name>, huggingface:text-generation:<model name>, huggingface:feature-extraction:<model name>, huggingface:text-classification:<model name>, huggingface:token-classification:<model name>, huggingface:sentence-similarity:<model name>`,
      );
    },
  },
  {
    test: (providerPath: string) =>
      providerPath.startsWith('transformers:') || providerPath.startsWith('transformers.js:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      // Validate dependency is available early, before parsing config
      const { validateTransformersDependency } = await import('./transformersAvailability');
      await validateTransformersDependency();

      const splits = providerPath.split(':');
      if (splits.length < 3) {
        throw new Error(
          `Invalid Transformers.js provider path: ${providerPath}. ` +
            'Format: transformers:<task>:<model>\n' +
            'Supported tasks: feature-extraction, text-generation\n' +
            'Example: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2',
        );
      }
      const taskType = splits[1];
      const modelName = splits.slice(2).join(':');

      switch (taskType) {
        case 'feature-extraction':
        case 'embeddings':
          return new TransformersEmbeddingProvider(modelName, providerOptions);
        case 'text-generation':
          return new TransformersTextGenerationProvider(modelName, providerOptions);
        default:
          throw new Error(
            `Unsupported Transformers.js task type: ${taskType}. ` +
              'Supported tasks: feature-extraction (alias: embeddings), text-generation',
          );
      }
    },
  },
  {
    test: (providerPath: string) => providerPath === 'slack' || providerPath.startsWith('slack:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      _context: LoadApiProviderContext,
    ) => {
      try {
        const { SlackProvider } = await import('./slack');

        // Handle plain 'slack' format
        if (providerPath === 'slack') {
          return new SlackProvider(providerOptions);
        }

        // Handle slack:* formats
        const splits = providerPath.split(':');

        if (splits.length < 2) {
          throw new Error(
            'Invalid Slack provider path. Use slack:<channel_id> or slack:channel:<channel_id>',
          );
        }

        // Handle slack:C0123ABCDEF format
        if (splits.length === 2) {
          return new SlackProvider({
            ...providerOptions,
            config: {
              ...providerOptions.config,
              channel: splits[1],
            },
          });
        }

        // Handle slack:channel:C0123ABCDEF or slack:user:U0123ABCDEF format
        const targetType = splits[1];
        const targetId = splits.slice(2).join(':');

        if (targetType === 'channel' || targetType === 'user') {
          return new SlackProvider({
            ...providerOptions,
            config: {
              ...providerOptions.config,
              channel: targetId,
            },
          });
        } else {
          throw new Error(`Invalid Slack target type: ${targetType}. Use 'channel' or 'user'`);
        }
      } catch (error: any) {
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('@slack/web-api')) {
          throw new Error(
            'The Slack provider requires the @slack/web-api package. Please install it with: npm install @slack/web-api',
          );
        }
        throw error;
      }
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('snowflake:'),
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      return createSnowflakeProvider(providerPath, {
        config: providerOptions,
        env: context.env,
      });
    },
  },
];
