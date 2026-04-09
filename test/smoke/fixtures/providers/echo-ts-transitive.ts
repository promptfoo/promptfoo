import { formatTransitiveEcho } from './echo-ts-transitive-helper';

interface ProviderOptions {
  id?: string;
}

interface ProviderResponse {
  output: string;
}

export default class EchoTsTransitiveProvider {
  private providerId: string;

  constructor(options: ProviderOptions) {
    this.providerId = options?.id || 'echo-ts-transitive';
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    return {
      output: formatTransitiveEcho(prompt),
    };
  }
}
