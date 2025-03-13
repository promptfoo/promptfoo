import type { ApiProvider, ProviderOptions, ProviderResponse } from '../types/providers';
import { sleep } from '../util/time';

export class EchoProvider implements ApiProvider {
  private options: ProviderOptions;

  public label?: string;
  public config?: any;
  public delay?: number;

  constructor(options: ProviderOptions = {}) {
    this.options = options;
    this.id = options.id ? () => options.id! : this.id;
    this.label = options.label;
    this.config = options.config;
    this.delay = options.delay;
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
    if (this.delay && this.delay > 0) {
      await sleep(this.delay);
    }

    // Create a complete ProviderResponse object
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
