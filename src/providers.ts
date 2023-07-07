import path from 'node:path';

import { ApiProvider, ProviderConfig, ProviderId, RawProviderConfig } from './types';

import { OpenAiCompletionProvider, OpenAiChatCompletionProvider } from './providers/openai';
import { LocalAiCompletionProvider, LocalAiChatProvider } from './providers/localai';
import { ScriptCompletionProvider } from './providers/scriptCompletion';

export async function loadApiProviders(
  providerPaths: ProviderId | ProviderId[] | RawProviderConfig[],
  basePath?: string,
): Promise<ApiProvider[]> {
  if (typeof providerPaths === 'string') {
    return [await loadApiProvider(providerPaths, undefined, basePath)];
  } else if (Array.isArray(providerPaths)) {
    return Promise.all(
      providerPaths.map((provider) => {
        if (typeof provider === 'string') {
          return loadApiProvider(provider, undefined, basePath);
        } else {
          const id = Object.keys(provider)[0];
          const context = { ...provider[id], id };
          return loadApiProvider(id, context, basePath);
        }
      }),
    );
  }
  throw new Error('Invalid providers list');
}

export async function loadApiProvider(
  providerPath: string,
  context?: ProviderConfig,
  basePath?: string,
): Promise<ApiProvider> {
  if (providerPath?.startsWith('script:')) {
    // Load script module
    const scriptPath = providerPath.split(':')[1];
    return new ScriptCompletionProvider(scriptPath, {id: `script:${scriptPath}`, config: {basePath}});
  } else if (providerPath?.startsWith('openai:')) {
    // Load OpenAI module
    const options = providerPath.split(':');
    const modelType = options[1];
    const modelName = options[2];

    if (modelType === 'chat') {
      return new OpenAiChatCompletionProvider(
        modelName || 'gpt-3.5-turbo',
        undefined,
        context?.config,
      );
    } else if (modelType === 'completion') {
      return new OpenAiCompletionProvider(
        modelName || 'text-davinci-003',
        undefined,
        context?.config,
      );
    } else if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelType)) {
      return new OpenAiChatCompletionProvider(modelType, undefined, context?.config);
    } else if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelType)) {
      return new OpenAiCompletionProvider(modelType, undefined, context?.config);
    } else {
      throw new Error(
        `Unknown OpenAI model type: ${modelType}. Use one of the following providers: openai:chat:<model name>, openai:completion:<model name>`,
      );
    }
  }

  if (providerPath?.startsWith('localai:')) {
    const options = providerPath.split(':');
    const modelType = options[1];
    const modelName = options[2];

    if (modelType === 'chat') {
      return new LocalAiChatProvider(modelName);
    } else if (modelType === 'completion') {
      return new LocalAiCompletionProvider(modelName);
    } else {
      return new LocalAiChatProvider(modelType);
    }
  }

  // Load custom module
  const CustomApiProvider = (await import(path.join(process.cwd(), providerPath))).default;
  return new CustomApiProvider(context);
}

export default {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  loadApiProvider,
};
