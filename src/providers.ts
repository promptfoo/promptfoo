import path from 'node:path';

import { ApiProvider } from './types';

import { OpenAiCompletionProvider, OpenAiChatCompletionProvider } from './providers/openai';
import { LocalAiCompletionProvider, LocalAiChatProvider } from './providers/localai';

export async function loadApiProviders(providerPaths: string | string[]): Promise<ApiProvider[]> {
  if (typeof providerPaths === 'string') {
    return [await loadApiProvider(providerPaths)];
  } else if (Array.isArray(providerPaths)) {
    return Promise.all(providerPaths.map((provider) => loadApiProvider(provider)));
  }
  throw new Error('Invalid providers list');
}

export async function loadApiProvider(providerPath: string): Promise<ApiProvider> {
  if (providerPath?.startsWith('openai:')) {
    // Load OpenAI module
    const options = providerPath.split(':');
    const modelType = options[1];
    const modelName = options[2];

    if (modelType === 'chat') {
      return new OpenAiChatCompletionProvider(modelName || 'gpt-3.5-turbo');
    } else if (modelType === 'completion') {
      return new OpenAiCompletionProvider(modelName || 'text-davinci-003');
    } else if (OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelType)) {
      return new OpenAiChatCompletionProvider(modelType);
    } else if (OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelType)) {
      return new OpenAiCompletionProvider(modelType);
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
  return new CustomApiProvider();
}

export default {
  OpenAiCompletionProvider,
  OpenAiChatCompletionProvider,
  LocalAiCompletionProvider,
  LocalAiChatProvider,
  loadApiProvider,
};
