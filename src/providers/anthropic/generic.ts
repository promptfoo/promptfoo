import Anthropic from '@anthropic-ai/sdk';
import { getEnvString } from '../../envars';
import { sha256 } from '../../util/createHash';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';

/**
 * Base options shared by all Anthropic provider implementations
 */
interface AnthropicBaseOptions {
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

  getRateLimitKey(): string {
    const apiKey = this.getApiKey();
    const apiKeyHash = apiKey ? sha256(apiKey).slice(0, 8) : 'no-key';
    const baseUrl = this.getApiBaseUrl() || 'https://api.anthropic.com';
    let host = baseUrl;
    try {
      host = new URL(baseUrl).host;
    } catch {
      // Keep raw baseUrl when parsing fails.
    }
    return `anthropic:${this.modelName}:${host}:${apiKeyHash}`;
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

  /**
   * Base implementation - should be overridden by specific provider implementations
   */
  async callApi(_prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    throw new Error('Not implemented: callApi must be implemented by subclasses');
  }
}
