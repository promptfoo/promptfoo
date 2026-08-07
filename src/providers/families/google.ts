import type { ProviderFactory } from '../registryTypes';

const GEMINI_ROBOTICS_STANDARD_MODEL = 'gemini-robotics-er-2-preview';

function isLiveOnlyModel(modelName: string): boolean {
  return (
    modelName === 'gemini-3.5-live-translate-preview' ||
    modelName.startsWith('gemini-robotics-er-2-streaming-')
  );
}

function validateGoogleModelRoute(modelName: string, serviceType?: string): void {
  if (isLiveOnlyModel(modelName) && serviceType !== 'live') {
    throw new Error(
      `Model "${modelName}" requires the Gemini Live API. Use google:live:${modelName}.`,
    );
  }
  if (
    modelName === GEMINI_ROBOTICS_STANDARD_MODEL &&
    serviceType !== undefined &&
    serviceType !== 'chat'
  ) {
    throw new Error(
      `Model "${modelName}" uses the standard Gemini Interactions API. Use google:${modelName} or vertex:${modelName}.`,
    );
  }
}

// Every provider class is imported lazily inside its factory so that merely
// loading this family module (which happens on any `vertex:`/`google:`/`palm:`
// lookup) stays cheap: a given path pulls in only the provider it actually
// constructs, never the whole Google provider surface.
export const googleProviderFactories: ProviderFactory[] = [
  {
    test: (providerPath: string) => providerPath.startsWith('vertex:'),
    create: async (providerPath, providerOptions, context) => {
      const splits = providerPath.split(':');
      const firstPart = splits[1];
      if (firstPart === 'live') {
        const modelName = splits.slice(2).join(':');
        validateGoogleModelRoute(modelName, firstPart);
        throw new Error(
          `Vertex AI does not support the Gemini Live API. Use google:live:${modelName}.`,
        );
      }
      if (firstPart === 'image') {
        const modelName = splits.slice(2).join(':');
        validateGoogleModelRoute(modelName, firstPart);
        throw new Error(
          `Vertex AI image generation is not supported. Use google:image:${modelName}.`,
        );
      }
      const explicitServiceType = ['chat', 'video', 'embedding', 'embeddings'].includes(firstPart)
        ? firstPart
        : undefined;
      const routedModelName = explicitServiceType
        ? splits.slice(2).join(':')
        : splits.slice(1).join(':');
      validateGoogleModelRoute(routedModelName, explicitServiceType);
      const modelName =
        firstPart === 'chat' ? splits.slice(2).join(':') : splits.slice(1).join(':');
      if (
        modelName === 'gemini-omni-flash-preview' ||
        modelName === 'gemini-robotics-er-2-preview'
      ) {
        const { GoogleInteractionsProvider } = await import('../google/interactions');
        return new GoogleInteractionsProvider(modelName, {
          ...providerOptions,
          id: providerPath,
          env: providerOptions.env ?? context.env,
          config: {
            ...(context.basePath && { basePath: context.basePath }),
            ...providerOptions.config,
            vertexai: true,
          },
        });
      }
      if (firstPart === 'video') {
        const { GoogleVideoProvider } = await import('../google/video');
        const modelName = splits.slice(2).join(':');
        return new GoogleVideoProvider(modelName, {
          ...providerOptions,
          id: providerPath,
          config: {
            ...(context.basePath && { basePath: context.basePath }),
            ...providerOptions.config,
            vertexai: true,
          },
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
    create: async (providerPath, providerOptions, context) => {
      const splits = providerPath.split(':');

      if (splits.length >= 3) {
        const serviceType = splits[1];
        const modelName = splits.slice(2).join(':');
        if (modelName === GEMINI_ROBOTICS_STANDARD_MODEL && serviceType === 'chat') {
          const providerPrefix = splits[0];
          throw new Error(
            `Model "${modelName}" uses the standard Gemini Interactions API and does not support ${providerPrefix}:chat:. Use ${providerPrefix}:${modelName}.`,
          );
        }
        validateGoogleModelRoute(modelName, serviceType);

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
            config: {
              ...(context.basePath && { basePath: context.basePath }),
              ...providerOptions.config,
            },
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
      validateGoogleModelRoute(modelName);

      if (
        modelName === 'gemini-omni-flash-preview' ||
        modelName === 'gemini-robotics-er-2-preview'
      ) {
        const { GoogleInteractionsProvider } = await import('../google/interactions');
        return new GoogleInteractionsProvider(modelName, providerOptions);
      }

      // Check if this is a Gemini native image generation model. Dispatch is on
      // the '-image' substring (e.g., gemini-2.5-flash-image, gemini-3.1-flash-image,
      // gemini-3.1-flash-lite-image, gemini-3-pro-image).
      if (modelName.includes('-image')) {
        const { GeminiImageProvider } = await import('../google/gemini-image');
        return new GeminiImageProvider(modelName, providerOptions);
      }

      const { AIStudioChatProvider } = await import('../google/ai.studio');
      return new AIStudioChatProvider(modelName, providerOptions);
    },
  },
];
