import { getEnvString } from '../../envars';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { OpenAiSharedOptions, OpenAiModelsResponse } from './types';

export class OpenAiGenericProvider implements ApiProvider {
  modelName: string;

  config: OpenAiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: OpenAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return this.config.apiHost || this.config.apiBaseUrl
      ? this.modelName
      : `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      this.env?.OPENAI_ORGANIZATION ||
      getEnvString('OPENAI_ORGANIZATION')
    );
  }

  getApiUrlDefault(): string {
    return 'https://api.openai.com/v1';
  }

  getApiUrl(): string {
    const apiHost =
      this.config.apiHost || this.env?.OPENAI_API_HOST || getEnvString('OPENAI_API_HOST');
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.OPENAI_API_BASE_URL ||
      this.env?.OPENAI_BASE_URL ||
      getEnvString('OPENAI_API_BASE_URL') ||
      getEnvString('OPENAI_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar as keyof EnvOverrides) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.OPENAI_API_KEY ||
      getEnvString('OPENAI_API_KEY')
    );
  }

  async getAvailableModels(): Promise<OpenAiModelsResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const organization = this.getOrganization();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      ...this.config.headers,
    };

    if (organization) {
      headers['OpenAI-Organization'] = organization;
    }

    const response = await fetch(`${this.getApiUrl()}/models`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(`Failed to fetch models: ${error?.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}
