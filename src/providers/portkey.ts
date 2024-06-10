import { OpenAiChatCompletionProvider } from './openai';

import type { ProviderOptions } from '../types';

interface PortkeyProviderOptions extends ProviderOptions {
  config?: {
    portkeyApiKey?: string;
    portkeyVirtualKey?: string;
    portkeyMetadata?: Record<string, any>;
    portkeyConfig?: string;
    portkeyProvider?: string;
    portkeyCustomHost?: string;
    portkeyTraceId?: string;
    portkeyCacheForceRefresh?: boolean;
    portkeyCacheNamespace?: string;
    portkeyForwardHeaders?: string;
    portkeyTraceId?: string;
    portkeyApiBaseUrl?: string;
  };
}

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: PortkeyProviderOptions) {
    const portkeyHeaders = Object.entries(providerOptions.config || {})
      .filter(([key]) => key.startsWith('portkey'))
      .reduce((acc: Record<string, string>, [key, value]) => {
        if (value) {
          const headerKey = `x-${key.replace(/^portkey/, 'portkey-').toLowerCase()}`;
          acc[headerKey] = typeof value === 'object' ? JSON.stringify(value) : value;
        }
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
        headers: portkeyHeaders,
      },
    });
  }
}
