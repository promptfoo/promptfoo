import { AwsBedrockConverseProvider } from '../bedrock/converse';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from '../bedrock/index';

import type { ProviderFactory } from '../registryTypes';

export const awsProviderFactories: ProviderFactory[] = [
  {
    test: (providerPath: string) => providerPath.startsWith('bedrock:'),
    create: async (providerPath, providerOptions) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const modelName = splits.slice(2).join(':');

      // Mythos is only available through Bedrock's Anthropic-compatible
      // Messages endpoint. Fable also supports that endpoint when explicitly
      // selected, while its bare form continues through Bedrock Runtime below.
      const candidateAnthropicModel =
        modelType === 'messages' ? modelName : splits.length === 2 ? splits[1] : undefined;
      const requestedAnthropicModel =
        candidateAnthropicModel ??
        (modelType === 'converse' || modelType === 'completion' ? modelName : undefined);
      if (/^[^.]+\.anthropic\.claude-mythos-5$/.test(requestedAnthropicModel ?? '')) {
        throw new Error(
          `Amazon Bedrock model "${requestedAnthropicModel}" is not a valid Mythos model ID. ` +
            `Use "bedrock:anthropic.claude-mythos-5"; Mythos does not support geo or global inference IDs.`,
        );
      }
      if (candidateAnthropicModel?.startsWith('anthropic.claude-')) {
        const {
          createBedrockAnthropicMessagesProvider,
          isBedrockAnthropicMessagesModel,
          requiresBedrockAnthropicMessagesModel,
        } = await import('../bedrock/anthropicMessages');
        if (
          isBedrockAnthropicMessagesModel(candidateAnthropicModel) &&
          (modelType === 'messages' ||
            requiresBedrockAnthropicMessagesModel(candidateAnthropicModel))
        ) {
          return createBedrockAnthropicMessagesProvider(candidateAnthropicModel, {
            ...providerOptions,
            id: providerOptions.id ?? providerPath,
          });
        }
      }
      if (modelType === 'messages') {
        throw new Error(
          `Amazon Bedrock model "${modelName}" is not supported by the Anthropic Messages ` +
            `provider. Supported models: anthropic.claude-fable-5 and anthropic.claude-mythos-5.`,
        );
      }

      if (
        (modelType === 'converse' || modelType === 'completion') &&
        modelName.startsWith('anthropic.claude-')
      ) {
        const { requiresBedrockAnthropicMessagesModel } = await import(
          '../bedrock/anthropicMessages'
        );
        if (requiresBedrockAnthropicMessagesModel(modelName)) {
          throw new Error(
            `Amazon Bedrock model "${modelName}" uses the Anthropic Messages API, not ` +
              `${modelType === 'converse' ? 'Converse' : 'InvokeModel'}. Use ` +
              `"bedrock:${modelName}" or "bedrock:messages:${modelName}".`,
          );
        }
      }

      // OpenAI frontier models (gpt-5.x) are served only through Bedrock's OpenAI-compatible
      // Responses API on the regional mantle endpoint — never the native InvokeModel/Converse
      // APIs. Route them before the per-type handlers so `bedrock:openai.gpt-5.5`,
      // `bedrock:converse:openai.gpt-5.5`, and `bedrock:completion:openai.gpt-5.5` all resolve
      // correctly. Open-weight gpt-oss models fall through to InvokeModel/Converse below.
      //
      // Only those three forms carry a frontier model id, so restrict the candidate to the
      // bare id (`bedrock:openai.gpt-5.5`, i.e. exactly two segments) and the explicit
      // `converse:`/`completion:` forms. Frontier ids contain no colon, so the bare form is
      // always two segments. This prevents sub-typed forms whose id merely contains `openai.`
      // (`bedrock:kb:...openai...`, `:embeddings:`, `:agents:`, `:video:`, inference-profile
      // ARNs, ...) from being hijacked here instead of reaching their own handlers below.
      const candidateOpenAiModel =
        modelType === 'converse' || modelType === 'completion'
          ? modelName
          : splits.length === 2
            ? splits[1]
            : undefined;
      // Gate the (heavy) openaiResponses import — which pulls in the OpenAI Responses stack —
      // behind a cheap `openai.` prefix check, like every other handler import below, so the
      // common non-OpenAI bedrock: models don't load it at construction. The prefix is a
      // necessary condition; isBedrockOpenAiResponsesModel remains the source of truth for the
      // frontier-vs-gpt-oss decision (a gpt-oss id passes the prefix gate but is rejected there
      // and falls through to InvokeModel below).
      if (candidateOpenAiModel?.startsWith('openai.')) {
        const { isBedrockOpenAiResponsesModel, createBedrockOpenAiResponsesProvider } =
          await import('../bedrock/openaiResponses');
        if (isBedrockOpenAiResponsesModel(candidateOpenAiModel)) {
          return createBedrockOpenAiResponsesProvider(candidateOpenAiModel, {
            ...providerOptions,
            id: providerOptions.id ?? providerPath,
          });
        }
      }

      // Handle Converse API
      if (modelType === 'converse') {
        return new AwsBedrockConverseProvider(modelName, providerOptions);
      }

      // Handle nova-sonic model
      if (modelType === 'nova-sonic' || modelType.includes('amazon.nova-sonic')) {
        const { NovaSonicProvider } = await import('../bedrock/nova-sonic');
        return new NovaSonicProvider('amazon.nova-sonic-v1:0', providerOptions);
      }

      // Handle Luma Ray video model
      // Supports: bedrock:luma.ray-v2:0 or bedrock:video:luma.ray-v2:0
      // Note: Luma model IDs include version after colon (e.g., luma.ray-v2:0)
      if (modelType.includes('luma.ray') || modelName.includes('luma.ray')) {
        const { LumaRayVideoProvider } = await import('../bedrock/luma-ray');
        // For bedrock:video:luma.ray-v2:0 the id is already in modelName; for
        // bedrock:luma.ray-v2:0 reconstruct it from splits[1:] (modelType holds the
        // id, which is non-empty here since this branch required it to contain 'luma.ray').
        const videoModelName = modelName.includes('luma.ray')
          ? modelName
          : splits.slice(1).join(':');
        return new LumaRayVideoProvider(videoModelName, providerOptions);
      }

      // Handle Nova Reel video model. Canonical forms: `bedrock:video:amazon.nova-reel-v1:1`
      // (explicit model) or `bedrock:video` (defaults the model). The model segment is used
      // verbatim as the Bedrock modelId, so the `video:` prefix is required to carry the full
      // id — `bedrock:amazon.nova-reel-v1:1` would collapse the model name to its version tail.
      // Match when modelType names a nova-reel model, or modelType is 'video' with a
      // nova-reel or empty model segment.
      if (
        modelType.includes('amazon.nova-reel') ||
        (modelType === 'video' && (modelName.includes('amazon.nova-reel') || modelName === ''))
      ) {
        const { NovaReelVideoProvider } = await import('../bedrock/nova-reel');
        const videoModelName = modelName || 'amazon.nova-reel-v1:1';
        return new NovaReelVideoProvider(videoModelName, providerOptions);
      }

      // Handle Bedrock Agents
      if (modelType === 'agents') {
        const { AwsBedrockAgentsProvider } = await import('../bedrock/agents');
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
        const { AwsBedrockKnowledgeBaseProvider } = await import('../bedrock/knowledgeBase');
        return new AwsBedrockKnowledgeBaseProvider(modelName, providerOptions);
      }
      // Reconstruct the full model name preserving the original format. Frontier OpenAI
      // models were already routed to the Responses provider near the top of this factory.
      const fullModelName = splits.slice(1).join(':');
      return new AwsBedrockCompletionProvider(fullModelName, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('bedrock-agent:'),
    create: async (providerPath, providerOptions) => {
      const agentId = providerPath.substring('bedrock-agent:'.length);
      const { AwsBedrockAgentsProvider } = await import('../bedrock/agents');
      return new AwsBedrockAgentsProvider(agentId, providerOptions);
    },
  },
  {
    test: (providerPath: string) => providerPath.startsWith('sagemaker:'),
    create: async (providerPath, providerOptions) => {
      const splits = providerPath.split(':');
      const modelType = splits[1];
      const endpointName = splits.slice(2).join(':');

      // Dynamically import SageMaker provider
      const { SageMakerCompletionProvider, SageMakerEmbeddingProvider } = await import(
        '../sagemaker'
      );

      if (modelType === 'embedding' || modelType === 'embeddings') {
        return new SageMakerEmbeddingProvider(endpointName || modelType, providerOptions);
      }

      // Handle the 'sagemaker:<endpoint>' format (no model type specified)
      if (splits.length === 2) {
        return new SageMakerCompletionProvider(modelType, providerOptions);
      }

      // Handle 'sagemaker:<model-type>:<endpoint>'. JumpStart models are selected
      // either by the explicit `jumpstart` model type or by an endpoint name
      // containing 'jumpstart'; every other model type passes through unchanged.
      const resolvedModelType =
        endpointName.includes('jumpstart') || modelType === 'jumpstart' ? 'jumpstart' : modelType;
      return new SageMakerCompletionProvider(endpointName, {
        ...providerOptions,
        config: {
          ...providerOptions.config,
          modelType: resolvedModelType,
        },
      });
    },
  },
];
