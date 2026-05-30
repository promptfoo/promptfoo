import { AIStudioChatProvider, AIStudioEmbeddingProvider } from '../google/ai.studio';
import { GeminiImageProvider } from '../google/gemini-image';
import { GoogleImageProvider } from '../google/image';
import { GoogleLiveProvider } from '../google/live';
import { VertexChatProvider, VertexEmbeddingProvider } from '../google/vertex';
import { GoogleVideoProvider } from '../google/video';

import type { ProviderFactory } from '../registryTypes';

export const googleProviderFactories: ProviderFactory[] = [
  {
    test: (providerPath: string) => providerPath.startsWith('vertex:'),
    create: async (providerPath, providerOptions) => {
      const splits = providerPath.split(':');
      const firstPart = splits[1];
      if (firstPart === 'video') {
        const modelName = splits.slice(2).join(':');
        return new GoogleVideoProvider(modelName, {
          ...providerOptions,
          id: providerPath,
          config: { ...providerOptions.config, vertexai: true },
        });
      }
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
    test: (providerPath: string) =>
      providerPath.startsWith('google:') || providerPath.startsWith('palm:'),
    create: async (providerPath, providerOptions) => {
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
          return new GoogleVideoProvider(modelName, {
            ...providerOptions,
            id: providerPath,
          });
        } else if (serviceType === 'embedding' || serviceType === 'embeddings') {
          if (!modelName) {
            throw new Error(
              `Missing model name for ${providerPath}. Use e.g. google:embedding:gemini-embedding-001.`,
            );
          }
          return new AIStudioEmbeddingProvider(modelName, providerOptions);
        }
      }

      // Default to regular Google API
      const modelName = splits[1];

      // Check if this is a Gemini native image generation model
      // These models have 'image' in their name (e.g., gemini-2.5-flash-image, gemini-3.1-flash-image-preview)
      if (modelName.includes('-image')) {
        return new GeminiImageProvider(modelName, providerOptions);
      }

      return new AIStudioChatProvider(modelName, providerOptions);
    },
  },
];
