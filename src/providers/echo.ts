import { sleep, sleepWithAbort } from '../util/time';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

export class EchoProvider implements ApiProvider {
  private options: ProviderOptions;

  public label?: string;
  public config?: any;
  public delay?: number;
  readonly handlesOwnDelay = true;

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
    context?: Partial<CallApiContextParams> & { metadata?: Record<string, unknown> },
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const signal = options?.abortSignal;
    signal?.throwIfAborted();
    if (this.delay && this.delay > 0) {
      await (signal ? sleepWithAbort(this.delay, signal) : sleep(this.delay));
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
        numRequests: 1,
      },
      isRefusal: false,
      metadata: context?.metadata || {},
    };

    return response;
  }
}
