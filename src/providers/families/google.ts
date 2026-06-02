import type { ProviderFactory } from '../registryTypes';

// Every provider class is imported lazily inside its factory so that merely
// loading this family module (which happens on any `vertex:`/`google:`/`palm:`
// lookup) stays cheap: a given path pulls in only the provider it actually
// constructs, never the whole Google provider surface.
export const googleProviderFactories: ProviderFactory[] = [
  {
    test: (providerPath: string) => providerPath.startsWith('vertex:'),
    create: async (providerPath, providerOptions) => {
      const splits = providerPath.split(':');
      const firstPart = splits[1];
      if (firstPart === 'video') {
        const { GoogleVideoProvider } = await import('../google/video');
        const modelName = splits.slice(2).join(':');
        return new GoogleVideoProvider(modelName, {
          ...providerOptions,
          id: providerPath,
          config: { ...providerOptions.config, vertexai: true },
        });
      }
      const { VertexChatProvider, VertexEmbeddingProvider } = await import('../google/vertex');
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
          const { GoogleLiveProvider } = await import('../google/live');
          return new GoogleLiveProvider(modelName, providerOptions);
        } else if (serviceType === 'image') {
          // This is an Imagen image generation request
          const { GoogleImageProvider } = await import('../google/image');
          return new GoogleImageProvider(modelName, providerOptions);
        } else if (serviceType === 'video') {
          // This is a Veo video generation request
          const { GoogleVideoProvider } = await import('../google/video');
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
          const { AIStudioEmbeddingProvider } = await import('../google/ai.studio');
          return new AIStudioEmbeddingProvider(modelName, providerOptions);
        }
      }

      // Default to regular Google API
      const modelName = splits[1];

      // Check if this is a Gemini native image generation model
      // These models have 'image' in their name (e.g., gemini-2.5-flash-image, gemini-3.1-flash-image-preview)
      if (modelName.includes('-image')) {
        const { GeminiImageProvider } = await import('../google/gemini-image');
        return new GeminiImageProvider(modelName, providerOptions);
      }

      const { AIStudioChatProvider } = await import('../google/ai.studio');
      return new AIStudioChatProvider(modelName, providerOptions);
    },
  },
];
