import { getEnvString } from '../../envars';
import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, ProviderOptions } from '../../types/providers';

const NVIDIA_NIM_API_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export class NvidiaProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    const explicitBaseUrl = providerOptions.config?.apiBaseUrl;
    const envBaseUrl =
      (providerOptions.env as Record<string, string | undefined> | undefined)
        ?.NVIDIA_API_BASE_URL || getEnvString('NVIDIA_API_BASE_URL');

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: explicitBaseUrl || envBaseUrl || NVIDIA_NIM_API_BASE_URL,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'NVIDIA_API_KEY',
      },
    });
  }

  id(): string {
    return `nvidia:${this.modelName}`;
  }

  toString(): string {
    return `[NVIDIA NIM Provider ${this.modelName}]`;
  }

  // Don't fall through to OPENAI_API_KEY: a misconfigured environment must
  // fail loudly rather than silently send an OpenAI key to NVIDIA.
  override getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || 'NVIDIA_API_KEY';
    return (
      this.config?.apiKey ||
      (this.env as EnvOverrides | undefined)?.[envar as keyof EnvOverrides] ||
      getEnvString(envar as EnvVarKey)
    );
  }

  // OpenAI-Organization is OpenAI-specific; it must not leak onto requests
  // sent to integrate.api.nvidia.com.
  override getOrganization(): string | undefined {
    return undefined;
  }

  // The base provider's getApiUrl() consults OPENAI_API_HOST / OPENAI_API_BASE_URL /
  // OPENAI_BASE_URL before config.apiBaseUrl, so an environment configured for an
  // OpenAI-compatible host would silently route nvidia:* requests there. The
  // constructor already merged NVIDIA_API_BASE_URL into config.apiBaseUrl, so we
  // only need to consult that.
  override getApiUrl(): string {
    return this.config.apiBaseUrl || NVIDIA_NIM_API_BASE_URL;
  }

  toJSON() {
    return {
      provider: 'nvidia',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createNvidiaProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');
  if (!modelName) {
    throw new Error(
      `Invalid NVIDIA NIM provider path: "${providerPath}" — expected "nvidia:<model>"`,
    );
  }

  const providerOptions: ProviderOptions = options.config ? { ...options.config } : {};
  if (options.env && !providerOptions.env) {
    providerOptions.env = options.env as ProviderOptions['env'];
  }
  if (options.id && !providerOptions.id) {
    providerOptions.id = options.id;
  }

  return new NvidiaProvider(modelName, providerOptions);
}
