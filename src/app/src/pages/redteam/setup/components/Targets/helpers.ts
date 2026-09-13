import { getProviderInitialConfig } from './providerInitialConfig';

type LocalOpenAiProviderType = 'llamafile' | 'vllm' | 'text-generation-webui';

export function isOpenAiChatProviderId(providerId?: string): boolean {
  return providerId === 'openai:chat' || providerId?.startsWith('openai:chat:') === true;
}

export function isLocalOpenAiProviderType(type: unknown): type is LocalOpenAiProviderType {
  return type === 'llamafile' || type === 'vllm' || type === 'text-generation-webui';
}

export function hasCustomOpenAiBaseUrl(config?: Record<string, unknown>): boolean {
  const baseUrl = config?.apiHost ? `https://${config.apiHost}/v1` : config?.apiBaseUrl;
  return (
    typeof baseUrl === 'string' &&
    baseUrl.trim().length > 0 &&
    baseUrl.trim().replace(/\/+$/, '') !== 'https://api.openai.com/v1'
  );
}

export function withLocalProviderType(
  providerId: string | undefined,
  config: Record<string, unknown>,
  providerType?: string,
): Record<string, unknown> {
  // The runtime ID identifies the protocol; retain the local editor choice in
  // the config, as we already do for WebSocket targets. It is not a model option.
  return isOpenAiChatProviderId(providerId) && isLocalOpenAiProviderType(providerType)
    ? {
        apiKeyRequired: false,
        ...config,
        useDefaultApiKey:
          typeof config.useDefaultApiKey === 'boolean' ||
          typeof config.useDefaultApiKey === 'string'
            ? config.useDefaultApiKey
            : false,
        type: providerType,
        // A complete JSON replacement must not fall back to OpenAI's ambient endpoint.
        apiBaseUrl:
          typeof config.apiBaseUrl === 'string' && config.apiBaseUrl.trim()
            ? config.apiBaseUrl
            : getProviderInitialConfig(providerType)?.config.apiBaseUrl,
      }
    : config;
}

const PROVIDER_OPTION_KEYS = new Set([
  'id',
  'label',
  'config',
  'prompts',
  'transform',
  'delay',
  'env',
  'inputs',
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isProviderOptionsMap = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  Object.keys(value).some((key) => !PROVIDER_OPTION_KEYS.has(key)) &&
  Object.values(value).every(isRecord);

// Preserve editable selector strings so persistence can redact their references.
// Runtime requests accept only an explicit boolean opt-in to ambient credentials.
export function normalizeLocalProviders<T>(
  providers: T,
  { forRuntime = false }: { forRuntime?: boolean } = {},
): T {
  const normalizeOptions = (provider: unknown, id?: string): unknown => {
    if (!isRecord(provider) || !isRecord(provider.config)) {
      return provider;
    }
    const config = withLocalProviderType(
      id ?? (typeof provider.id === 'string' ? provider.id : undefined),
      provider.config,
      typeof provider.config.type === 'string' ? provider.config.type : undefined,
    );
    if (config === provider.config) {
      return provider;
    }
    return {
      ...provider,
      config: forRuntime
        ? { ...config, useDefaultApiKey: config.useDefaultApiKey === true }
        : config,
    };
  };
  const normalize = (provider: unknown): unknown =>
    isProviderOptionsMap(provider)
      ? Object.fromEntries(
          Object.entries(provider).map(([id, options]) => [id, normalizeOptions(options, id)]),
        )
      : normalizeOptions(provider);
  return (Array.isArray(providers) ? providers.map(normalize) : normalize(providers)) as T;
}

export function getProviderType(
  providerId?: string,
  config?: Record<string, unknown>,
): string | undefined {
  if (!providerId) {
    return undefined;
  }

  if (providerId === 'openai:codex-security' || providerId.startsWith('openai:codex-security:')) {
    return 'codex-security';
  }

  if (providerId.startsWith('bedrock:agents:')) {
    return 'bedrock-agent';
  }

  if (isOpenAiChatProviderId(providerId)) {
    if (isLocalOpenAiProviderType(config?.type)) {
      return config.type;
    }
    // Older compatible-server configs have no UI type. Keep every server option
    // editable without guessing the server product from its hostname or port.
    if (hasCustomOpenAiBaseUrl(config)) {
      return 'custom';
    }
  }

  if (providerId.startsWith('file://')) {
    if (/\.(js|ts)(?::[^/\\]+)?$/i.test(providerId)) {
      return 'javascript';
    }
    if (/\.py(?::[^/\\]+)?$/i.test(providerId)) {
      return 'python';
    }
    if (/\.go(?::[^/\\]+)?$/i.test(providerId)) {
      return 'go';
    }
    if (/\.(sh|bat|cmd|ps1)(?::[^/\\]+)?$/i.test(providerId)) {
      return 'shell';
    }
    return 'file';
  }

  // Handle provider formats like 'openrouter:openai/gpt-5.4' or 'azure:chat:'
  const providerType = providerId.includes(':') ? providerId.split(':')[0] : providerId;
  if (providerType === 'https') {
    return 'http';
  }
  if (providerType === 'ws' || providerType === 'wss') {
    return 'websocket';
  }

  // Runtime provider prefixes can differ from the target selector's UI types.
  if (providerType === 'togetherai') {
    return 'together';
  }
  if (providerType === 'llama') {
    return 'llama.cpp';
  }

  return providerType;
}
