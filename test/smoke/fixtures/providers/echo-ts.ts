/**
 * TypeScript provider class (3.3.1)
 */
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';

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
