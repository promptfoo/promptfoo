import { type EnvVarKey, getEnvString } from '../envars';
import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const EVOLINK_API_BASE_URL = 'https://direct.evolink.ai/v1';
const EVOLINK_API_KEY_ENV_VAR = 'EVOLINK_API_KEY';
const EVOLINK_DEFAULT_MODEL = 'evolink/auto';

/**
 * EvoLink provider for its OpenAI-compatible chat completions endpoint.
 */
export class EvoLinkProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || EVOLINK_API_BASE_URL,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || EVOLINK_API_KEY_ENV_VAR,
      },
    });
  }

  id(): string {
    return `evolink:${this.modelName}`;
  }

  toString(): string {
    return `[EvoLink Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'evolink',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }

  getApiKey(): string | undefined {
    const envar = this.config?.apiKeyEnvar || EVOLINK_API_KEY_ENV_VAR;
    return (
      this.config.apiKey ||
      this.env?.[envar as keyof EnvOverrides] ||
      getEnvString(envar as EnvVarKey)
    );
  }

  getOrganization(): undefined {
    return undefined;
  }

  getApiUrl(): string {
    return this.config.apiBaseUrl || EVOLINK_API_BASE_URL;
  }

  protected getMissingApiKeyErrorMessage(): string {
    return `API key is not set. Set the ${this.config.apiKeyEnvar || EVOLINK_API_KEY_ENV_VAR} environment variable or add \`apiKey\` to the provider config.`;
  }

  protected getGenAISystem(): string {
    return 'evolink';
  }
}

export function createEvoLinkProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName =
    (splits[1] === 'chat' ? splits.slice(2).join(':') : splits.slice(1).join(':')) ||
    EVOLINK_DEFAULT_MODEL;

  const providerOptions: ProviderOptions = options.config ? { ...options.config } : {};
  if (options.env && !providerOptions.env) {
    providerOptions.env = options.env;
  }
  if (options.id && !providerOptions.id) {
    providerOptions.id = options.id;
  }

  return new EvoLinkProvider(modelName, providerOptions);
}
