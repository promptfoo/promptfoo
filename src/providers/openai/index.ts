import { getEnvString } from '../../envars';
import { sha256 } from '../../util/createHash';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

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
        ? getEnvString(this.config.apiKeyEnvar as EnvVarKey) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.OPENAI_API_KEY ||
      getEnvString('OPENAI_API_KEY')
    );
  }

  getRateLimitKey(): string {
    const apiKey = this.getApiKey();
    const apiKeyHash = apiKey ? sha256(apiKey).slice(0, 8) : 'no-key';
    const org = this.getOrganization();
    const orgHash = org ? sha256(org).slice(0, 8) : 'no-org';
    const apiUrl = this.getApiUrl();
    let host = apiUrl;
    try {
      host = new URL(apiUrl).host;
    } catch {
      // Keep raw apiUrl when parsing fails.
    }
    return `openai:${this.modelName}:${host}:${orgHash}:${apiKeyHash}`;
  }

  getInitialLimits(): { rpm?: number; tpm?: number; maxConcurrent?: number } {
    const config = this.config as {
      rateLimit?: { rpm?: number; tpm?: number; maxConcurrent?: number };
      maxConcurrency?: number;
      maxConcurrent?: number;
      rpm?: number;
      tpm?: number;
    };
    return {
      rpm: config.rateLimit?.rpm ?? config.rpm,
      tpm: config.rateLimit?.tpm ?? config.tpm,
      maxConcurrent: config.rateLimit?.maxConcurrent ?? config.maxConcurrent ?? config.maxConcurrency,
    };
  }

  requiresApiKey(): boolean {
    return this.config.apiKeyRequired ?? true;
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    _prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}
