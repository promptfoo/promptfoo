/**
 * TypeScript provider class (3.3.1)
 *
 * Uses inline types to avoid depcheck issues with 'promptfoo' import.
 * In real usage, you would import from 'promptfoo':
 * import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';
 */

interface ProviderOptions {
  id?: string;
  config?: Record<string, unknown>;
}

interface ProviderResponse {
  output: string;
  tokenUsage?: {
    total: number;
    prompt: number;
    completion: number;
  };
}

interface ApiProvider {
  id(): string;
  callApi(prompt: string): Promise<ProviderResponse>;
}

export default class EchoTsProvider implements ApiProvider {
  private providerId: string;
  public config: Record<string, unknown>;

  constructor(options: ProviderOptions) {
    this.providerId = options?.id || 'echo-ts';
    this.config = options?.config || {};
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    return {
      output: `TypeScript Echo: ${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
    };
  }
}
