import type { ProviderOptions } from '../types';
import { OpenAiChatCompletionProvider, type OpenAiCompletionOptions } from './openai';

interface PortkeyProviderOptions extends ProviderOptions {
  config?: OpenAiCompletionOptions & {
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
    portkeyAwsAccessKeyId?: string;
    [key: string]: any;
  };
}

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function getPortkeyHeaders(config: Record<string, any> = {}): Record<string, string> {
  return Object.entries(config).reduce((acc: Record<string, string>, [key, value]) => {
    if (value != null) {
      const headerKey = key.startsWith('portkey')
        ? `x-portkey-${toKebabCase(key.substring(7))}`
        : key;
      acc[headerKey] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    return acc;
  }, {});
}

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: PortkeyProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'PORTKEY_API_KEY',
        apiBaseUrl:
          process.env.PORTKEY_API_BASE_URL ||
          providerOptions.config?.portkeyApiBaseUrl ||
          'https://api.portkey.ai/v1',
        headers: getPortkeyHeaders(providerOptions.config),
      },
    });
  }
}
