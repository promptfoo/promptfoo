import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type PortkeyConfig = OpenAiCompletionOptions & {
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

interface PortkeyProviderOptions extends ProviderOptions {
  config?: PortkeyConfig;
}

const PORTKEY_CONFIG_PREFIX = 'portkey';

/**
 * `portkey*` config keys that configure promptfoo rather than the gateway, and so must not
 * be forwarded as `x-portkey-*` headers.
 */
const LOCAL_ONLY_PORTKEY_KEYS = new Set(['portkeyApiBaseUrl']);

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Builds the `x-portkey-*` headers from `portkey*` config keys.
 *
 * Only `portkey`-prefixed keys become headers. Everything else in the provider config is
 * either a request body parameter (`max_tokens`) or promptfoo bookkeeping (`basePath`), and
 * forwarding those to the gateway leaked local state and could produce invalid header values.
 * Use `config.headers` to send additional headers.
 */
export function getPortkeyHeaders(config: Record<string, any> = {}): Record<string, string> {
  const headers = Object.entries(config).reduce((acc: Record<string, string>, [key, value]) => {
    if (
      value == null ||
      !key.startsWith(PORTKEY_CONFIG_PREFIX) ||
      LOCAL_ONLY_PORTKEY_KEYS.has(key)
    ) {
      return acc;
    }
    const headerKey = `x-portkey-${toKebabCase(key.substring(PORTKEY_CONFIG_PREFIX.length))}`;
    acc[headerKey] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return acc;
  }, {});

  return { ...headers, ...config.headers };
}

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: PortkeyProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'PORTKEY_API_KEY',
        apiBaseUrl:
          getEnvString('PORTKEY_API_BASE_URL') ||
          providerOptions.config?.portkeyApiBaseUrl ||
          'https://api.portkey.ai/v1',
        headers: getPortkeyHeaders(providerOptions.config),
      },
    });
  }

  /**
   * Resolves the bearer token from Portkey credentials only. The inherited implementation
   * falls back to `OPENAI_API_KEY`, which would send an OpenAI key to the Portkey gateway
   * (or to whatever host `portkeyApiBaseUrl` points at).
   */
  getApiKey(): string | undefined {
    const config = this.config as PortkeyConfig;
    return (
      config.portkeyApiKey ||
      config.apiKey ||
      getEnvString('PORTKEY_API_KEY') ||
      this.env?.PORTKEY_API_KEY
    );
  }
}
