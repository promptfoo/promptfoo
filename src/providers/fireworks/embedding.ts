import { OpenAiEmbeddingProvider } from '../openai/embedding';
import {
  buildFireworksProviderConfig,
  resolveFireworksApiKey,
  resolveFireworksApiUrl,
} from './shared';

import type { ProviderOptions } from '../../types/providers';

export class FireworksEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: buildFireworksProviderConfig(providerOptions.config, providerOptions.env),
    });
  }

  id(): string {
    return `fireworks:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[Fireworks AI Embedding Provider ${this.modelName}]`;
  }

  // Don't fall through to OPENAI_API_KEY: a misconfigured environment must fail
  // loudly rather than silently send an OpenAI key to Fireworks.
  override getApiKey(): string | undefined {
    return resolveFireworksApiKey(this.config, this.env);
  }

  // OpenAI-Organization is OpenAI-specific; it must not leak onto Fireworks calls.
  override getOrganization(): string | undefined {
    return undefined;
  }

  override getApiUrl(): string {
    return resolveFireworksApiUrl(this.config);
  }
}
