import type { ApiProvider, ProviderOptions, ProviderResponse } from '../types/providers';

export class EchoProvider implements ApiProvider {
  private options: ProviderOptions;

  constructor(options: ProviderOptions = {}) {
    this.options = options;
    this.id = options.id ? () => options.id! : this.id;
  }

  id(): string {
    return 'echo';
  }

  toString(): string {
    return '[Echo Provider]';
  }

  async callApi(
    input: string,
    options?: Record<string, any>,
    context?: any,
  ): Promise<ProviderResponse> {
    const response: ProviderResponse = {
      output: input,
      raw: input,
      cost: 0,
      cached: false,
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
      },
      isRefusal: false,
      metadata: context?.metadata || {},
    };

    return response;
  }
}
