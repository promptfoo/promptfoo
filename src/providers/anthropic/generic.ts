import Anthropic from '@anthropic-ai/sdk';
import { getEnvString } from '../../envars';
import type { ApiProvider, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';

/**
 * Base options shared by all Anthropic provider implementations
 */
export interface AnthropicBaseOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  headers?: Record<string, string>;
  cost?: number;
}

/**
 * Generic provider class for Anthropic APIs
 * Serves as a base class with shared functionality for all Anthropic providers
 */
export class AnthropicGenericProvider implements ApiProvider {
  modelName: string;
  config: AnthropicBaseOptions;
  env?: EnvOverrides;
  apiKey?: string;
  anthropic: Anthropic;

  constructor(
    modelName: string,
    options: {
      config?: AnthropicBaseOptions;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.apiKey = this.getApiKey();
    this.anthropic = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.getApiBaseUrl(),
    });
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `anthropic:${this.modelName}`;
  }

  toString(): string {
    return `[Anthropic Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  getApiBaseUrl(): string | undefined {
    return (
      this.config?.apiBaseUrl || this.env?.ANTHROPIC_BASE_URL || getEnvString('ANTHROPIC_BASE_URL')
    );
  }

  /**
   * Base implementation - should be overridden by specific provider implementations
   */
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented: callApi must be implemented by subclasses');
  }
}
