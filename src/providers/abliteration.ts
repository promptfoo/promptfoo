import { getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';

const ABLITERATION_API_BASE_URL = 'https://api.abliteration.ai/v1';
const ABLITERATION_API_BASE_URL_ENV_VAR = 'ABLIT_API_BASE_URL';

function normalizeApiBaseUrl(apiBaseUrl?: string): string | undefined {
  const trimmedApiBaseUrl = apiBaseUrl?.trim();
  return trimmedApiBaseUrl ? trimmedApiBaseUrl : undefined;
}

export class AbliterationProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl:
          normalizeApiBaseUrl(providerOptions.config?.apiBaseUrl) ??
          normalizeApiBaseUrl(providerOptions.env?.ABLIT_API_BASE_URL) ??
          normalizeApiBaseUrl(getEnvString(ABLITERATION_API_BASE_URL_ENV_VAR)) ??
          ABLITERATION_API_BASE_URL,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar ?? 'ABLIT_KEY',
        showThinking: providerOptions.config?.showThinking ?? false,
      },
    });
  }

  override getApiKey(): string | undefined {
    const apiKeyEnvar = this.config.apiKeyEnvar as EnvVarKey | undefined;
    return (
      this.config.apiKey ||
      (apiKeyEnvar
        ? this.env?.[apiKeyEnvar as keyof EnvOverrides] || getEnvString(apiKeyEnvar)
        : undefined)
    );
  }

  override getOrganization(): undefined {
    return undefined;
  }

  id(): string {
    return `abliteration:${this.modelName}`;
  }

  toString(): string {
    return `[Abliteration Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'abliteration',
      model: this.modelName,
      config: {
        ...this.config,
        apiKey: undefined,
      },
    };
  }
}

export function createAbliterationProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits[1] === 'chat' ? splits.slice(2).join(':') : splits.slice(1).join(':');

  if (!modelName) {
    throw new Error(
      'Abliteration provider requires a model name. Use format: abliteration:<model_name> or abliteration:chat:<model_name>',
    );
  }

  const providerOptions = options.config || {};

  return new AbliterationProvider(modelName, {
    ...providerOptions,
    id: options.id ?? providerOptions.id,
    env: providerOptions.env ?? options.env,
  });
}
