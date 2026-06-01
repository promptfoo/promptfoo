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
        // For bedrock:luma.ray-v2:0, reconstruct full model name from splits[1:]
        // For bedrock:video:luma.ray-v2:0, use modelName directly
        const videoModelName = modelName.includes('luma.ray')
          ? modelName
          : splits.slice(1).join(':') || 'luma.ray-v2:0';
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
      // Reconstruct the full model name preserving the original format
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
