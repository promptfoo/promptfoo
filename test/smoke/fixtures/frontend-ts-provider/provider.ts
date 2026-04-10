// @ts-expect-error The fixture tsconfig supplies this alias at smoke-test runtime.
import { formatOutput } from '@/utils';
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';

// biome-ignore lint/style/noEnum: This fixture verifies TypeScript enums load in custom providers.
enum Mode {
  Frontend = 'frontend enum',
}

export default class FrontendTsProvider implements ApiProvider {
  private providerId: string;

  constructor(options: ProviderOptions) {
    this.providerId = options?.id || 'frontend-ts-provider';
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    return {
      output: `${Mode.Frontend}: ${formatOutput(prompt)}`,
    };
  }
}
