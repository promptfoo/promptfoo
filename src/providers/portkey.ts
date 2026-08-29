import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
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

/**
 * Portkey's own credential. It belongs in `x-portkey-api-key`; the `Authorization` bearer
 * is reserved for an upstream provider credential that Portkey forwards.
 */
function resolvePortkeyApiKey(config: PortkeyConfig = {}, env?: EnvOverrides): string | undefined {
  return config.portkeyApiKey || getEnvString('PORTKEY_API_KEY') || env?.PORTKEY_API_KEY;
}

/**
 * True when Portkey itself holds the upstream provider credential — a model catalog slug
 * (`@provider/model`) or a legacy virtual key — so there is no provider key to forward.
 */
function usesManagedCredentials(modelName: string, config: PortkeyConfig = {}): boolean {
  return (
    Boolean(config.portkeyVirtualKey) ||
    Boolean(config.portkeyProvider?.startsWith('@')) ||
    modelName.startsWith('@')
  );
}

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: PortkeyProviderOptions) {
    const portkeyApiKey = resolvePortkeyApiKey(providerOptions.config, providerOptions.env);
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'PORTKEY_API_KEY',
        // Portkey authenticates with x-portkey-api-key, so a bearer token is only required
        // when forwarding an upstream provider credential.
        apiKeyRequired: providerOptions.config?.apiKeyRequired ?? !portkeyApiKey,
        apiBaseUrl:
          getEnvString('PORTKEY_API_BASE_URL') ||
          providerOptions.config?.portkeyApiBaseUrl ||
          'https://api.portkey.ai/v1',
        headers: {
          ...(portkeyApiKey && { 'x-portkey-api-key': portkeyApiKey }),
          ...getPortkeyHeaders(providerOptions.config),
        },
      },
    });
  }

  /**
   * Resolves the `Authorization` bearer, which Portkey forwards to the upstream provider.
   * The inherited implementation returned the Portkey key here (leaving Portkey's own
   * header unset) and otherwise fell back to `OPENAI_API_KEY`, sending an OpenAI key to
   * the gateway even when Portkey already held the provider credential.
   */
  getApiKey(): string | undefined {
    const config = this.config as PortkeyConfig;
    if (config.apiKey) {
      return config.apiKey;
    }
    if (usesManagedCredentials(this.modelName, config)) {
      return undefined;
    }
    return this.env?.OPENAI_API_KEY || getEnvString('OPENAI_API_KEY');
  }
}
