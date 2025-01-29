import type { ProviderOptions } from '../types/providers';
import { OpenAiChatCompletionProvider, type OpenAiCompletionOptions } from './openai';

type JfrogMlCompletionOptions = OpenAiCompletionOptions & {
  baseUrl?: string;
};

type JfrogMlProviderOptions = ProviderOptions & {
  config?: JfrogMlCompletionOptions;
};

export class JfrogMlChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: JfrogMlProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'QWAK_TOKEN',
        apiBaseUrl: `${providerOptions.config?.baseUrl || 'https://models.qwak-prod.qwak.ai/v1'}/${modelName}`,
      },
    });
  }
}
