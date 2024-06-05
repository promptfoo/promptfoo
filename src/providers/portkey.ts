import { OpenAiChatCompletionProvider } from './openai';

import type { ProviderOptions } from '../types';

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    const headers = [
      {
        key: 'x-portkey-api-key',
        value: process.env.PORTKEY_API_KEY || providerOptions.config?.portkeyApiKey,
      },
      {
        key: 'x-portkey-virtual-key',
        value: process.env.PORTKEY_VIRTUAL_KEY || providerOptions.config?.portkeyVirtualKey,
      },
      {
        key: 'x-portkey-metadata',
        value:
          process.env.PORTKEY_METADATA ||
          (providerOptions.config?.portkeyMetadata
            ? JSON.stringify(providerOptions.config?.portkeyMetadata)
            : undefined),
      },
      {
        key: 'x-portkey-config',
        value: process.env.PORTKEY_CONFIG || providerOptions.config?.portkeyConfig,
      },
      {
        key: 'x-portkey-provider',
        value: process.env.PORTKEY_PROVIDER || providerOptions.config?.portkeyProvider,
      },
    ].reduce((acc: Record<string, string>, { key, value }) => {
      if (value) acc[key] = value;
      return acc;
    }, {});

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl:
          process.env.PORTKEY_API_BASE_URL ||
          providerOptions.config?.portkeyApiBaseUrl ||
          'https://api.portkey.ai/v1',
        headers,
      },
    });
  }
}
