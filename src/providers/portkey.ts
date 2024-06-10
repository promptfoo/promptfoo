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
    portkeyForwardHeaders?: string[];
    portkeyApiBaseUrl?: string;
    portkeyAzureResourceName?: string;
    portkeyAzureDeploymentId?: string;
    portkeyAzureApiVersion?: string;
    portkeyVertexProjectId?: string;
    portkeyVertexRegion?: string;
    portkeyAwsSecretAccessKey?: string;
    portkeyAwsRegion?: string;
    portkeyAwsSessionToken?: string;
    [key: string]: any;
  };
}

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: PortkeyProviderOptions) {
    const headers = Object.entries(providerOptions.config || {}).reduce(
      (acc: Record<string, string>, [key, value]) => {
        if (value) {
          const headerKey = key.startsWith('portkey')
            ? `x-${key.replace(/^portkey/, 'portkey-').toLowerCase()}`
            : key;
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
        headers,
      },
    });
  }
}
